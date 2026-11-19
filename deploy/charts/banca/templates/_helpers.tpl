{{/* Etiquetas comunes de un servicio */}}
{{- define "banca.etiquetas" -}}
app.kubernetes.io/name: {{ .nombre }}
app.kubernetes.io/part-of: bancagt
app.kubernetes.io/managed-by: argocd
{{- end -}}

{{/* Referencia de imagen: tag + digest inmutable (lo que se firmó con cosign) */}}
{{- define "banca.imagen" -}}
{{- $img := printf "%s/%s:%s" .raiz.Values.registro .nombre (.svc.imagen.tag | default "pendiente") -}}
{{- if .svc.imagen.digest -}}
{{- printf "%s@%s" $img .svc.imagen.digest -}}
{{- else -}}
{{- $img -}}
{{- end -}}
{{- end -}}
