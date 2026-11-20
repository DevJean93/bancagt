# =====================================================================
# HashiCorp Vault + configuración como código.
# Los secretos de la aplicación NUNCA están en Git: Terraform genera valores
# aleatorios, un Job los siembra en Vault y External Secrets los entrega a los
# pods. La siembra solo escribe si el secreto no existe, así no pisa rotaciones.
# =====================================================================

resource "random_password" "vault_root" {
  length  = 32
  special = false
}

resource "random_password" "db_app" {
  length  = 32
  special = false
}

# Par de llaves ECDSA P-256 para firmar sesiones (JWT ES256). Se siembra en
# Vault; la privada solo llega a api-identidad.
resource "tls_private_key" "jwt" {
  algorithm   = "ECDSA"
  ecdsa_curve = "P256"
}

resource "helm_release" "vault" {
  depends_on       = [terraform_data.nodos_listos]
  name             = "vault"
  repository       = "https://helm.releases.hashicorp.com"
  chart            = "vault"
  version          = var.versiones.vault
  namespace        = "vault"
  create_namespace = true
  values           = [file("${path.module}/values/vault.yaml")]
  set_sensitive = [{
    name  = "server.dev.devRootToken"
    value = random_password.vault_root.result
  }]
}

resource "kubernetes_secret_v1" "vault_semilla" {
  depends_on = [helm_release.vault]
  metadata {
    name      = "vault-semilla"
    namespace = "vault"
  }
  data = {
    VAULT_TOKEN      = random_password.vault_root.result
    SEED_DB_PASSWORD = random_password.db_app.result
    SEED_S3_SECRET   = random_password.s3_secret.result
    SEED_JWT_PRIVADA = tls_private_key.jwt.private_key_pem_pkcs8
    SEED_JWT_PUBLICA = tls_private_key.jwt.public_key_pem
  }
}

resource "kubernetes_config_map_v1" "vault_bootstrap" {
  depends_on = [helm_release.vault]
  metadata {
    name      = "vault-bootstrap"
    namespace = "vault"
  }
  data = {
    "bootstrap.sh" = file("${path.module}/files/vault-bootstrap.sh")
  }
}

locals {
  vault_pod_spec = {
    image = "hashicorp/vault:${var.versiones.vault_image}"
  }
}

# Ejecución inicial (Terraform espera a que termine).
resource "kubernetes_job_v1" "vault_bootstrap" {
  depends_on = [kubernetes_secret_v1.vault_semilla, kubernetes_config_map_v1.vault_bootstrap]
  metadata {
    name      = "vault-bootstrap-inicial"
    namespace = "vault"
  }
  spec {
    backoff_limit = 10
    template {
      metadata {}
      spec {
        restart_policy                  = "OnFailure"
        automount_service_account_token = false
        security_context {
          run_as_non_root = true
          run_as_user     = 100
          seccomp_profile { type = "RuntimeDefault" }
        }
        container {
          name    = "bootstrap"
          image   = local.vault_pod_spec.image
          command = ["/bin/sh", "/scripts/bootstrap.sh"]
          env_from {
            secret_ref { name = "vault-semilla" }
          }
          security_context {
            allow_privilege_escalation = false
            read_only_root_filesystem  = true
            capabilities { drop = ["ALL"] }
          }
          volume_mount {
            name       = "scripts"
            mount_path = "/scripts"
          }
          volume_mount {
            name       = "home"
            mount_path = "/home/vault"
          }
        }
        volume {
          name = "scripts"
          config_map { name = "vault-bootstrap" }
        }
        volume {
          name = "home"
          empty_dir {}
        }
      }
    }
  }
  wait_for_completion = true
  timeouts {
    create = "10m"
  }
}

# Reconciliación periódica: si el pod de Vault (modo dev) se reinicia, en
# menos de 5 minutos vuelve a quedar configurado sin intervención manual.
resource "kubernetes_cron_job_v1" "vault_bootstrap" {
  depends_on = [kubernetes_job_v1.vault_bootstrap]
  metadata {
    name      = "vault-bootstrap"
    namespace = "vault"
  }
  spec {
    schedule                      = "*/5 * * * *"
    concurrency_policy            = "Forbid"
    successful_jobs_history_limit = 1
    failed_jobs_history_limit     = 2
    job_template {
      metadata {}
      spec {
        backoff_limit = 2
        template {
          metadata {}
          spec {
            restart_policy                  = "Never"
            automount_service_account_token = false
            security_context {
              run_as_non_root = true
              run_as_user     = 100
              seccomp_profile { type = "RuntimeDefault" }
            }
            container {
              name    = "bootstrap"
              image   = local.vault_pod_spec.image
              command = ["/bin/sh", "/scripts/bootstrap.sh"]
              env_from {
                secret_ref { name = "vault-semilla" }
              }
              security_context {
                allow_privilege_escalation = false
                read_only_root_filesystem  = true
                capabilities { drop = ["ALL"] }
              }
              volume_mount {
                name       = "scripts"
                mount_path = "/scripts"
              }
              volume_mount {
                name       = "home"
                mount_path = "/home/vault"
              }
            }
            volume {
              name = "scripts"
              config_map { name = "vault-bootstrap" }
            }
            volume {
              name = "home"
              empty_dir {}
            }
          }
        }
      }
    }
  }
}
