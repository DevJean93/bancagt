-- CreateEnum
CREATE TYPE "TipoCuenta" AS ENUM ('MONETARIA', 'AHORRO');

-- CreateEnum
CREATE TYPE "Moneda" AS ENUM ('GTQ', 'USD');

-- CreateEnum
CREATE TYPE "EstadoCuenta" AS ENUM ('ACTIVA', 'BLOQUEADA', 'CERRADA');

-- CreateEnum
CREATE TYPE "TipoMovimiento" AS ENUM ('CREDITO', 'DEBITO');

-- CreateEnum
CREATE TYPE "Categoria" AS ENUM ('SALARIO', 'TRANSFERENCIA', 'SERVICIOS', 'SUPERMERCADO', 'RESTAURANTE', 'COMBUSTIBLE', 'CAJERO', 'SALUD', 'EDUCACION', 'ENTRETENIMIENTO', 'COMPRAS', 'INTERESES', 'COMISIONES', 'OTROS');

-- CreateEnum
CREATE TYPE "EstadoTransferencia" AS ENUM ('COMPLETADA', 'RECHAZADA');

-- CreateTable
CREATE TABLE "clientes" (
    "id" UUID NOT NULL,
    "codigo" VARCHAR(12) NOT NULL,
    "nombres" VARCHAR(80) NOT NULL,
    "apellidos" VARCHAR(80) NOT NULL,
    "correo" VARCHAR(120) NOT NULL,
    "telefono" VARCHAR(20) NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cuentas" (
    "id" UUID NOT NULL,
    "numero" VARCHAR(12) NOT NULL,
    "cliente_id" UUID NOT NULL,
    "tipo" "TipoCuenta" NOT NULL,
    "moneda" "Moneda" NOT NULL,
    "alias" VARCHAR(40),
    "estado" "EstadoCuenta" NOT NULL DEFAULT 'ACTIVA',
    "saldo_contable" DECIMAL(14,2) NOT NULL,
    "saldo_disponible" DECIMAL(14,2) NOT NULL,
    "abierta_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cuentas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "movimientos" (
    "id" BIGSERIAL NOT NULL,
    "cuenta_id" UUID NOT NULL,
    "fecha" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tipo" "TipoMovimiento" NOT NULL,
    "categoria" "Categoria" NOT NULL,
    "descripcion" VARCHAR(120) NOT NULL,
    "monto" DECIMAL(14,2) NOT NULL,
    "saldo_posterior" DECIMAL(14,2) NOT NULL,
    "referencia" VARCHAR(40),
    "transferencia_id" UUID,

    CONSTRAINT "movimientos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transferencias" (
    "id" UUID NOT NULL,
    "numero" BIGSERIAL NOT NULL,
    "cliente_id" UUID NOT NULL,
    "idempotency_key" VARCHAR(64) NOT NULL,
    "cuenta_origen_id" UUID NOT NULL,
    "cuenta_destino_id" UUID NOT NULL,
    "monto" DECIMAL(14,2) NOT NULL,
    "moneda" "Moneda" NOT NULL,
    "concepto" VARCHAR(80) NOT NULL,
    "estado" "EstadoTransferencia" NOT NULL,
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transferencias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "beneficiarios" (
    "id" UUID NOT NULL,
    "cliente_id" UUID NOT NULL,
    "cuenta_id" UUID NOT NULL,
    "alias" VARCHAR(40) NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "beneficiarios_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clientes_codigo_key" ON "clientes"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "clientes_correo_key" ON "clientes"("correo");

-- CreateIndex
CREATE UNIQUE INDEX "cuentas_numero_key" ON "cuentas"("numero");

-- CreateIndex
CREATE INDEX "cuentas_cliente_id_idx" ON "cuentas"("cliente_id");

-- CreateIndex
CREATE INDEX "movimientos_cuenta_id_fecha_idx" ON "movimientos"("cuenta_id", "fecha" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "transferencias_numero_key" ON "transferencias"("numero");

-- CreateIndex
CREATE INDEX "transferencias_cliente_id_creada_en_idx" ON "transferencias"("cliente_id", "creada_en" DESC);

-- CreateIndex
CREATE INDEX "transferencias_cuenta_origen_id_creada_en_idx" ON "transferencias"("cuenta_origen_id", "creada_en");

-- CreateIndex
CREATE UNIQUE INDEX "transferencias_cliente_id_idempotency_key_key" ON "transferencias"("cliente_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "beneficiarios_cliente_id_cuenta_id_key" ON "beneficiarios"("cliente_id", "cuenta_id");

-- AddForeignKey
ALTER TABLE "cuentas" ADD CONSTRAINT "cuentas_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "cuentas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "movimientos" ADD CONSTRAINT "movimientos_transferencia_id_fkey" FOREIGN KEY ("transferencia_id") REFERENCES "transferencias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_cuenta_origen_id_fkey" FOREIGN KEY ("cuenta_origen_id") REFERENCES "cuentas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transferencias" ADD CONSTRAINT "transferencias_cuenta_destino_id_fkey" FOREIGN KEY ("cuenta_destino_id") REFERENCES "cuentas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beneficiarios" ADD CONSTRAINT "beneficiarios_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beneficiarios" ADD CONSTRAINT "beneficiarios_cuenta_id_fkey" FOREIGN KEY ("cuenta_id") REFERENCES "cuentas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
