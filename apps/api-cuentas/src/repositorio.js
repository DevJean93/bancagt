'use strict';

// Repositorio de cuentas sobre PostgreSQL. Todas las consultas son
// parametrizadas ($1, $2...) para evitar inyección SQL.

function crearRepositorio(pool) {
  return {
    async ping() {
      await pool.query('SELECT 1');
    },

    async obtenerCuenta(id) {
      const { rows } = await pool.query(
        'SELECT id, titular, moneda, saldo::float8 AS saldo FROM cuentas WHERE id = $1',
        [id],
      );
      return rows[0] || null;
    },

    async listarMovimientos(id, limite) {
      const { rows } = await pool.query(
        `SELECT id, tipo, monto::float8 AS monto, referencia, creado_en
           FROM movimientos
          WHERE cuenta_id = $1
          ORDER BY creado_en DESC, id DESC
          LIMIT $2`,
        [id, limite],
      );
      return rows;
    },
  };
}

module.exports = { crearRepositorio };
