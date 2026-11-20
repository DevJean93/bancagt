# Funciones compartidas por los scripts de operación de BancaGT.
$ErrorActionPreference = 'Stop'

$script:Contexto = 'kind-bancagt'
$script:Raiz = Split-Path -Parent $PSScriptRoot
$script:DirEvidencias = Join-Path $script:Raiz 'evidencias'
$script:Url = 'https://banca.127.0.0.1.nip.io'

# Refresca el PATH por si las herramientas se instalaron en esta sesión.
$env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')

function k { kubectl --context $script:Contexto @args }

function Paso([string]$texto) {
    Write-Host ""
    Write-Host "==> $texto" -ForegroundColor Cyan
}

function Ok([string]$texto) { Write-Host "    [OK] $texto" -ForegroundColor Green }
function Falla([string]$texto) { Write-Host "    [X]  $texto" -ForegroundColor Red }

# Guarda la salida de un bloque en evidencias/<nombre>.txt y también la muestra.
function Evidencia([string]$nombre, [scriptblock]$bloque) {
    New-Item -ItemType Directory -Force -Path $script:DirEvidencias | Out-Null
    $archivo = Join-Path $script:DirEvidencias "$nombre.txt"
    $encabezado = "# $nombre`n# Fecha: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz')`n"
    $salida = & $bloque 2>&1 | Out-String
    ($encabezado + $salida) | Set-Content -Path $archivo -Encoding utf8
    Write-Host $salida
    Write-Host "    Evidencia guardada en evidencias\$nombre.txt" -ForegroundColor DarkGray
}

# ---- Cliente de la API del banco (misma ruta que un usuario: HTTPS por Traefik) ----
$script:Origen = @{ Origin = $script:Url }

function Iniciar-SesionApi([string]$usuario = 'sonda', [string]$contrasena = 'BancaGT#2026') {
    $cuerpo = @{ usuario = $usuario; contrasena = $contrasena } | ConvertTo-Json
    Invoke-RestMethod "$script:Url/api/v1/auth/sesion" -Method Post -Body $cuerpo -ContentType 'application/json' `
        -Headers $script:Origen -SessionVariable sesion -SkipCertificateCheck -TimeoutSec 10 | Out-Null
    return $sesion
}

function Api([Microsoft.PowerShell.Commands.WebRequestSession]$sesion, [string]$ruta, [string]$metodo = 'GET', $cuerpo = $null, [hashtable]$extra = @{}) {
    $p = @{ Uri = "$script:Url$ruta"; Method = $metodo; WebSession = $sesion; SkipCertificateCheck = $true; TimeoutSec = 10; Headers = ($script:Origen + $extra) }
    if ($null -ne $cuerpo) { $p.Body = ($cuerpo | ConvertTo-Json -Depth 5); $p.ContentType = 'application/json' }
    Invoke-RestMethod @p
}

# Última transferencia registrada para el usuario de monitoreo (lo usa el DRP para medir el RPO).
function Estado-Transferencias([Microsoft.PowerShell.Commands.WebRequestSession]$sesion) {
    $r = Api $sesion '/api/v1/transferencias?pagina=1&tamano=5'
    [pscustomobject]@{ total = [int]$r.total; ultima = if ($r.elementos.Count) { [datetime]$r.elementos[0].fecha } else { $null }; referencia = $r.elementos[0].referencia }
}
