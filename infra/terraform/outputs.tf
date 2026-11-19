output "urls" {
  description = "Accesos (certificados emitidos por la CA interna bancagt-ca)"
  value = {
    banca    = "https://${local.hosts.banca}"
    argocd   = "https://${local.hosts.argocd}"
    grafana  = "https://${local.hosts.grafana}"
    vault    = "https://${local.hosts.vault}"
  }
}

output "grafana_admin_password" {
  description = "Contraseña del usuario admin de Grafana"
  value       = random_password.grafana.result
  sensitive   = true
}

output "vault_root_token" {
  description = "Token raíz de Vault (modo dev, solo laboratorio)"
  value       = random_password.vault_root.result
  sensitive   = true
}

output "argocd_admin_password" {
  description = "Comando para leer la contraseña inicial de Argo CD"
  value       = "kubectl --context ${local.contexto} -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d"
}

output "kube_context" {
  value = local.contexto
}
