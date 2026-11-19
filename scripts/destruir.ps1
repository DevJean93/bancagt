<#
.SYNOPSIS
  Destruye el entorno local (clúster y plataforma).
.DESCRIPTION
  Por defecto CONSERVA el volumen de respaldos (bancagt-respaldos) para poder
  demostrar la recuperación total en un clúster nuevo. Con -BorrarRespaldos
  también se elimina.
#>
param([switch]$BorrarRespaldos)
. "$PSScriptRoot\comun.ps1"

Push-Location (Join-Path $Raiz 'infra\terraform')
try {
    if ($BorrarRespaldos) {
        Paso 'terraform destroy (incluye respaldos)'
        terraform destroy -auto-approve
    } else {
        Paso 'terraform destroy (se conservan los respaldos en el volumen Docker)'
        terraform state rm docker_volume.respaldos | Out-Null
        terraform destroy -auto-approve
        # Docker reutiliza un volumen existente con el mismo nombre, así que el
        # próximo "levantar" lo vuelve a tomar sin perder los respaldos.
        Ok 'Volumen bancagt-respaldos conservado. El próximo "levantar" lo reutiliza.'
    }
} finally {
    Pop-Location
}
