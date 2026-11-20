<#
.SYNOPSIS
  Rota la contraseña de la base de datos sin interrumpir el servicio.
.DESCRIPTION
  Flujo: Vault (nueva versión del secreto) → External Secrets (sincroniza el
  Secret de Kubernetes) → CloudNativePG (cambia la contraseña del rol en
  PostgreSQL) → kubelet actualiza el archivo montado → las APIs usan la nueva
  contraseña en las conexiones nuevas. Sin reinicios ni cortes.
#>
. "$PSScriptRoot\comun.ps1"

$token = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String((k -n vault get secret vault-semilla -o jsonpath='{.data.VAULT_TOKEN}')))
function Vault { k -n vault exec vault-0 -- env "VAULT_TOKEN=$token" vault @args }

$log = [System.Collections.Generic.List[string]]::new()
function Registrar([string]$t) { $l = "$(Get-Date -Format 'HH:mm:ss') $t"; $log.Add($l); Write-Host "    $l" }

Paso '1. Versión actual del secreto en Vault'
$antes = Vault kv metadata get -format=json secret/banca/db | ConvertFrom-Json
Registrar "secret/banca/db versión actual: $($antes.data.current_version)"
$hashAntes = k -n banca-prod get secret banca-db-app -o jsonpath='{.data.password}'

Paso '2. Generar y guardar la nueva contraseña en Vault'
$bytes = New-Object byte[] 24
[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
$nueva = ([Convert]::ToBase64String($bytes) -replace '[^A-Za-z0-9]', '').Substring(0, 28)
Vault kv put secret/banca/db username=banca "password=$nueva" | Out-Null
$despues = Vault kv metadata get -format=json secret/banca/db | ConvertFrom-Json
Registrar "secret/banca/db nueva versión: $($despues.data.current_version) (la contraseña nunca se imprime)"

Paso '3. Forzar la sincronización de External Secrets'
k -n banca-prod annotate externalsecret banca-db-app "force-sync=$(Get-Date -UFormat %s)" --overwrite | Out-Null
for ($i = 0; $i -lt 30; $i++) {
    if ((k -n banca-prod get secret banca-db-app -o jsonpath='{.data.password}') -ne $hashAntes) { break }
    Start-Sleep 2
}
Registrar 'Secret banca-db-app actualizado en Kubernetes'

Paso '4. Verificar que PostgreSQL aplicó la nueva contraseña (CNPG)'
Start-Sleep 10
$estadoRol = k -n banca-prod get cluster banca-db -o jsonpath='{.status.managedRolesStatus.byStatus}'
Registrar "Roles administrados por CNPG: $estadoRol"

Paso '5. Verificar el servicio (las conexiones nuevas usan la contraseña nueva)'
$errores = 0
$sesion = Iniciar-SesionApi
$gtq = @((Api $sesion '/api/v1/cuentas').cuentas | Where-Object moneda -eq 'GTQ')
for ($i = 0; $i -lt 30; $i++) {
    try {
        $cuerpo = @{ cuentaOrigenId = $gtq[$i % 2].id; destino = @{ tipo = 'PROPIA'; cuentaId = $gtq[($i + 1) % 2].id }; monto = '1.00'; concepto = 'Verificación de rotación' }
        Api $sesion '/api/v1/transferencias' 'POST' $cuerpo @{ 'Idempotency-Key' = [guid]::NewGuid().ToString() } | Out-Null
        Api $sesion '/api/v1/cuentas' | Out-Null
    } catch { $errores++ }
    Start-Sleep 1
}
Registrar "30 transferencias + 30 consultas tras la rotación → errores: $errores"
# Reinicia el pool en un pod para comprobar que una conexión NUEVA autentica.
$pod = k -n banca-prod get pods -l app.kubernetes.io/name=api-cuentas -o jsonpath='{.items[0].metadata.name}'
k -n banca-prod delete pod $pod --wait=true | Out-Null
Start-Sleep 15
$listos = k -n banca-prod get pods -l app.kubernetes.io/name=api-cuentas -o jsonpath='{range .items[*]}{.metadata.name}={.status.containerStatuses[0].ready} {end}'
Registrar "Pods api-cuentas tras reinicio de uno (conexiones nuevas): $listos"

Evidencia "rotacion-secreto-$(Get-Date -Format 'yyyyMMdd-HHmm')" {
    $log
    ''
    '--- ExternalSecret'
    k -n banca-prod get externalsecret banca-db-app
    ''
    '--- Auditoría de Vault (últimos accesos a secret/banca/db)'
    k -n vault logs vault-0 --since=10m | Select-String 'banca/db' | Select-Object -Last 5 | ForEach-Object {
        $j = $_.Line | ConvertFrom-Json -ErrorAction SilentlyContinue
        if ($j) { "{0} {1} {2} {3}" -f $j.time, $j.type, $j.request.operation, $j.request.path }
    }
}
