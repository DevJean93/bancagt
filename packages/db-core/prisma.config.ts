import { defineConfig } from 'prisma/config';

// DATABASE_URL solo la necesitan los comandos de migración (lo arma el Job
// db-migraciones con las credenciales de Vault). "generate" no la usa.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? 'postgresql://sin-configurar@localhost:5432/banca?schema=core',
  },
});
