import { importSPKI, jwtVerify, type JWTPayload, type CryptoKey } from 'jose';
import type { FastifyReply, FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';
import { leerSecreto } from './config.js';
import { ErrorNoAutenticado } from './errores.js';

// La sesión viaja en una cookie HttpOnly + Secure + SameSite=Strict, nunca en
// localStorage (un XSS no puede robarla). El prefijo __Host- obliga a que la
// cookie sea Secure, sin Domain y con Path=/.
export const NOMBRE_COOKIE_SESION = '__Host-bancagt_sesion';
export const EMISOR_JWT = 'bancagt-identidad';
export const AUDIENCIA_JWT = 'bancagt-apis';
export const ALGORITMO_JWT = 'ES256';

export interface Sesion {
  usuarioId: string;
  clienteId: string;
  nombre: string;
  /** Acceso anterior (para mostrarlo al cliente: detección de accesos no reconocidos). */
  ultimoAcceso: string | null;
  expiraEn: number; // epoch en segundos
}

declare module 'fastify' {
  interface FastifyRequest {
    sesion?: Sesion;
  }
}

/** Puerto: cualquier mecanismo capaz de validar un token y devolver la sesión. */
export interface VerificadorSesion {
  verificar(token: string): Promise<Sesion>;
}

/**
 * Verifica JWT firmados con ES256 por api-identidad. La llave pública se lee
 * del archivo montado; si cambia (rotación), se vuelve a importar.
 */
export class VerificadorJwt implements VerificadorSesion {
  private pemActual = '';
  private llave?: CryptoKey;

  constructor(private readonly rutaLlavePublica: string) {}

  async verificar(token: string): Promise<Sesion> {
    try {
      const { payload } = await jwtVerify(token, await this.llavePublica(), {
        issuer: EMISOR_JWT,
        audience: AUDIENCIA_JWT,
        algorithms: [ALGORITMO_JWT],
      });
      return aSesion(payload);
    } catch {
      throw new ErrorNoAutenticado('La sesión no es válida o expiró');
    }
  }

  private async llavePublica(): Promise<CryptoKey> {
    const pem = leerSecreto(this.rutaLlavePublica);
    if (!this.llave || pem !== this.pemActual) {
      this.llave = await importSPKI(pem, ALGORITMO_JWT);
      this.pemActual = pem;
    }
    return this.llave;
  }
}

function aSesion(p: JWTPayload): Sesion {
  if (typeof p.sub !== 'string' || typeof p.cli !== 'string' || typeof p.exp !== 'number') {
    throw new ErrorNoAutenticado('Token sin los datos requeridos');
  }
  return {
    usuarioId: p.sub,
    clienteId: p.cli,
    nombre: String(p.nom ?? ''),
    ultimoAcceso: typeof p.uac === 'string' ? p.uac : null,
    expiraEn: p.exp,
  };
}

/** preHandler que exige sesión válida y la deja en request.sesion. */
export function requerirSesion(verificador: VerificadorSesion): preHandlerAsyncHookHandler {
  return async function (req: FastifyRequest, _reply: FastifyReply) {
    const token = req.cookies?.[NOMBRE_COOKIE_SESION];
    if (!token) throw new ErrorNoAutenticado('Debe iniciar sesión');
    req.sesion = await verificador.verificar(token);
  };
}

/** Devuelve la sesión o lanza 401 (para usar dentro de los controladores). */
export function sesionDe(req: FastifyRequest): Sesion {
  if (!req.sesion) throw new ErrorNoAutenticado('Debe iniciar sesión');
  return req.sesion;
}
