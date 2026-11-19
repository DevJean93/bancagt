# syntax=docker/dockerfile:1
# web-banca: portal estático servido por Nginx sin privilegios.

# ---------- Etapa 1: preparar los archivos ----------
FROM alpine:3.22 AS build
ARG APP_VERSION=dev
WORKDIR /site
COPY public/ ./
RUN echo "v${APP_VERSION}" > version.txt

# ---------- Etapa 2: ejecución ----------
# nginx-unprivileged corre como UID 101 y escucha en un puerto > 1024.
FROM nginxinc/nginx-unprivileged:1.29-alpine
ARG APP_VERSION=dev
LABEL org.opencontainers.image.title="web-banca" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.source="https://github.com/DevJean93/bancagt" \
      org.opencontainers.image.description="BancaGT - portal web"

USER root
# Se eliminan utilidades que un atacante podría aprovechar dentro del contenedor.
# Además se aplican los parches de seguridad del sistema base (Trivy los exige).
RUN apk upgrade --no-cache \
 && apk del --no-cache curl \
 && rm -f /etc/nginx/conf.d/default.conf /usr/bin/wget
COPY --chown=101:101 nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build --chown=101:101 /site /usr/share/nginx/html
USER 101:101

EXPOSE 8080
