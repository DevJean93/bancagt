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

# Consulta SQL de solo lectura en la instancia primaria (socket local, rol postgres).
function Sql([string]$consulta) {
    $primaria = k -n banca-prod get cluster banca-db -o jsonpath='{.status.currentPrimary}'
    k -n banca-prod exec $primaria -c postgres -- psql -d banca -tAc $consulta
}
