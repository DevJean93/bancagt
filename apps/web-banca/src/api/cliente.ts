import type { Problema } from './tipos';

/** Error de la API con el detalle RFC 9457 para mostrarlo al usuario. */
export class ErrorApi extends Error {
  constructor(readonly problema: Problema) {
    super(problema.title);
  }
  get status() {
    return this.problema.status;
  }
  get codigo() {
    return this.problema.codigo;
  }
}

/** Evento global: la sesión expiró o fue cerrada en el servidor. */
export const EVENTO_SESION_EXPIRADA = 'bancagt:sesion-expirada';

interface Opciones {
  metodo?: 'GET' | 'POST' | 'DELETE';
  cuerpo?: unknown;
  encabezados?: Record<string, string>;
  /** No disparar el evento de expiración (p. ej. al validar la sesión inicial). */
  silencioso?: boolean;
}

/**
 * Cliente HTTP único (Facade): la cookie de sesión HttpOnly viaja sola
 * (same-origin), los errores se normalizan y un 401 notifica a la app.
 */
export async function api<T>(ruta: string, op: Opciones = {}): Promise<T> {
  const r = await fetch(ruta, {
    method: op.metodo ?? 'GET',
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...(op.cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...op.encabezados,
    },
    body: op.cuerpo !== undefined ? JSON.stringify(op.cuerpo) : undefined,
  });

  if (r.status === 204) return undefined as T;
  const datos: unknown = await r.json().catch(() => null);

  if (!r.ok) {
    const problema: Problema =
      datos && typeof datos === 'object' && 'title' in datos
        ? (datos as Problema)
        : { type: 'about:blank', title: 'No fue posible completar la operación. Intente de nuevo.', status: r.status };
    if (r.status === 401 && !op.silencioso) window.dispatchEvent(new Event(EVENTO_SESION_EXPIRADA));
    throw new ErrorApi(problema);
  }
  return datos as T;
}

/** Clave de idempotencia por intento de operación (evita cargos duplicados por doble clic o reintento). */
export const nuevaClaveIdempotencia = () => crypto.randomUUID();
