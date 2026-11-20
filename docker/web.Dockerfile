# syntax=docker/dockerfile:1
# Portal web (React + Vite) servido por Nginx sin privilegios.

# ---------- 1. Compilación ----------
FROM node:24-trixie-slim AS compilacion
ARG APP_VERSION=dev
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/plataforma/package.json packages/plataforma/
COPY packages/db-core/package.json packages/db-core/
COPY packages/db-identidad/package.json packages/db-identidad/
COPY apps/api-identidad/package.json apps/api-identidad/
COPY apps/api-cuentas/package.json apps/api-cuentas/
COPY apps/api-transferencias/package.json apps/api-transferencias/
COPY apps/db-migraciones/package.json apps/db-migraciones/
COPY apps/web-banca/package.json apps/web-banca/
# Etapa de compilación: se instala todo (incluye TypeScript y Vite); nada de esto llega al runtime.
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY apps/web-banca ./apps/web-banca
RUN npm run build -w @bancagt/web-banca && echo "v${APP_VERSION}" > apps/web-banca/dist/version.txt

# ---------- 2. Runtime ----------
FROM nginxinc/nginx-unprivileged:1.29-alpine
ARG APP_VERSION=dev
LABEL org.opencontainers.image.title="web-banca" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.source="https://github.com/DevJean93/bancagt" \
      org.opencontainers.image.description="BancaGT - portal web"
USER root
# Parches del sistema base y se eliminan utilidades innecesarias (curl, wget).
RUN apk upgrade --no-cache \
 && apk del --no-cache curl \
 && rm -f /etc/nginx/conf.d/default.conf /usr/bin/wget
COPY --chown=101:101 apps/web-banca/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=compilacion --chown=101:101 /repo/apps/web-banca/dist /usr/share/nginx/html
USER 101:101
EXPOSE 8080
