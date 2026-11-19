# syntax=docker/dockerfile:1
# api-transferencias: imagen endurecida (multi-stage + distroless + non-root).

# ---------- Etapa 1: dependencias y pruebas ----------
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
# Instalación reproducible; --ignore-scripts bloquea scripts post-install maliciosos.
RUN npm ci --ignore-scripts
COPY src ./src
COPY test ./test
# Si las pruebas fallan, la imagen no se construye.
RUN npm test && npm prune --omit=dev && npm cache clean --force && rm -rf test

# ---------- Etapa 2: ejecución ----------
# Distroless: sin shell, sin gestor de paquetes, usuario nonroot (UID 65532).
FROM gcr.io/distroless/nodejs24-debian13:nonroot
ARG APP_VERSION=dev
LABEL org.opencontainers.image.title="api-transferencias" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.source="https://github.com/DevJean93/bancagt" \
      org.opencontainers.image.description="BancaGT - api-transferencias"
ENV NODE_ENV=production \
    PORT=8080 \
    APP_VERSION=${APP_VERSION}
WORKDIR /app
COPY --from=build --chown=65532:65532 /app /app
USER 65532:65532
EXPOSE 8080
# El ENTRYPOINT de distroless ya es "node". El tracing se carga antes que la app.
CMD ["--require", "./src/lib/tracing.js", "src/server.js"]
