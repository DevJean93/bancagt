<#
.SYNOPSIS
  Túnel local a PostgreSQL (primaria) que se reconecta solo.
.DESCRIPTION
  kubectl port-forward termina cuando una conexión se reinicia o cuando la
  primaria cambia (failover, DRP). Este bucle lo vuelve a abrir en 2 segundos.
  Conectar DBeaver a localhost:<Puerto>, base "banca", usuario "banca", sslmode=require.
.EXAMPLE
  .\scripts\tunel-db.ps1            # puerto 5432
  .\scripts\tunel-db.ps1 -Puerto 15432
#>
param([int]$Puerto = 5432)
. "$PSScriptRoot\comun.ps1"
$ErrorActionPreference = 'Continue'
$host.UI.RawUI.WindowTitle = "Tunel PostgreSQL BancaGT :$Puerto (Ctrl+C para cerrar)"

$pw = k -n banca-prod get secret banca-db-app -o jsonpath='{.data.password}'
Write-Host "Usuario: banca   Contraseña: $([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($pw)))" -ForegroundColor DarkGray
while ($true) {
    Write-Host "$(Get-Date -Format HH:mm:ss) Abriendo túnel localhost:$Puerto -> banca-db-rw:5432" -ForegroundColor Cyan
    k -n banca-prod port-forward svc/banca-db-rw "${Puerto}:5432"
    Write-Host "$(Get-Date -Format HH:mm:ss) El túnel se cerró; reintentando en 2 s..." -ForegroundColor Yellow
    Start-Sleep 2
}
