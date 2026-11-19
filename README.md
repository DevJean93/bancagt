# BancaGT en Línea · Plataforma bancaria DevSecOps (modo híbrido)

Proyecto Final del curso **Administración de Websites y Sistemas de Información** (MIBC 2026, UMG).

Es un sistema de banca en línea de misión crítica con tres microservicios. Se despliega con **CI en la nube** (GitHub Actions, GHCR y Pages) y **runtime local** (Kubernetes en kind). Argo CD *jala* los cambios desde Git, así que nunca se abren puertos hacia la laptop.

```
 Desarrollador ──PR──► GitHub ──► Actions: pruebas · Semgrep · CodeQL · npm audit · gitleaks
                                    · build multi-stage · Trivy (falla con CRITICAL)
                                    · push GHCR · SBOM · firma cosign · bump del tag
                                            │
                       ┌────────────────────┘ (Argo CD consulta Git cada 60 s)
                       ▼
  Laptop: kind (3 nodos, Calico) ── Argo CD ──► Argo Rollouts: canary 10→25→50→100 %
          ├─ Traefik (TLS 1.3 + HSTS) ─► web-banca · api-cuentas · api-transferencias
          ├─ CloudNativePG (2 instancias, WAL continuo) ─► SeaweedFS S3 (fuera del clúster)
          ├─ Vault + External Secrets · Kyverno (firma + políticas) · NetworkPolicy
          └─ Prometheus · Grafana · Alertmanager · Loki · Tempo (OpenTelemetry) · Velero
```

## Estructura

| Carpeta | Contenido |
|---|---|
| `apps/` | `api-cuentas`, `api-transferencias` (Node 24, distroless, non-root) y `web-banca` (Nginx sin privilegios) |
| `infra/terraform/` | IaC del entorno completo: clúster, red, S3 de respaldos, 17 componentes de plataforma, Vault |
| `deploy/argocd/` | Applications de Argo CD (*app of apps*) |
| `deploy/charts/banca/` | Chart de la aplicación: Rollouts, NetworkPolicy, ExternalSecrets, PostgreSQL, Ingress |
| `deploy/envs/prod/` | Valores de producción (la CI escribe aquí el tag y el digest firmado) |
| `deploy/platform/` | TLS, políticas Kyverno, reglas SLO, dashboards, respaldos programados, sondeo sintético |
| `.github/workflows/` | `ci.yml` (DevSecOps) y `pages.yml` (sitio de evidencias) |
| `scripts/` | Operación y demostración: levantar, canary, DRP, rotación de secretos, pruebas de seguridad |
| `docs/` | Arquitectura, SLO, runbook, post-mortem, DRP, matriz de cumplimiento |
| `evidencias/` | Salidas de las pruebas (las generan los scripts) |

## Requisitos (Windows)

Docker Desktop (16 GB asignados), y estas herramientas instaladas con winget:

```powershell
winget install Kubernetes.kind Hashicorp.Terraform Helm.Helm Kubernetes.kubectl Sigstore.Cosign GrafanaLabs.k6 AquaSecurity.Trivy
```

## Uso

```powershell
.\scripts\levantar.ps1 -ConfiarCA        # crea todo (≈10-15 min) y confía en la CA interna
```

| Acceso | URL |
|---|---|
| Portal bancario | https://banca.127.0.0.1.nip.io |
| Argo CD | https://argocd.127.0.0.1.nip.io |
| Grafana (dashboard "BancaGT · SLO") | https://grafana.127.0.0.1.nip.io |
| Vault | https://vault.127.0.0.1.nip.io |

Las credenciales las imprime `levantar.ps1`. Salen de `terraform output` y nunca se guardan en Git.

### Demostraciones

```powershell
# 1. Despliegue canary con falla → rollback automático
#    Editar deploy/envs/prod/values.yaml: api-cuentas.env.FAULT_RATE: "0.3" → commit y push
.\scripts\observar-rollout.ps1 -Servicio api-cuentas

# 2. Zero-downtime durante un despliegue sano
k6 run -e MINUTOS=6 tests/k6/continuidad.js

# 3. Controles de seguridad (deben bloquear)
.\scripts\pruebas-seguridad.ps1

# 4. Rotación de la contraseña de la BD sin cortes
.\scripts\rotar-secreto.ps1

# 5. Desastre y recuperación con RTO/RPO medidos
.\scripts\drp-prueba.ps1

.\scripts\destruir.ps1                    # elimina el entorno (conserva los respaldos)
```

## Flujo de trabajo (GitFlow)

`feature/*` → PR a `develop` (CI sin publicar) → PR a `main` (CI completo + despliegue).
La CI hace un commit automático `chore(deploy)` con el nuevo digest firmado. **Haga `git pull` antes de su siguiente commit.**
