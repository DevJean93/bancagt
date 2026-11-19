'use strict';

// Acceso a PostgreSQL (clúster CloudNativePG). Las credenciales vienen de un
// Secret que External Secrets sincroniza desde Vault y se montan como archivo.
// La contraseña se lee en CADA conexión nueva: si Vault la rota, el kubelet
// actualiza el archivo y la app la toma sin reiniciar (rotación sin downtime).
const fs = require('fs');
const { Pool } = require('pg');

function leerArchivo(ruta) {
  return fs.readFileSync(ruta, 'utf8').trim();
}

function crearPool() {
  const caPath = process.env.DB_SSL_CA;
  const userFile = process.env.DB_USER_FILE;
  const passFile = process.env.DB_PASSWORD_FILE;
  return new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'banca',
    user: userFile ? leerArchivo(userFile) : process.env.DB_USER || 'banca',
    password: passFile ? () => leerArchivo(passFile) : process.env.DB_PASSWORD,
    // TLS verificado contra la CA del clúster de base de datos (PCI-DSS req. 4).
    ssl: caPath ? { ca: leerArchivo(caPath), rejectUnauthorized: true } : false,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 3000,
    statement_timeout: 5000,
  });
}

module.exports = { crearPool };
