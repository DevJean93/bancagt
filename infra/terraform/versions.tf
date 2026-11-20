terraform {
  required_version = ">= 1.9"

  required_providers {
    kind = {
      source  = "tehcyx/kind"
      version = "~> 0.13"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "~> 3.3"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 3.5"
    }
    docker = {
      source  = "kreuzwerker/docker"
      version = "~> 4.7"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.1"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.7"
    }
  }
}

# Los proveedores de Kubernetes y Helm se configuran con las credenciales que
# devuelve el clúster kind recién creado (todo en un solo `terraform apply`).
provider "kubernetes" {
  host                   = kind_cluster.banca.endpoint
  cluster_ca_certificate = kind_cluster.banca.cluster_ca_certificate
  client_certificate     = kind_cluster.banca.client_certificate
  client_key             = kind_cluster.banca.client_key
}

provider "helm" {
  kubernetes = {
    host                   = kind_cluster.banca.endpoint
    cluster_ca_certificate = kind_cluster.banca.cluster_ca_certificate
    client_certificate     = kind_cluster.banca.client_certificate
    client_key             = kind_cluster.banca.client_key
  }
}

provider "docker" {}
