import { z } from 'zod';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type {} from '@fastify/cookie'; // tipos de req.cookies / reply.setCookie
import {
  NOMBRE_COOKIE_SESION,
  requerirSesion,
  sesionDe,
  type Servidor,
  type VerificadorSesion,
} from '@bancagt/plataforma';
import type { CerrarSesion, IniciarSesion, RenovarSesion, ResultadoSesion } from '../aplicacion/casos-uso.js';

export interface Dependencias {
  iniciarSesion: IniciarSesion;
  renovarSesion: RenovarSesion;
  cerrarSesion: CerrarSesion;
  verificador: VerificadorSesion;
}

const cuerpoLogin = z.object({
  usuario: z.string().trim().min(3).max(40).regex(/^[a-zA-Z0-9._-]+$/),
  contrasena: z.string().min(8).max(128),
});

const respuestaSesion = z.object({
  usuario: z.string(),
  nombre: z.string(),
  ultimoAcceso: z.string().nullable(),
  expiraEn: z.string(),
});

const contexto = (req: FastifyRequest) => ({
  ip: req.ip,
  userAgent: String(req.headers['user-agent'] ?? 'desconocido'),
});

function responderSesion(reply: FastifyReply, r: ResultadoSesion) {
  reply.setCookie(NOMBRE_COOKIE_SESION, r.token, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    path: '/',
    expires: r.expiraEn,
  });
  return {
    usuario: r.perfil.usuario,
    nombre: r.perfil.nombre,
    ultimoAcceso: r.perfil.ultimoAcceso?.toISOString() ?? null,
    expiraEn: r.expiraEn.toISOString(),
  };
}

export function registrarRutas(app: Servidor, d: Dependencias): void {
  const conSesion = requerirSesion(d.verificador);

  app.post(
    '/api/v1/auth/sesion',
    {
      schema: { body: cuerpoLogin, response: { 200: respuestaSesion } },
      // Límite estricto por IP contra fuerza bruta (además del bloqueo por usuario).
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const r = await d.iniciarSesion.ejecutar(req.body.usuario, req.body.contrasena, contexto(req));
      return responderSesion(reply, r);
    },
  );

  app.post(
    '/api/v1/auth/sesion/renovar',
    { preHandler: conSesion, schema: { response: { 200: respuestaSesion } } },
    async (req, reply) => responderSesion(reply, await d.renovarSesion.ejecutar(sesionDe(req), contexto(req))),
  );

  app.get(
    '/api/v1/auth/sesion',
    { preHandler: conSesion },
    async (req) => {
      const s = sesionDe(req);
      return { nombre: s.nombre, ultimoAcceso: s.ultimoAcceso, expiraEn: new Date(s.expiraEn * 1000).toISOString() };
    },
  );

  app.delete('/api/v1/auth/sesion', async (req, reply) => {
    const token = req.cookies[NOMBRE_COOKIE_SESION];
    const sesion = token ? await d.verificador.verificar(token).catch(() => undefined) : undefined;
    await d.cerrarSesion.ejecutar(sesion, contexto(req));
    reply.clearCookie(NOMBRE_COOKIE_SESION, { path: '/', secure: true, httpOnly: true, sameSite: 'strict' });
    return reply.code(204).send();
  });
}
