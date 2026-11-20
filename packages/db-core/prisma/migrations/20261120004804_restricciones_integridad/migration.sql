-- Restricciones de integridad que el lenguaje de esquema de Prisma no expresa.
-- Defensa en profundidad: la base de datos rechaza estados imposibles aunque
-- una versión defectuosa de la aplicación intente escribirlos.

ALTER TABLE "core"."cuentas"
  ADD CONSTRAINT "cuentas_saldo_contable_no_negativo" CHECK ("saldo_contable" >= 0),
  ADD CONSTRAINT "cuentas_saldo_disponible_no_negativo" CHECK ("saldo_disponible" >= 0),
  ADD CONSTRAINT "cuentas_disponible_menor_igual_contable" CHECK ("saldo_disponible" <= "saldo_contable"),
  ADD CONSTRAINT "cuentas_numero_formato" CHECK ("numero" ~ '^[0-9]{10}$');

ALTER TABLE "core"."movimientos"
  ADD CONSTRAINT "movimientos_monto_positivo" CHECK ("monto" > 0);

ALTER TABLE "core"."transferencias"
  ADD CONSTRAINT "transferencias_monto_positivo" CHECK ("monto" > 0),
  ADD CONSTRAINT "transferencias_cuentas_distintas" CHECK ("cuenta_origen_id" <> "cuenta_destino_id");
