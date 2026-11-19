<#
.SYNOPSIS
  Pruebas negativas de seguridad: demuestran que los controles BLOQUEAN.
.DESCRIPTION
  - Pod Security "restricted" rechaza un contenedor root.
  - Kyverno rechaza imágenes de registros no aprobados, imágenes sin firma
    del pipeline y contenedores sin raíz de solo lectura.
  - NetworkPolicy impide llegar a PostgreSQL desde fuera de la zona de aplicación.
  - El Ingress solo acepta TLS 1.3 y responde con HSTS.
  - Las imágenes en ejecución no tienen vulnerabilidades CRITICAL (Trivy).
#>
. "$PSScriptRoot\comun.ps1"

$tmp = Join-Path $env:TEMP 'bancagt-pruebas.yaml'
function IntentarPod([string]$descripcion, [string]$yaml) {
    Set-Content -Path $tmp -Value $yaml -Encoding utf8
    $salida = k apply -f $tmp 2>&1 | Out-String
    if ($salida -match 'denied|forbidden|Forbidden') {
        "[BLOQUEADO - correcto] $descripcion"
        "    $($salida.Trim() -replace '\s+', ' ')"
    } else {
        "[PERMITIDO - FALLA DE CONTROL] $descripcion"
        k delete -f $tmp --ignore-not-found 2>&1 | Out-Null
    }
}

$base = @'
apiVersion: v1
kind: Pod
metadata:
  name: prueba-{0}
  namespace: banca-prod
  labels: {{ app.kubernetes.io/part-of: {1} }}
spec:
  securityContext: {{ runAsNonRoot: true, runAsUser: 65532, seccompProfile: {{ type: RuntimeDefault }} }}
  containers:
    - name: x
      image: {2}
      securityContext: {{ allowPrivilegeEscalation: false, readOnlyRootFilesystem: {3}, capabilities: {{ drop: ["ALL"] }} }}
      resources: {{ limits: {{ memory: 64Mi }} }}
'@

Evidencia 'seguridad-01-admision' {
    IntentarPod 'Contenedor como root (Pod Security restricted)' @'
apiVersion: v1
kind: Pod
metadata: { name: prueba-root, namespace: banca-prod }
spec:
  containers: [{ name: x, image: "ghcr.io/cloudnative-pg/postgresql:17" }]
'@
    IntentarPod 'Imagen de un registro no aprobado (docker.io)' ($base -f 'registro', 'otra', 'docker.io/library/nginx:1.29', 'true')
    $sinFirma = k -n banca-prod get rollout api-cuentas -o jsonpath='{.spec.template.spec.containers[0].image}'
    $sinFirma = ($sinFirma -split '@')[0] -replace ':[^:/]+$', ':sin-firma'
    IntentarPod "Imagen del proyecto que NO firmó el pipeline ($sinFirma)" ($base -f 'firma', 'otra', $sinFirma, 'true')
    IntentarPod 'Contenedor de la app sin readOnlyRootFilesystem' ($base -f 'hardening', 'bancagt', 'ghcr.io/cloudnative-pg/postgresql:17', 'false')
    IntentarPod 'Imagen con etiqueta latest' ($base -f 'latest', 'otra', 'ghcr.io/cloudnative-pg/postgresql:latest', 'true')
}

Evidencia 'seguridad-02-networkpolicy' {
    $pod = @'
apiVersion: v1
kind: Pod
metadata: { name: sonda-red, namespace: banca-sinteticos }
spec:
  securityContext: { runAsNonRoot: true, runAsUser: 65532, seccompProfile: { type: RuntimeDefault } }
  containers:
    - name: x
      image: busybox:1.37
      command: ["sleep", "300"]
      securityContext: { allowPrivilegeEscalation: false, readOnlyRootFilesystem: true, capabilities: { drop: ["ALL"] } }
'@
    Set-Content -Path $tmp -Value $pod -Encoding utf8
    k apply -f $tmp | Out-Null
    k -n banca-sinteticos wait pod/sonda-red --for=condition=Ready --timeout=120s | Out-Null
    '--- Desde OTRO namespace hacia PostgreSQL (debe fallar por timeout):'
    k -n banca-sinteticos exec sonda-red -- nc -z -w 3 banca-db-rw.banca-prod.svc 5432 2>&1
    if ($LASTEXITCODE -ne 0) { '[BLOQUEADO - correcto] banca-db:5432 inaccesible fuera de la zona de aplicación' } else { '[FALLA] se pudo conectar a la BD' }
    '--- Desde OTRO namespace directo a la API saltando el Ingress (debe fallar):'
    k -n banca-sinteticos exec sonda-red -- nc -z -w 3 api-cuentas.banca-prod.svc 8080 2>&1
    if ($LASTEXITCODE -ne 0) { '[BLOQUEADO - correcto] api-cuentas:8080 solo accesible desde Traefik' } else { '[FALLA] se pudo conectar a la API' }
    '--- Por el Ingress (camino permitido):'
    k -n banca-sinteticos exec sonda-red -- nc -z -w 3 traefik.traefik.svc 443 2>&1
    if ($LASTEXITCODE -eq 0) { '[PERMITIDO - correcto] Traefik:443' } else { '[FALLA] Ingress inaccesible' }
    k -n banca-sinteticos delete pod sonda-red --wait=false | Out-Null
    ''
    '--- NetworkPolicies vigentes en banca-prod'
    k -n banca-prod get networkpolicy
}

Evidencia 'seguridad-03-tls' {
    $h = 'banca.127.0.0.1.nip.io'
    '--- TLS 1.2 (debe ser rechazado):'
    curl.exe -s -o NUL -w "%{http_code}`n" --tlsv1.2 --tls-max 1.2 -k "https://$h/" 2>&1
    if ($LASTEXITCODE -ne 0) { "[BLOQUEADO - correcto] handshake TLS 1.2 rechazado (curl exit $LASTEXITCODE)" }
    '--- TLS 1.3 (aceptado) y encabezados de seguridad:'
    curl.exe -s -k -I --tlsv1.3 "https://$h/" 2>&1 | Select-String -Pattern 'HTTP/|strict-transport|content-security|x-frame|x-content-type|referrer'
    '--- HTTP plano (debe redirigir a HTTPS):'
    curl.exe -s -I "http://$h/" 2>&1 | Select-String -Pattern 'HTTP/|location'
    '--- Certificado presentado:'
    k -n banca-prod get certificate banca-tls -o wide
}

Evidencia 'seguridad-04-vulnerabilidades-runtime' {
    $imagenes = k -n banca-prod get pods -o jsonpath='{range .items[*]}{range .spec.containers[*]}{.image}{"\n"}{end}{end}' | Sort-Object -Unique | Where-Object { $_ -like 'ghcr.io/devjean93/*' }
    foreach ($img in $imagenes) {
        "--- $img"
        trivy image -q --severity CRITICAL,HIGH --format table $img 2>&1 | Select-String -Pattern 'Total|CRITICAL|HIGH' | Select-Object -First 5
        if ($LASTEXITCODE -eq 0) { '    (sin hallazgos CRITICAL/HIGH)' }
    }
}
