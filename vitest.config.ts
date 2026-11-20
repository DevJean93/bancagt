import { defineConfig } from 'vitest/config';

// Las pruebas importan los paquetes del monorepo desde su código fuente
// (condición "source"), sin necesidad de compilar antes.
export default defineConfig({
  resolve: {
    conditions: ['source'],
  },
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      // Capas con lógica de negocio (dominio + casos de uso). La infraestructura y la
      // UI se validan con la prueba E2E y el monitoreo sintético.
      include: ['packages/plataforma/src/dinero.ts', 'apps/api-*/src/dominio/**', 'apps/api-*/src/aplicacion/**'],
      exclude: ['**/generated/**'],
      // Compuerta de calidad: la CI falla si la cobertura del dominio baja de 80 %.
      thresholds: { statements: 80, branches: 75, functions: 75, lines: 80 },
    },
  },
});
