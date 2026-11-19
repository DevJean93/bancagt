<#
.SYNOPSIS
  Observa un despliegue canary en vivo y guarda la evidencia.
.DESCRIPTION
  Muestra cada N segundos: fase del Rollout, paso, peso del canary, resultado
  de cada métrica del análisis y estado de los ReplicaSets. Termina cuando el
  Rollout queda Healthy (promovido) o Degraded (abortado → rollback).
.EXAMPLE
  .\scripts\observar-rollout.ps1 -Servicio api-cuentas
#>
param(
    [string]$Servicio = 'api-cuentas',
    [int]$Intervalo = 10,
    [int]$MaxMinutos = 15
)
. "$PSScriptRoot\comun.ps1"

$nombreEv = "canary-$Servicio-$(Get-Date -Format 'yyyyMMdd-HHmm')"
$lineas = [System.Collections.Generic.List[string]]::new()
$fin = (Get-Date).AddMinutes($MaxMinutos)
$vioCambio = $false

Paso "Observando Rollout $Servicio (Ctrl+C para salir)"
while ((Get-Date) -lt $fin) {
    $r = k -n banca-prod get rollout $Servicio -o json | ConvertFrom-Json
    $ts = k -n banca-prod get traefikservice "$Servicio-ponderado" -o json | ConvertFrom-Json
    $pesos = ($ts.spec.weighted.services | ForEach-Object { "$($_.name)=$($_.weight)" }) -join ' '
    $fase = $r.status.phase
    $paso = $r.status.currentStepIndex
    $msg = $r.status.message

    $ar = k -n banca-prod get analysisrun -l "rollouts-pod-template-hash=$($r.status.currentPodHash)" -o json 2>$null | ConvertFrom-Json
    $analisis = ''
    if ($ar.items) {
        $ultimo = $ar.items | Sort-Object { $_.metadata.creationTimestamp } | Select-Object -Last 1
        $analisis = ($ultimo.status.metricResults | ForEach-Object {
            $m = $_.measurements | Select-Object -Last 1
            "$($_.name): $($_.phase) (valor=$($m.value))"
        }) -join ' | '
        $analisis = "AnalysisRun $($ultimo.metadata.name) [$($ultimo.status.phase)] $analisis"
    }

    $linea = "{0} fase={1} paso={2} pesos[{3}] {4} {5}" -f (Get-Date -Format 'HH:mm:ss'), $fase, $paso, $pesos, $msg, $analisis
    $lineas.Add($linea)
    $color = switch ($fase) { 'Healthy' { 'Green' } 'Degraded' { 'Red' } default { 'Yellow' } }
    Write-Host $linea -ForegroundColor $color

    if ($fase -ne 'Healthy') { $vioCambio = $true }
    if ($vioCambio -and $fase -in 'Healthy', 'Degraded') { break }
    Start-Sleep $Intervalo
}

Evidencia $nombreEv {
    $lineas
    ''
    '--- Estado final del Rollout'
    k -n banca-prod get rollout $Servicio -o wide
    ''
    '--- ReplicaSets'
    k -n banca-prod get rs -l "app.kubernetes.io/name=$Servicio" -o wide
    ''
    '--- AnalysisRuns'
    k -n banca-prod get analysisrun
    ''
    '--- Eventos del Rollout'
    k -n banca-prod get events --field-selector "involvedObject.name=$Servicio" --sort-by=.lastTimestamp
}
