# =====================================================================
# Punto de entrega a GitOps: Terraform crea solo la Application raíz
# ("app of apps"). Desde aquí Argo CD jala de GitHub todo lo declarado en
# deploy/argocd: configuración de plataforma y la aplicación bancaria.
# =====================================================================

resource "helm_release" "argocd_raiz" {
  depends_on = [
    helm_release.argocd,
    helm_release.argo_rollouts,
    helm_release.traefik,
    helm_release.cert_manager,
    helm_release.kps,
    helm_release.kyverno,
    helm_release.eso,
    helm_release.barman_plugin,
    helm_release.velero,
    kubernetes_job_v1.vault_bootstrap,
  ]
  name       = "bancagt-raiz"
  repository = "https://argoproj.github.io/argo-helm"
  chart      = "argocd-apps"
  version    = var.versiones.argocd_apps
  namespace  = "argocd"

  values = [yamlencode({
    applications = {
      bancagt-raiz = {
        namespace  = "argocd"
        project    = "default"
        finalizers = ["resources-finalizer.argocd.argoproj.io"]
        source = {
          repoURL        = var.repo_url
          targetRevision = var.repo_revision
          path           = "deploy/argocd"
        }
        destination = {
          server    = "https://kubernetes.default.svc"
          namespace = "argocd"
        }
        syncPolicy = {
          automated = { prune = true, selfHeal = true }
        }
      }
    }
  })]
}
