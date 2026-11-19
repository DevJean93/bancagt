# =====================================================================
# Plataforma: cada componente es un helm_release con versión fijada.
# El orden lo dan los depends_on; todo cuelga de "nodos_listos".
# =====================================================================

# ----------------------------- Ingreso y TLS -----------------------------
resource "helm_release" "cert_manager" {
  depends_on       = [terraform_data.nodos_listos]
  name             = "cert-manager"
  repository       = "https://charts.jetstack.io"
  chart            = "cert-manager"
  version          = var.versiones.cert_manager
  namespace        = "cert-manager"
  create_namespace = true
  values           = [file("${path.module}/values/cert-manager.yaml")]
}

resource "helm_release" "traefik" {
  depends_on       = [terraform_data.nodos_listos]
  name             = "traefik"
  repository       = "https://traefik.github.io/charts"
  chart            = "traefik"
  version          = var.versiones.traefik
  namespace        = "traefik"
  create_namespace = true
  values           = [file("${path.module}/values/traefik.yaml")]
}

# ----------------------------- Observabilidad -----------------------------
resource "random_password" "grafana" {
  length  = 20
  special = false
}

resource "helm_release" "kps" {
  depends_on       = [terraform_data.nodos_listos]
  name             = "kps"
  repository       = "https://prometheus-community.github.io/helm-charts"
  chart            = "kube-prometheus-stack"
  version          = var.versiones.kps
  namespace        = "monitoring"
  create_namespace = true
  timeout          = 900
  values           = [file("${path.module}/values/kps.yaml")]
  set_sensitive = [{
    name  = "grafana.adminPassword"
    value = random_password.grafana.result
  }]
}

resource "helm_release" "loki" {
  depends_on       = [terraform_data.nodos_listos]
  name             = "loki"
  repository       = "https://grafana.github.io/helm-charts"
  chart            = "loki"
  version          = var.versiones.loki
  namespace        = "observabilidad"
  create_namespace = true
  timeout          = 900
  values           = [file("${path.module}/values/loki.yaml")]
}

resource "helm_release" "alloy" {
  depends_on       = [helm_release.loki]
  name             = "alloy"
  repository       = "https://grafana.github.io/helm-charts"
  chart            = "alloy"
  version          = var.versiones.alloy
  namespace        = "observabilidad"
  create_namespace = true
  values           = [file("${path.module}/values/alloy.yaml")]
}

resource "helm_release" "tempo" {
  depends_on       = [terraform_data.nodos_listos]
  name             = "tempo"
  repository       = "https://grafana.github.io/helm-charts"
  chart            = "tempo"
  version          = var.versiones.tempo
  namespace        = "observabilidad"
  create_namespace = true
  values           = [file("${path.module}/values/tempo.yaml")]
}

# ----------------------------- GitOps y entrega progresiva -----------------------------
resource "helm_release" "argo_rollouts" {
  depends_on       = [terraform_data.nodos_listos]
  name             = "argo-rollouts"
  repository       = "https://argoproj.github.io/argo-helm"
  chart            = "argo-rollouts"
  version          = var.versiones.argo_rollouts
  namespace        = "argo-rollouts"
  create_namespace = true
  values           = [file("${path.module}/values/argo-rollouts.yaml")]
}

resource "helm_release" "argocd" {
  depends_on       = [terraform_data.nodos_listos]
  name             = "argocd"
  repository       = "https://argoproj.github.io/argo-helm"
  chart            = "argo-cd"
  version          = var.versiones.argo_cd
  namespace        = "argocd"
  create_namespace = true
  timeout          = 900
  values           = [file("${path.module}/values/argocd.yaml")]
}

# ----------------------------- Seguridad -----------------------------
resource "helm_release" "kyverno" {
  depends_on       = [terraform_data.nodos_listos]
  name             = "kyverno"
  repository       = "https://kyverno.github.io/kyverno"
  chart            = "kyverno"
  version          = var.versiones.kyverno
  namespace        = "kyverno"
  create_namespace = true
  timeout          = 900
  values           = [file("${path.module}/values/kyverno.yaml")]
}

resource "helm_release" "eso" {
  depends_on       = [terraform_data.nodos_listos]
  name             = "external-secrets"
  repository       = "https://charts.external-secrets.io"
  chart            = "external-secrets"
  version          = var.versiones.eso
  namespace        = "external-secrets"
  create_namespace = true
  values           = [file("${path.module}/values/eso.yaml")]
}

# ----------------------------- Datos y respaldo -----------------------------
resource "helm_release" "cnpg" {
  depends_on       = [terraform_data.nodos_listos]
  name             = "cnpg"
  repository       = "https://cloudnative-pg.github.io/charts"
  chart            = "cloudnative-pg"
  version          = var.versiones.cnpg
  namespace        = "cnpg-system"
  create_namespace = true
}

# Plugin de respaldo de CNPG (Barman Cloud): WAL continuo + base backups a S3.
resource "helm_release" "barman_plugin" {
  depends_on = [helm_release.cnpg, helm_release.cert_manager]
  name       = "barman-cloud"
  repository = "https://cloudnative-pg.github.io/charts"
  chart      = "plugin-barman-cloud"
  version    = var.versiones.barman_plugin
  namespace  = "cnpg-system"
}

resource "helm_release" "velero" {
  depends_on       = [terraform_data.nodos_listos, terraform_data.buckets]
  name             = "velero"
  repository       = "https://vmware-tanzu.github.io/helm-charts"
  chart            = "velero"
  version          = var.versiones.velero
  namespace        = "velero"
  create_namespace = true
  timeout          = 600
  values           = [file("${path.module}/values/velero.yaml")]
  set_sensitive = [{
    name  = "credentials.secretContents.cloud"
    value = "[default]\naws_access_key_id=bancagt\naws_secret_access_key=${random_password.s3_secret.result}\n"
  }]
}
