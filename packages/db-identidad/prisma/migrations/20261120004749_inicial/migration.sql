-- CreateEnum
CREATE TYPE "TipoEventoAcceso" AS ENUM ('LOGIN_OK', 'LOGIN_FALLIDO', 'BLOQUEO', 'RENOVACION', 'CIERRE');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" UUID NOT NULL,
    "usuario" VARCHAR(40) NOT NULL,
    "cliente_id" UUID NOT NULL,
    "nombre_mostrar" VARCHAR(80) NOT NULL,
    "hash_contrasena" VARCHAR(200) NOT NULL,
    "intentos_fallidos" INTEGER NOT NULL DEFAULT 0,
    "bloqueado_hasta" TIMESTAMPTZ(3),
    "ultimo_acceso" TIMESTAMPTZ(3),
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eventos_acceso" (
    "id" BIGSERIAL NOT NULL,
    "usuario_id" UUID,
    "usuario" VARCHAR(40) NOT NULL,
    "tipo" "TipoEventoAcceso" NOT NULL,
    "ip" VARCHAR(45) NOT NULL,
    "user_agent" VARCHAR(200) NOT NULL,
    "fecha" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "eventos_acceso_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_usuario_key" ON "usuarios"("usuario");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_cliente_id_key" ON "usuarios"("cliente_id");

-- CreateIndex
CREATE INDEX "eventos_acceso_usuario_id_fecha_idx" ON "eventos_acceso"("usuario_id", "fecha" DESC);

-- CreateIndex
CREATE INDEX "eventos_acceso_fecha_idx" ON "eventos_acceso"("fecha");

-- AddForeignKey
ALTER TABLE "eventos_acceso" ADD CONSTRAINT "eventos_acceso_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
