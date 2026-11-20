# syntax=docker/dockerfile:1
# Imagen endurecida para cualquier servicio Node del monorepo.
#   docker build -f docker/servicio-node.Dockerfile --build-arg SERVICIO=api-cuentas .
# Etapas: dependencias → compilación (TS + Prisma) → dependencias de producción → runtime distroless.
ARG SERVICIO

# ---------- 1. Dependencias completas (para compilar) ----------
FROM node:24-trixie-slim AS dependencias
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
# --ignore-scripts: ningún paquete ejecuta código durante la instalación (cadena de suministro).
RUN npm ci --ignore-scripts --no-audit --no-fund

# ---------- 2. Compilación ----------
FROM dependencias AS compilacion
ARG SERVICIO
COPY tsconfig.base.json tsconfig.json ./
COPY packages ./packages
COPY apps/${SERVICIO} ./apps/${SERVICIO}
RUN npx prisma generate --schema packages/db-core/prisma/schema.prisma \
 && npx prisma generate --schema packages/db-identidad/prisma/schema.prisma \
 && npx tsc -b apps/${SERVICIO}

# ---------- 3. Solo dependencias de producción del servicio ----------
FROM node:24-trixie-slim AS produccion
ARG SERVICIO
WORKDIR /repo
COPY --from=dependencias /repo/package.json /repo/package-lock.json ./
COPY --from=dependencias /repo/packages ./packages
COPY --from=dependencias /repo/apps/${SERVICIO}/package.json ./apps/${SERVICIO}/package.json
# El monorepo se reduce a los paquetes compartidos + ESTE servicio: la imagen
# no arrastra dependencias de otros servicios (React, CLI de Prisma, etc.).
# Las versiones salen del lockfile; se omiten dependencias de desarrollo y "peer".
# (npm instala las devDependencies de cada workspace aun con --omit=dev, por eso
# también se eliminan de sus package.json en esta etapa.)
RUN node -e "const fs=require('fs');const ws=['packages/plataforma','packages/db-core','packages/db-identidad','apps/${SERVICIO}'];const p=JSON.parse(fs.readFileSync('package.json'));p.workspaces=ws;delete p.devDependencies;fs.writeFileSync('package.json',JSON.stringify(p));for(const w of ws){const f=w+'/package.json';const q=JSON.parse(fs.readFileSync(f));delete q.devDependencies;fs.writeFileSync(f,JSON.stringify(q))}" \
 && npm install --omit=dev --omit=peer --ignore-scripts --no-audit --no-fund \
 && if [ "${SERVICIO}" = "db-migraciones" ]; then npm rebuild prisma @prisma/engines; fi \
 && find node_modules/@prisma/client/runtime -type f \( -name '*mysql*' -o -name '*sqlserver*' -o -name '*sqlite*' -o -name '*cockroachdb*' \) -delete \
 && npm cache clean --force

# ---------- 4. Runtime: distroless, sin shell, usuario no root ----------
FROM gcr.io/distroless/nodejs24-debian13:nonroot
ARG SERVICIO
ARG APP_VERSION=dev
LABEL org.opencontainers.image.title="${SERVICIO}" \
      org.opencontainers.image.version="${APP_VERSION}" \
      org.opencontainers.image.source="https://github.com/DevJean93/bancagt" \
      org.opencontainers.image.description="BancaGT - ${SERVICIO}"
ENV NODE_ENV=production \
    PORT=8080 \
    APP_VERSION=${APP_VERSION}
WORKDIR /repo
COPY --from=produccion --chown=65532:65532 /repo/node_modules ./node_modules
COPY --from=compilacion --chown=65532:65532 /repo/packages ./packages
COPY --from=compilacion --chown=65532:65532 /repo/apps/${SERVICIO}/dist ./apps/${SERVICIO}/dist
COPY --from=compilacion --chown=65532:65532 /repo/apps/${SERVICIO}/package.json ./apps/${SERVICIO}/package.json
WORKDIR /repo/apps/${SERVICIO}
USER 65532:65532
EXPOSE 8080
# El ENTRYPOINT de distroless es "node". OpenTelemetry se carga antes que la app.
CMD ["--import", "@bancagt/plataforma/tracing", "dist/main.js"]
