variable "cluster_name" {
  description = "Nombre del clúster kind"
  type        = string
  default     = "bancagt"
}

variable "dominio" {
  description = "Dominio base. nip.io resuelve *.127.0.0.1.nip.io a 127.0.0.1 sin editar el archivo hosts."
  type        = string
  default     = "127.0.0.1.nip.io"
}

variable "repo_url" {
  description = "Repositorio GitOps que Argo CD sincroniza"
  type        = string
  default     = "https://github.com/DevJean93/bancagt.git"
}

variable "repo_revision" {
  description = "Rama que representa producción (GitFlow: main)"
  type        = string
  default     = "main"
}

variable "trabajadores" {
  description = "Cantidad de nodos worker"
  type        = number
  default     = 2
}

variable "versiones" {
  description = "Versiones fijadas de los charts (reproducibilidad)"
  type        = map(string)
  default = {
    calico        = "v3.33.1"
    traefik       = "42.4.1"
    cert_manager  = "v1.21.3"
    argo_cd       = "10.18.2"
    argocd_apps   = "2.0.8"
    argo_rollouts = "2.43.12"
    kps           = "93.4.1"
    loki          = "7.7.0"
    alloy         = "1.16.0"
    tempo         = "1.24.4"
    vault         = "0.34.1"
    eso           = "2.15.0"
    kyverno       = "3.10.0"
    cnpg          = "0.29.2"
    barman_plugin = "0.9.0"
    velero        = "12.2.5"
    seaweedfs     = "4.54"
    vault_image   = "2.0.4"
    velero_aws    = "v1.14.4"
  }
}
