<#
.SYNOPSIS
  Levanta TODO el entorno local de BancaGT con un solo comando (IaC).
.DESCRIPTION
  1. terraform init + apply: clúster kind + Calico + S3 de respaldos + plataforma.
  2. Exporta la CA interna para confiar en los certificados (opcional: -ConfiarCA).
  3. Muestra accesos y credenciales.
  Desde ese momento Argo CD sincroniza la aplicación desde GitHub.
#>
param([switch]$ConfiarCA)
. "$PSScriptRoot\comun.ps1"

Push-Location (Join-Path $Raiz 'infra\terraform')
try {
    Paso 'terraform init'
    terraform init -upgrade -input=false | Out-Null
    Paso 'terraform apply (10-15 minutos la primera vez)'
    $inicio = Get-Date
    terraform apply -auto-approve -input=false
    if ($LASTEXITCODE -ne 0) { throw 'terraform apply falló' }
    Ok ("Infraestructura lista en {0:N1} min" -f ((Get-Date) - $inicio).TotalMinutes)

    Paso 'Esperando la CA interna (la crea Argo CD desde deploy/platform)'
    for ($i = 0; $i -lt 60; $i++) {
        $ca = k -n cert-manager get secret bancagt-ca -o jsonpath='{.data.ca\.crt}' 2>$null
        if ($ca) { break }
        Start-Sleep 5
    }
    if ($ca) {
        $archivoCA = Join-Path $Raiz 'bancagt-ca.crt'
        [IO.File]::WriteAllBytes($archivoCA, [Convert]::FromBase64String($ca))
        Ok "CA exportada a $archivoCA"
        if ($ConfiarCA) {
            Import-Certificate -FilePath $archivoCA -CertStoreLocation Cert:\CurrentUser\Root | Out-Null
            Ok 'CA agregada a los certificados de confianza del usuario actual'
        } else {
            Write-Host '    Para no ver advertencias en el navegador: .\scripts\levantar.ps1 -ConfiarCA'
        }
    } else {
        Falla 'La CA aún no existe: revisar que Argo CD haya sincronizado la app "plataforma"'
    }

    Paso 'Accesos'
    terraform output urls
    Write-Host ("    Grafana  admin / " + (terraform output -raw grafana_admin_password))
    $argo = k -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' 2>$null
    if ($argo) { Write-Host ("    Argo CD  admin / " + [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($argo))) }
    Write-Host ("    Vault    token  / " + (terraform output -raw vault_root_token))
} finally {
    Pop-Location
}
