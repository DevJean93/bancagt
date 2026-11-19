'use strict';

// Repositorio de transferencias. La operación completa (débito, crédito,
// movimientos y registro) ocurre en UNA transacción con bloqueo de filas,
// así dos transferencias simultáneas no pueden dejar un saldo negativo.

class ErrorNegocio extends Error {
  constructor(status, mensaje) {
    super(mensaje);
    this.status = status;
  }
}

const COLUMNAS = `id, idempotency_key, origen, destino, monto::float8 AS monto, moneda, estado, creado_en`;

function crearRepositorio(pool) {
  async function buscarPorClave(cliente, clave) {
    const { rows } = await cliente.query(`SELECT ${COLUMNAS} FROM transferencias WHERE idempotency_key = $1`, [clave]);
    return rows[0] || null;
  }

  return {
    ErrorNegocio,

    async ping() {
      await pool.query('SELECT 1');
    },

    async obtener(id) {
      const { rows } = await pool.query(`SELECT ${COLUMNAS} FROM transferencias WHERE id = $1`, [id]);
      return rows[0] || null;
    },

    async transferir({ clave, origen, destino, monto }) {
      const cliente = await pool.connect();
      try {
        await cliente.query('BEGIN ISOLATION LEVEL READ COMMITTED');

        // Idempotencia: si la clave ya existe se devuelve el resultado original.
        const previa = await buscarPorClave(cliente, clave);
        if (previa) {
          await cliente.query('ROLLBACK');
          return { repetida: true, transferencia: previa };
        }

        // Bloqueo en orden fijo (por id) para evitar interbloqueos.
        const { rows: cuentas } = await cliente.query(
          'SELECT id, moneda, saldo FROM cuentas WHERE id = ANY($1::text[]) ORDER BY id FOR UPDATE',
          [[origen, destino]],
        );
        const cOrigen = cuentas.find((c) => c.id === origen);
        const cDestino = cuentas.find((c) => c.id === destino);
        if (!cOrigen || !cDestino) throw new ErrorNegocio(404, 'Cuenta de origen o destino no existe');
        if (cOrigen.moneda !== cDestino.moneda) throw new ErrorNegocio(422, 'Las cuentas tienen monedas distintas');
        if (Number(cOrigen.saldo) < monto) throw new ErrorNegocio(422, 'Saldo insuficiente');

        await cliente.query('UPDATE cuentas SET saldo = saldo - $2 WHERE id = $1', [origen, monto]);
        await cliente.query('UPDATE cuentas SET saldo = saldo + $2 WHERE id = $1', [destino, monto]);

        const { rows } = await cliente.query(
          `INSERT INTO transferencias (idempotency_key, origen, destino, monto, moneda, estado)
           VALUES ($1, $2, $3, $4, $5, 'COMPLETADA')
           RETURNING ${COLUMNAS}`,
          [clave, origen, destino, monto, cOrigen.moneda],
        );
        const t = rows[0];
        await cliente.query(
          `INSERT INTO movimientos (cuenta_id, tipo, monto, referencia) VALUES
             ($1, 'DEBITO', $3, $4), ($2, 'CREDITO', $3, $4)`,
          [origen, destino, monto, `TRF-${t.id}`],
        );

        await cliente.query('COMMIT');
        return { repetida: false, transferencia: t };
      } catch (err) {
        await cliente.query('ROLLBACK').catch(() => {});
        // Carrera entre dos peticiones con la misma clave: gana la primera.
        if (err.code === '23505') {
          const previa = await buscarPorClave(pool, clave);
          if (previa) return { repetida: true, transferencia: previa };
        }
        throw err;
      } finally {
        cliente.release();
      }
    },
  };
}

module.exports = { crearRepositorio, ErrorNegocio };
