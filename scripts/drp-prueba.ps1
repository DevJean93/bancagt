<#
.SYNOPSIS
  Prueba del Plan de Recuperación ante Desastres (DRP) con medición de RTO y RPO.
.DESCRIPTION
  Escenario: se pierde por completo el namespace banca-prod (aplicación + base
  de datos + volúmenes). La recuperación se hace por GitOps:

    1. Se registra el estado previo (transferencias y la más reciente).
    2. DESASTRE: kubectl delete namespace banca-prod.           → T0
    3. El script declara en Git la recuperación: nueva generación de BD que
       nace desde el respaldo S3 (base backup + WAL). El usuario hace commit
       y push (control de cambios auditable).
    4. Argo CD recrea todo; CloudNativePG restaura la BD desde S3.
    5. Se verifica el servicio por HTTPS.                       → T1
    6. RTO = T1 − T0.   RPO = datos perdidos entre la última transferencia
       antes del desastre y la última recuperada.

  Metas declaradas en el DRP: RTO ≤ 30 min, RPO ≤ 15 min.
#>
param([switch]$SinConfirmar)
. "$PSScriptRoot\comun.ps1"

$valores = Join-Path $Raiz 'deploy\envs\prod\values.yaml'
$contenido = Get-Content $valores -Raw
$genActual = [int]([regex]::Match($contenido, 'generacion:\s*(\d+)').Groups[1].Value)
$genNueva = $genActual + 1
$log = [System.Collections.Generic.List[string]]::new()
function Registrar([string]$t) { $l = "$(Get-Date -Format 'HH:mm:ss') $t"; $log.Add($l); Write-Host "    $l" }

Paso '1. Estado previo al desastre'
$previo = (Sql "select count(*) || '|' || coalesce(to_char(max(creado_en) at time zone 'UTC','YYYY-MM-DD HH24:MI:SS'),'-') from transferencias").Trim()
$wal = k -n banca-prod get cluster banca-db -o jsonpath='{.status.conditions[?(@.type=="ContinuousArchiving")].status}'
Registrar "Transferencias|última (UTC): $previo"
Registrar "Archivado continuo de WAL activo: $wal"
Registrar "Generación de BD actual: banca-db-g$genActual"
if (-not $SinConfirmar) {
    $r = Read-Host '    Esto BORRA el namespace banca-prod. Escriba DESASTRE para continuar'
    if ($r -ne 'DESASTRE') { Write-Host 'Cancelado.'; exit 1 }
}

Paso '2. DESASTRE: se elimina el namespace banca-prod'
$T0 = Get-Date
k delete namespace banca-prod --wait=false | Out-Null
Registrar 'T0 - namespace banca-prod eliminado (app, BD y volúmenes)'

Paso '3. Declarar la recuperación en Git'
$contenido = $contenido -replace 'generacion:\s*\d+', "generacion: $genNueva"
$contenido = $contenido -replace 'recuperarDe:\s*".*?"', "recuperarDe: ""banca-db-g$genActual"""
Set-Content -Path $valores -Value $contenido -NoNewline -Encoding utf8
Registrar "values.yaml: generacion=$genNueva, recuperarDe=banca-db-g$genActual"
Write-Host ''
Write-Host '    Ejecute ahora en otra terminal (desde la carpeta del repo):' -ForegroundColor Yellow
Write-Host "      git add deploy/envs/prod/values.yaml"
Write-Host "      git commit -m `"ops(drp): recuperar banca-db desde respaldo g$genActual`""
Write-Host "      git push"
Read-Host '    Presione Enter cuando el push esté hecho'
Registrar 'Cambio de recuperación publicado en Git'

Paso '4. Argo CD sincroniza y CloudNativePG restaura desde S3'
k -n argocd annotate application banca argocd.argoproj.io/refresh=hard --overwrite | Out-Null
# Si Argo alcanzó a recrear un clúster vacío con la definición anterior, se
# elimina para que nazca con la definición de recuperación.
for ($i = 0; $i -lt 60; $i++) {
    $rev = k -n argocd get application banca -o jsonpath='{.status.sync.revision}' 2>$null
    $spec = k -n banca-prod get cluster banca-db -o jsonpath='{.spec.bootstrap.recovery.source}' 2>$null
    $existe = k -n banca-prod get cluster banca-db --ignore-not-found -o name 2>$null
    if ($existe -and -not $spec) {
        Registrar 'Se descarta el clúster vacío creado antes del cambio en Git'
        k -n banca-prod delete cluster banca-db --wait=true | Out-Null
    }
    if ($spec) { break }
    Start-Sleep 5
}
Registrar 'Clúster banca-db en modo recuperación'
k -n banca-prod wait cluster/banca-db --for=condition=Ready --timeout=30m | Out-Null
Registrar 'Base de datos recuperada y lista'
foreach ($s in 'api-cuentas', 'api-transferencias', 'web-banca') {
    for ($i = 0; $i -lt 120; $i++) {
        $f = k -n banca-prod get rollout $s -o jsonpath='{.status.phase}' 2>$null
        if ($f -eq 'Healthy') { break }
        Start-Sleep 5
    }
    Registrar "Rollout $s : $f"
}

Paso '5. Verificación del servicio por HTTPS'
for ($i = 0; $i -lt 60; $i++) {
    try {
        $resp = Invoke-RestMethod "$Url/api/v1/cuentas/1001/saldo" -SkipCertificateCheck -TimeoutSec 5
        if ($resp.cuenta -eq '1001') { break }
    } catch { Start-Sleep 5 }
}
$T1 = Get-Date
Registrar "T1 - servicio respondiendo: saldo 1001 = $($resp.saldo) $($resp.moneda)"

Paso '6. Resultado'
$despues = (Sql "select count(*) || '|' || coalesce(to_char(max(creado_en) at time zone 'UTC','YYYY-MM-DD HH24:MI:SS'),'-') from transferencias").Trim()
$rto = ($T1 - $T0).TotalMinutes
$a = $previo.Split('|'); $b = $despues.Split('|')
$perdidas = [int]$a[0] - [int]$b[0]
$rpoMin = 0
if ($a[1] -ne '-' -and $b[1] -ne '-') {
    $rpoMin = ([datetime]::Parse($a[1]) - [datetime]::Parse($b[1])).TotalMinutes
}
Registrar "Antes:   $previo"
Registrar "Después: $despues"
Registrar ("RTO medido: {0:N1} min (meta ≤ 30 min) → {1}" -f $rto, $(if ($rto -le 30) { 'CUMPLE' } else { 'NO CUMPLE' }))
Registrar ("RPO medido: {0:N1} min de datos ({1} transferencias no recuperadas) (meta ≤ 15 min) → {2}" -f $rpoMin, $perdidas, $(if ($rpoMin -le 15) { 'CUMPLE' } else { 'NO CUMPLE' }))

Evidencia "drp-prueba-$(Get-Date -Format 'yyyyMMdd-HHmm')" {
    $log
    ''
    '--- Clúster de base de datos'
    k -n banca-prod get cluster banca-db
    ''
    '--- Pods'
    k -n banca-prod get pods -o wide
}
Write-Host ''
Write-Host "    La generación g$genNueva ya archiva sus WAL en su propia carpeta del bucket." -ForegroundColor Yellow
Write-Host '    No hace falta revertir recuperarDe: CNPG solo usa el bootstrap al crear el clúster.' -ForegroundColor Yellow
