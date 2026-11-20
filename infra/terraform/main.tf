# =====================================================================
# BancaGT - Propuesta C (híbrida): runtime local reproducible con IaC.
# Un solo `terraform apply` crea: clúster kind (1 control-plane + N workers)
# con Calico, almacenamiento S3 de respaldos fuera del clúster y toda la
# plataforma. Argo CD toma el control desde Git para lo demás.
# =====================================================================

locals {
  contexto = "kind-${var.cluster_name}"
  hosts = {
    banca   = "banca.${var.dominio}"
    argocd  = "argocd.${var.dominio}"
    grafana = "grafana.${var.dominio}"
    vault   = "vault.${var.dominio}"
  }
}

# ---------------------------------------------------------------------
# Clúster
# ---------------------------------------------------------------------
resource "kind_cluster" "banca" {
  name           = var.cluster_name
  wait_for_ready = false # los nodos quedan NotReady hasta que Calico instala la red

  kind_config {
    kind        = "Cluster"
    api_version = "kind.x-k8s.io/v1alpha4"

    networking {
      # kindnet NO aplica NetworkPolicy: se desactiva y se instala Calico.
      disable_default_cni = true
      pod_subnet          = "192.168.0.0/16"
    }

    node {
      role = "control-plane"
      # Traefik se publica como NodePort 30080/30443 y kind lo mapea a 80/443 del equipo.
      extra_port_mappings {
        container_port = 30080
        host_port      = 80
        listen_address = "127.0.0.1"
      }
      extra_port_mappings {
        container_port = 30443
        host_port      = 443
        listen_address = "127.0.0.1"
      }
    }

    dynamic "node" {
      for_each = range(var.trabajadores)
      content {
        role = "worker"
      }
    }
  }
}

# ---------------------------------------------------------------------
# Red: Calico (operador Tigera) con soporte de NetworkPolicy
# ---------------------------------------------------------------------
# Desde Calico 3.33 las CRDs se distribuyen aparte y superan el límite de 1 MiB
# que Helm admite para su estado; se aplican del manifiesto oficial (server-side).
resource "terraform_data" "calico_crds" {
  triggers_replace = [kind_cluster.banca.id, var.versiones.calico]

  provisioner "local-exec" {
    command = "kubectl --context ${local.contexto} apply --server-side --force-conflicts -f https://raw.githubusercontent.com/projectcalico/calico/${var.versiones.calico}/manifests/operator-crds.yaml"
  }
}

resource "helm_release" "calico" {
  depends_on       = [terraform_data.calico_crds]
  name             = "calico"
  repository       = "https://docs.tigera.io/calico/charts"
  chart            = "tigera-operator"
  version          = var.versiones.calico
  namespace        = "tigera-operator"
  create_namespace = true
  values           = [file("${path.module}/values/calico.yaml")]
}

# Espera a que todos los nodos tengan red antes de instalar lo demás.
resource "terraform_data" "nodos_listos" {
  depends_on       = [helm_release.calico]
  triggers_replace = [kind_cluster.banca.id]

  provisioner "local-exec" {
    command = "kubectl --context ${local.contexto} wait --for=condition=Ready nodes --all --timeout=600s"
  }
}

# DNS de horizonte dividido: dentro del clúster *.127.0.0.1.nip.io apunta a
# Traefik, así el monitoreo sintético entra por el mismo camino que un usuario.
resource "kubernetes_config_map_v1_data" "coredns" {
  depends_on = [terraform_data.nodos_listos]
  force      = true
  metadata {
    name      = "coredns"
    namespace = "kube-system"
  }
  data = {
    Corefile = <<-EOT
      .:53 {
          errors
          health {
             lameduck 5s
          }
          ready
          rewrite name regex (.+)\.${replace(var.dominio, ".", "\\.")} traefik.traefik.svc.cluster.local answer auto
          kubernetes cluster.local in-addr.arpa ip6.arpa {
             pods insecure
             fallthrough in-addr.arpa ip6.arpa
             ttl 30
          }
          prometheus :9153
          forward . /etc/resolv.conf {
             max_concurrent 1000
          }
          cache 30 {
             disable success cluster.local
             disable denial cluster.local
          }
          loop
          reload
          loadbalance
      }
    EOT
  }
}

# ---------------------------------------------------------------------
# Almacenamiento S3 de respaldos (SeaweedFS) FUERA del clúster.
# Vive en un volumen Docker propio: sobrevive aunque se destruya el clúster,
# lo que permite demostrar el DRP con recuperación total.
# ---------------------------------------------------------------------
resource "random_password" "s3_secret" {
  length  = 32
  special = false
}

resource "docker_volume" "respaldos" {
  name = "bancagt-respaldos"
  lifecycle {
    prevent_destroy = false
  }
}

resource "docker_image" "seaweedfs" {
  name         = "chrislusf/seaweedfs:${var.versiones.seaweedfs}"
  keep_locally = true
}

resource "docker_container" "s3" {
  name    = "bancagt-s3"
  image   = docker_image.seaweedfs.image_id
  restart = "unless-stopped"
  command = ["server", "-dir=/data", "-s3", "-s3.config=/etc/seaweedfs/s3.json"]

  # Misma red Docker que los nodos kind: los pods lo alcanzan como "bancagt-s3".
  networks_advanced {
    name = "kind"
  }

  ports {
    internal = 8333 # API S3
    external = 8333
    ip       = "127.0.0.1"
  }
  ports {
    internal = 8888 # consola web del filer (navegar buckets)
    external = 8888
    ip       = "127.0.0.1"
  }
  ports {
    internal = 9333 # consola del master (estado del almacenamiento)
    external = 9333
    ip       = "127.0.0.1"
  }

  volumes {
    volume_name    = docker_volume.respaldos.name
    container_path = "/data"
  }

  upload {
    file = "/etc/seaweedfs/s3.json"
    content = jsonencode({
      identities = [{
        name        = "bancagt"
        credentials = [{ accessKey = "bancagt", secretKey = random_password.s3_secret.result }]
        actions     = ["Admin", "Read", "Write", "List", "Tagging"]
      }]
    })
  }

  # Script que crea los buckets cuando SeaweedFS ya está listo.
  upload {
    file       = "/etc/seaweedfs/buckets.sh"
    executable = true
    content    = <<-EOT
      #!/bin/sh
      # Idempotente: solo crea los buckets que falten (se conservan los respaldos).
      for i in $(seq 1 40); do
        lista=$(echo 's3.bucket.list' | weed shell 2>/dev/null) || { sleep 3; continue; }
        for b in velero cnpg; do
          echo "$lista" | grep -q "^ *$b[[:space:]]" || echo "s3.bucket.create -name $b" | weed shell >/dev/null 2>&1
        done
        lista=$(echo 's3.bucket.list' | weed shell 2>/dev/null)
        if echo "$lista" | grep -q "^ *velero[[:space:]]" && echo "$lista" | grep -q "^ *cnpg[[:space:]]"; then
          echo "buckets listos"; exit 0
        fi
        sleep 3
      done
      exit 1
    EOT
  }

  depends_on = [kind_cluster.banca] # la red "kind" la crea el clúster
}

resource "terraform_data" "buckets" {
  depends_on       = [docker_container.s3]
  triggers_replace = [docker_container.s3.id]

  provisioner "local-exec" {
    command = "docker exec bancagt-s3 /etc/seaweedfs/buckets.sh"
  }
}
