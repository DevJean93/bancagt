import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance, type FastifyError } from 'fastify';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import {
  serializerCompiler,
  validatorCompiler,
  hasZodFastifySchemaValidationErrors,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { ConfigBase } from './config.js';
import { ErrorAplicacion, ErrorProhibido } from './errores.js';
import { crearMetricas, registrarMetricasHttp, type Metricas } from './metricas.js';

export type { ZodTypeProvider };

export type Servidor = FastifyInstance<
  import('node:http').Server,
  import('node:http').IncomingMessage,
  import('node:http').ServerResponse,
  import('fastify').FastifyBaseLogger,
  ZodTypeProvider
>;

export interface OpcionesServidor {
  nombre: string;
  config: ConfigBase;
  /** Comprueba dependencias (BD). Si lanza, /ready responde 503. */
  verificarListo: () => Promise<void>;
}

const SONDAS = new Set(['/health', '/ready', '/metrics']);
const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Factory del servidor HTTP: concentra las preocupaciones transversales
 * (seguridad, errores, métricas, sondas) para que cada microservicio solo
 * registre sus rutas de negocio.
 */
export async function crearServidor(op: OpcionesServidor): Promise<{ app: Servidor; metricas: Metricas }> {
  const app = Fastify({
    logger: {
      level: op.config.LOG_LEVEL,
      base: { servicio: op.nombre, version: op.config.APP_VERSION },
      // Nivel como texto ("info", "warn") para que Grafana/Loki lo reconozcan y coloreen.
      formatters: { level: (etiqueta: string) => ({ level: etiqueta }) },
      // Nunca se registran credenciales ni cookies de sesión (PCI-DSS 3.3 / 10).
      redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
    },
    genReqId: (req) => (req.headers['x-request-id'] as string | undefined) ?? randomUUID(),
    requestIdHeader: 'x-request-id',
    trustProxy: true, // detrás de Traefik: la IP real viene en X-Forwarded-For
    bodyLimit: 16 * 1024,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  await app.register(cookie);
  await app.register(helmet, {
    // Las APIs solo devuelven JSON: nada se puede cargar ni incrustar.
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    hsts: false, // HSTS lo aplica Traefik en el borde
  });

  const metricas = crearMetricas(op.nombre);
  registrarMetricasHttp(app, metricas);

  app.addHook('onSend', async (req, reply) => {
    reply.header('Cache-Control', 'no-store');
    reply.header('X-App-Version', op.config.APP_VERSION);
    reply.header('X-Request-Id', req.id);
  });

  // Anti-CSRF: además de SameSite=Strict, toda operación que modifica estado
  // debe venir del origen del portal.
  app.addHook('onRequest', async (req) => {
    if (METODOS_SEGUROS.has(req.method) || SONDAS.has(req.url)) return;
    const origen = req.headers.origin;
    if (origen !== op.config.ORIGEN_PERMITIDO) {
      throw new ErrorProhibido('Origen no permitido para esta operación');
    }
  });

  // Inyección de fallas (demo del canary). Las sondas no se ven afectadas: la
  // falla es "silenciosa" para Kubernetes y la debe detectar el análisis.
  app.addHook('onRequest', async (req, reply) => {
    if (SONDAS.has(req.url)) return;
    if (op.config.FAULT_RATE > 0 && Math.random() < op.config.FAULT_RATE) {
      req.log.error({ evento: 'falla-inyectada' }, 'Falla inyectada');
      return reply.code(500).type('application/problem+json').send({
        type: 'https://bancagt.dev/problemas/error-interno',
        title: 'Error interno simulado',
        status: 500,
      });
    }
    if (op.config.FAULT_LATENCY_MS > 0) {
      await new Promise((r) => setTimeout(r, op.config.FAULT_LATENCY_MS));
    }
  });

  app.get('/health', { logLevel: 'warn' }, async () => ({ estado: 'ok' }));
  app.get('/ready', { logLevel: 'warn' }, async (_req, reply) => {
    try {
      await op.verificarListo();
      return { estado: 'ok' };
    } catch (err) {
      app.log.warn({ err }, 'Dependencia no disponible');
      return reply.code(503).send({ estado: 'no-listo' });
    }
  });

  // Respuestas de error con formato estándar RFC 9457 (application/problem+json).
  app.setErrorHandler((err: FastifyError | ErrorAplicacion, req, reply) => {
    const problema = (status: number, tipo: string, titulo: string, extra: Record<string, unknown> = {}) =>
      reply
        .code(status)
        .type('application/problem+json')
        .send({ type: `https://bancagt.dev/problemas/${tipo}`, title: titulo, status, instance: req.url, ...extra });

    if (err instanceof ErrorAplicacion) {
      const codigo = 'codigo' in err ? { codigo: err.codigo } : {};
      return problema(err.status, err.tipo, err.message, { ...codigo, ...(err.detalle ?? {}) });
    }
    if (hasZodFastifySchemaValidationErrors(err)) {
      return problema(400, 'validacion', 'Datos inválidos', {
        errores: err.validation.map((v) => ({ campo: v.instancePath.replace(/^\//, '').replaceAll('/', '.'), mensaje: v.message })),
      });
    }
    const status = (err as FastifyError).statusCode;
    if (status && status < 500) {
      return problema(status, 'peticion-invalida', err.message);
    }
    req.log.error({ err }, 'Error no controlado');
    // Nunca se filtra el detalle interno al cliente.
    return problema(500, 'error-interno', 'Ocurrió un error interno. Intente de nuevo.');
  });

  app.setNotFoundHandler((req, reply) =>
    reply.code(404).type('application/problem+json').send({
      type: 'https://bancagt.dev/problemas/no-encontrado',
      title: 'Ruta no encontrada',
      status: 404,
      instance: req.url,
    }),
  );

  return { app, metricas };
}

/** Arranca el servidor y registra un apagado ordenado ante SIGTERM (zero-downtime). */
export async function iniciar(app: Servidor, puerto: number, alCerrar: () => Promise<void>): Promise<void> {
  const cerrar = async (senal: string) => {
    app.log.info({ senal }, 'Cerrando servidor');
    await app.close();
    await alCerrar();
    process.exit(0);
  };
  process.once('SIGTERM', () => void cerrar('SIGTERM'));
  process.once('SIGINT', () => void cerrar('SIGINT'));
  await app.listen({ port: puerto, host: '0.0.0.0' });
}
