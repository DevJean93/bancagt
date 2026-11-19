-- Esquema de BancaGT. Lo ejecuta CloudNativePG una sola vez al crear la BD.
-- Los objetos quedan a nombre del rol de la aplicación (banca).
SET ROLE banca;

CREATE TABLE cuentas (
  id        text PRIMARY KEY CHECK (id ~ '^[0-9]{4}$'),
  titular   text NOT NULL,
  moneda    char(3) NOT NULL CHECK (moneda IN ('GTQ', 'USD')),
  -- Defensa en profundidad: la BD rechaza saldos negativos aunque la app falle.
  saldo     numeric(14, 2) NOT NULL DEFAULT 0 CHECK (saldo >= 0),
  creada_en timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE transferencias (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL UNIQUE,
  origen          text NOT NULL REFERENCES cuentas (id),
  destino         text NOT NULL REFERENCES cuentas (id),
  monto           numeric(14, 2) NOT NULL CHECK (monto > 0),
  moneda          char(3) NOT NULL,
  estado          text NOT NULL,
  creado_en       timestamptz NOT NULL DEFAULT now(),
  CHECK (origen <> destino)
);

CREATE TABLE movimientos (
  id         bigserial PRIMARY KEY,
  cuenta_id  text NOT NULL REFERENCES cuentas (id),
  tipo       text NOT NULL CHECK (tipo IN ('CREDITO', 'DEBITO')),
  monto      numeric(14, 2) NOT NULL CHECK (monto > 0),
  referencia text NOT NULL,
  creado_en  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX movimientos_cuenta_fecha ON movimientos (cuenta_id, creado_en DESC);

-- Datos ficticios de laboratorio (ningún dato real de clientes).
INSERT INTO cuentas (id, titular, moneda, saldo) VALUES
  ('1001', 'Cliente Demo A', 'GTQ', 15250.75),
  ('1002', 'Cliente Demo B', 'USD', 3200.00),
  ('1003', 'Cliente Demo C', 'GTQ', 500.00),
  ('2001', 'Cliente Demo D', 'USD', 820.40);

INSERT INTO movimientos (cuenta_id, tipo, monto, referencia)
SELECT id, 'CREDITO', saldo, 'APERTURA' FROM cuentas;

RESET ROLE;
