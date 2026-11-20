import { z } from 'zod';
import type {} from '@fastify/cookie';
import { requerirSesion, sesionDe, type Servidor, type VerificadorSesion, type ZodTypeProvider } from '@bancagt/plataforma';
import type {
  CalcularFlujo,
  ConsultarCuenta,
  ConsultarMovimientos,
  ConsultarPosicion,
  GenerarEstadoCuenta,
} from '../aplicacion/casos-uso.js';
import { aCuentaDto, aEstadoCuentaDto, aMovimientoDto, aPuntoFlujoDto } from './dto.js';

export interface Dependencias {
  verificador: VerificadorSesion;
  consultarPosicion: ConsultarPosicion;
  consultarCuenta: ConsultarCuenta;
  consultarMovimientos: ConsultarMovimientos;
  generarEstadoCuenta: GenerarEstadoCuenta;
  calcularFlujo: CalcularFlujo;
}

const CATEGORIAS = [
  'SALARIO', 'TRANSFERENCIA', 'SERVICIOS', 'SUPERMERCADO', 'RESTAURANTE', 'COMBUSTIBLE', 'CAJERO',
  'SALUD', 'EDUCACION', 'ENTRETENIMIENTO', 'COMPRAS', 'INTERESES', 'COMISIONES', 'OTROS',
] as const;

const paramsCuenta = z.object({ id: z.uuid() });

const consultaMovimientos = z.object({
  desde: z.iso.date().optional(),
  hasta: z.iso.date().optional(),
  tipo: z.enum(['CREDITO', 'DEBITO']).optional(),
  categoria: z.enum(CATEGORIAS).optional(),
  texto: z.string().trim().min(2).max(40).optional(),
  pagina: z.coerce.number().int().min(1).max(1000).default(1),
  tamano: z.coerce.number().int().min(5).max(100).default(20),
});

const consultaEstado = z.object({
  periodo: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Formato AAAA-MM'),
});

const consultaFlujo = z.object({ dias: z.coerce.number().int().min(7).max(90).default(30) });

/** Fin del día (incluyente) para filtros "hasta". */
const finDeDia = (iso: string) => new Date(`${iso}T23:59:59.999Z`);

export function registrarRutas(app: Servidor, d: Dependencias): void {
  app.register(async (base) => {
    const rutas = base.withTypeProvider<ZodTypeProvider>();
    rutas.addHook('preHandler', requerirSesion(d.verificador));

    rutas.get('/api/v1/cuentas', async (req) => {
      const p = await d.consultarPosicion.ejecutar(sesionDe(req).clienteId);
      return {
        cuentas: p.cuentas.map(aCuentaDto),
        totales: p.totales.map((t) => ({ moneda: t.moneda, disponible: t.disponible.aTexto(), contable: t.contable.aTexto() })),
      };
    });

    rutas.get('/api/v1/cuentas/:id', { schema: { params: paramsCuenta } }, async (req) =>
      aCuentaDto(await d.consultarCuenta.ejecutar(req.params.id, sesionDe(req).clienteId)),
    );

    rutas.get(
      '/api/v1/cuentas/:id/movimientos',
      { schema: { params: paramsCuenta, querystring: consultaMovimientos } },
      async (req) => {
        const q = req.query;
        const r = await d.consultarMovimientos.ejecutar(
          req.params.id,
          sesionDe(req).clienteId,
          {
            ...(q.desde ? { desde: new Date(`${q.desde}T00:00:00Z`) } : {}),
            ...(q.hasta ? { hasta: finDeDia(q.hasta) } : {}),
            ...(q.tipo ? { tipo: q.tipo } : {}),
            ...(q.categoria ? { categoria: q.categoria } : {}),
            ...(q.texto ? { texto: q.texto } : {}),
          },
          q.pagina,
          q.tamano,
        );
        return {
          elementos: r.elementos.map(aMovimientoDto),
          total: r.total,
          pagina: r.pagina,
          tamano: r.tamano,
          paginas: Math.max(1, Math.ceil(r.total / r.tamano)),
        };
      },
    );

    rutas.get(
      '/api/v1/cuentas/:id/estado-cuenta',
      { schema: { params: paramsCuenta, querystring: consultaEstado } },
      async (req) => {
        const [anio, mes] = req.query.periodo.split('-').map(Number) as [number, number];
        return aEstadoCuentaDto(await d.generarEstadoCuenta.ejecutar(req.params.id, sesionDe(req).clienteId, anio, mes));
      },
    );

    rutas.get(
      '/api/v1/cuentas/:id/flujo',
      { schema: { params: paramsCuenta, querystring: consultaFlujo } },
      async (req) => (await d.calcularFlujo.ejecutar(req.params.id, sesionDe(req).clienteId, req.query.dias)).map(aPuntoFlujoDto),
    );
  });
}
