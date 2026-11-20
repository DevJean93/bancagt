# BancaGT en Línea · Plataforma bancaria DevSecOps (modo híbrido)

Proyecto Final del curso **Administración de Websites y Sistemas de Información** (MIBC 2026, UMG).

Es una banca en línea de misión crítica con un portal web y cuatro microservicios. La **CI corre en la nube** (GitHub Actions, GHCR y Pages) y el **runtime es local** (Kubernetes en kind). Argo CD *jala* los cambios desde Git, así que nunca se abren puertos hacia la laptop.

> Todos los datos son ficticios. La identidad visual (paleta petróleo/teal con acento terracota y logotipo propio) se diseñó para **no** parecerse a ningún banco guatemalteco existente.

```
 Desarrollador ──PR──► GitHub ──► Actions: Vitest · tipos · Semgrep · CodeQL · npm audit · gitleaks
                                    · build multi-stage · Trivy (falla con CRITICAL)
                                    · push GHCR · SBOM · firma cosign · bump del digest
                                            │  (Argo CD consulta Git cada 60 s)
                                            ▼
  Laptop: kind (3 nodos, Calico) ── Argo CD ──► Job de migraciones Prisma ──► Argo Rollouts (canary)
          ├─ Traefik (TLS 1.3 + HSTS) ─► web-banca · api-identidad · api-cuentas · api-transferencias
          ├─ CloudNativePG (PostgreSQL 18, 2 instancias, WAL continuo) ─► SeaweedFS S3 (fuera del clúster)
          ├─ Vault + External Secrets · Kyverno (firma + políticas CEL) · NetworkPolicy zero-trust
          └─ Prometheus · Grafana · Alertmanager · Loki · Tempo (OpenTelemetry) · Velero · sondeo k6
```

## Arquitectura del software

| Pieza | Tecnología | Responsabilidad |
|---|---|---|
| `apps/web-banca` | React 19 · Vite · TypeScript · Tailwind 4 | Portal: inicio de sesión, posición consolidada, movimientos, estados de cuenta, transferencias y beneficiarios |
| `apps/api-identidad` | Fastify 5 · Prisma · Argon2id · JWT ES256 | Autenticación, bloqueo tras 5 intentos fallidos, bitácora de accesos y emisión de sesiones (cookie `__Host-` HttpOnly) |
| `apps/api-cuentas` | Fastify 5 · Prisma | Posición, movimientos con filtros, estado de cuenta mensual y flujo diario |
| `apps/api-transferencias` | Fastify 5 · Prisma | Transferencias (propias y a terceros) con idempotencia, límites y comprobante; gestión de beneficiarios |
| `apps/db-migraciones` | Prisma Migrate | Job de Argo CD: aplica migraciones versionadas y carga datos semilla |
| `packages/plataforma` | — | Núcleo compartido: servidor seguro, errores RFC 9457, sesión, métricas RED, OpenTelemetry, `Dinero` |
| `packages/db-core`, `packages/db-identidad` | Prisma ORM | Esquemas `core` e `identidad` (cada servicio es dueño de sus datos), migraciones y cliente tipado |

**Diseño (SOLID y patrones).** Cada API sigue una arquitectura hexagonal: dominio, casos de uso, puertos, adaptadores Prisma y HTTP. Las dependencias se conectan en una raíz de composición, lo que aplica la inversión de dependencias (DIP). Patrones usados:

- **Repository y Data Mapper** con Prisma.
- **Unit of Work** en la transacción de la transferencia.
- **Strategy** para las reglas de transferencia: límites, moneda, saldo y beneficiario.
- **Factory** del servidor y de los clientes de BD.
- **Observer** para las métricas de negocio.
- **Facade** del cliente HTTP y **Provider/Context** de la sesión en el frontend.
- **Value Object** `Dinero`, que trabaja en centavos exactos.

**Sin SQL escrito a mano.** Todas las consultas pasan por Prisma. El débito de una transferencia es un `update` condicional (`saldoDisponible >= monto`), que es atómico: con 13 transferencias simultáneas contra el mismo saldo solo pasan las que alcanzan. Las restricciones `CHECK` (saldo ≥ 0, monto > 0) viven en una migración versionada como defensa en profundidad.

## Estructura

| Carpeta | Contenido |
|---|---|
| `apps/`, `packages/` | Código del monorepo (npm workspaces) |
| `docker/` | Dockerfiles multi-stage: servicios Node en distroless non-root y portal en Nginx sin privilegios |
| `infra/terraform/` | IaC del entorno completo: clúster, red, S3 de respaldos, plataforma, Vault y llaves JWT |
| `deploy/argocd/` | Applications de Argo CD (*app of apps*) |
| `deploy/charts/banca/` | Chart: Rollouts, migraciones, NetworkPolicy, ExternalSecrets, PostgreSQL e Ingress |
| `deploy/envs/prod/` | Valores de producción (la CI escribe aquí el digest firmado de cada imagen) |
| `deploy/platform/` | TLS, políticas Kyverno, reglas SLO, dashboards, respaldos y sondeo sintético |
| `.github/workflows/` | `ci.yml` (DevSecOps) y `pages.yml` (sitio de evidencias) |
| `scripts/` | Operación y demostraciones |
| `tests/k6/` | Prueba de continuidad (zero-downtime) |

## Requisitos (Windows)

Docker Desktop (16 GB asignados) y Node 24. Además, estas herramientas con winget:

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
| Respaldos (SeaweedFS) | http://127.0.0.1:8888/buckets/ |

**Usuarios de demostración:** `mlopez`, `jperez`, `agarcia`, `cramirez`, `shernandez`, `lmendez` y `gcifuentes`. Todos usan la contraseña `BancaGT#2026`. El usuario `sonda` está reservado para el monitoreo sintético.

### Desarrollo local

```powershell
npm ci
npm run build                     # genera clientes Prisma, compila TypeScript y el portal
npm test                          # Vitest (dominio y casos de uso, cobertura mínima 80 %)
.\scripts\tunel-db.ps1            # túnel a PostgreSQL para DBeaver (localhost:5432, SSL require)
```

### Demostraciones

```powershell
.\scripts\observar-rollout.ps1 -Servicio api-cuentas   # canary con FAULT_RATE → rollback automático
k6 run -e MINUTOS=6 tests/k6/continuidad.js            # zero-downtime durante un despliegue
.\scripts\pruebas-seguridad.ps1                        # los controles deben bloquear
.\scripts\rotar-secreto.ps1                            # rotación de la contraseña de la BD sin cortes
.\scripts\drp-prueba.ps1                               # desastre y recuperación con RTO/RPO medidos
.\scripts\destruir.ps1                                 # elimina el entorno (conserva los respaldos)
```

## Flujo de trabajo (GitFlow)

`feature/*` → PR a `develop` (CI sin publicar) → PR a `main` (CI completo + despliegue). La CI hace un commit automático `chore(deploy)` con los nuevos digest firmados, así que antes de su siguiente commit **haga `git pull`**.
