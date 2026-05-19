{{- define "vsp.name" -}}
video-streaming-platform
{{- end -}}

{{- define "vsp.labels" -}}
app.kubernetes.io/part-of: video-streaming-platform
app.kubernetes.io/managed-by: Helm
{{- end -}}

{{- define "vsp.databaseUrl" -}}
postgres://$(POSTGRES_USER):$(POSTGRES_PASSWORD)@postgres:5432/$(POSTGRES_DB)
{{- end -}}

