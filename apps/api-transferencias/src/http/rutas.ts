import { z } from 'zod';
import type {} from '@fastify/cookie';
import { ErrorValidacion, requerirSesion, sesionDe, type Servidor, type VerificadorSesion, type ZodTypeProvider } from '@bancagt/plataforma';
import { enmascararNumero, enmascararTitular, type Beneficiario, type Transferencia } from '../dominio/modelos.js';
import type { RealizarTransferencia } from '../aplicacion/transferir.js';
import type { ConsultarLimites, ConsultarTransferencias, GestionarBeneficiarios } from '../aplicacion/consultas.js';

export interface Dependencias {
  verificador: VerificadorSesion;
  realizar: RealizarTransferencia;
  consultar: ConsultarTransferencias;
  limites: ConsultarLimites;
  beneficiarios: GestionarBeneficiarios;
}

// ---------- Contratos de entrada ----------
const MONTO = z.string().regex(/^\d{1,9}(\.\d{1,2})?$/, 'Monto con hasta 2 decimales');
const CLAVE_IDEMPOTENCIA = z.string().regex(/^[A-Za-z0-9-]{8,64}$/);

const cuerpoTransferencia = z.object({
  cuentaOrigenId: z.uuid(),
  destino: z.discriminatedUnion('tipo', [
    z.object({ tipo: z.literal('PROPIA'), cuentaId: z.uuid() }),
    z.object({ tipo: z.literal('BENEFICIARIO'), beneficiarioId: z.uuid() }),
  ]),
  monto: MONTO,
  concepto: z.string().trim().min(3).max(80),
});

const cuerpoBeneficiario = z.object({
  numero: z.string().regex(/^\d{10}$/, 'El número de cuenta tiene 10 dígitos'),
  alias: z.string().trim().min(2).max(40),
});

const paginacion = z.object({
  pagina: z.coerce.number().int().min(1).max(1000).default(1),
  tamano: z.coerce.number().int().min(5).max(50).default(10),
});

// ---------- DTOs de salida ----------
const cuentaResumen = (c: Transferencia['origen']) => ({
  id: c.id,
  numeroEnmascarado: enmascararNumero(c.numero),
  tipo: c.tipo,
  titular: enmascararTitular(c.titular),
});

export const aComprobante = (t: Transferencia) => ({
  id: t.id,
  referencia: t.referencia,
  fecha: t.creadaEn.toISOString(),
  estado: t.estado,
  monto: t.monto.aTexto(),
  moneda: t.monto.moneda,
  concepto: t.concepto,
  origen: cuentaResumen(t.origen),
  destino: { ...cuentaResumen(t.destino), alias: t.aliasDestino, propia: t.destino.clienteId === t.clienteId },
});

const aBeneficiarioDto = (b: Beneficiario) => ({
  id: b.id,
  alias: b.alias,
  numeroEnmascarado: enmascararNumero(b.cuenta.numero),
  titular: enmascararTitular(b.cuenta.titular),
  tipo: b.cuenta.tipo,
  moneda: b.cuenta.moneda,
  creadoEn: b.creadoEn.toISOString(),
});

export function registrarRutas(app: Servidor, d: Dependencias): void {
  app.register(async (base) => {
    const r = base.withTypeProvider<ZodTypeProvider>();
    r.addHook('preHandler', requerirSesion(d.verificador));

    r.post('/api/v1/transferencias', { schema: { body: cuerpoTransferencia } }, async (req, reply) => {
      const clave = req.headers['idempotency-key'];
      const valida = CLAVE_IDEMPOTENCIA.safeParse(clave);
      if (!valida.success) throw new ErrorValidacion('Encabezado Idempotency-Key requerido (8-64 caracteres)');
      const r2 = await d.realizar.ejecutar(sesionDe(req), { ...req.body, idempotencyKey: valida.data });
      return reply.code(r2.repetida ? 200 : 201).send({ ...aComprobante(r2.transferencia), repetida: r2.repetida });
    });

    r.get('/api/v1/transferencias', { schema: { querystring: paginacion } }, async (req) => {
      const { pagina, tamano } = req.query;
      const res = await d.consultar.listar(sesionDe(req).clienteId, pagina, tamano);
      return { elementos: res.elementos.map(aComprobante), total: res.total, pagina, tamano, paginas: Math.max(1, Math.ceil(res.total / tamano)) };
    });

    r.get('/api/v1/transferencias/limites', async (req) => d.limites.ejecutar(sesionDe(req).clienteId));

    r.get('/api/v1/transferencias/:id', { schema: { params: z.object({ id: z.uuid() }) } }, async (req) =>
      aComprobante(await d.consultar.comprobante(req.params.id, sesionDe(req).clienteId)),
    );

    r.get('/api/v1/beneficiarios', async (req) =>
      (await d.beneficiarios.listar(sesionDe(req).clienteId)).map(aBeneficiarioDto),
    );

    r.get(
      '/api/v1/beneficiarios/consulta',
      { schema: { querystring: cuerpoBeneficiario.pick({ numero: true }) } },
      async (req) => d.beneficiarios.consultarTitular(req.query.numero, sesionDe(req).clienteId),
    );

    r.post('/api/v1/beneficiarios', { schema: { body: cuerpoBeneficiario } }, async (req, reply) => {
      const b = await d.beneficiarios.agregar(sesionDe(req).clienteId, req.body.numero, req.body.alias);
      return reply.code(201).send(aBeneficiarioDto(b));
    });

    r.delete('/api/v1/beneficiarios/:id', { schema: { params: z.object({ id: z.uuid() }) } }, async (req, reply) => {
      await d.beneficiarios.eliminar(req.params.id, sesionDe(req).clienteId);
      return reply.code(204).send();
    });
  });
}
