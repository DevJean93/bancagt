// Jerarquía de errores de aplicación. Cada tipo sabe su código HTTP, así el
// manejador de errores no necesita conocer los casos de uso (Open/Closed).

export abstract class ErrorAplicacion extends Error {
  abstract readonly status: number;
  abstract readonly tipo: string;

  constructor(
    mensaje: string,
    readonly detalle?: Record<string, unknown>,
  ) {
    super(mensaje);
    this.name = new.target.name;
  }
}

/** 400: la petición no cumple el contrato (formato, campos). */
export class ErrorValidacion extends ErrorAplicacion {
  readonly status = 400;
  readonly tipo = 'validacion';
}

/** 401: no hay sesión válida. */
export class ErrorNoAutenticado extends ErrorAplicacion {
  readonly status = 401;
  readonly tipo = 'no-autenticado';
}

/** 403: hay sesión, pero la operación no está permitida. */
export class ErrorProhibido extends ErrorAplicacion {
  readonly status = 403;
  readonly tipo = 'prohibido';
}

/**
 * 404: el recurso no existe O no pertenece al cliente. Se usa el mismo código
 * en ambos casos para no revelar qué cuentas existen (anti-enumeración).
 */
export class ErrorNoEncontrado extends ErrorAplicacion {
  readonly status = 404;
  readonly tipo = 'no-encontrado';
}

/** 409: conflicto de estado (p. ej. Idempotency-Key reutilizada con otros datos). */
export class ErrorConflicto extends ErrorAplicacion {
  readonly status = 409;
  readonly tipo = 'conflicto';
}

/** 422: la operación es válida en forma pero viola una regla de negocio. */
export class ErrorReglaNegocio extends ErrorAplicacion {
  readonly status = 422;
  readonly tipo = 'regla-negocio';

  constructor(
    readonly codigo: string,
    mensaje: string,
    detalle?: Record<string, unknown>,
  ) {
    super(mensaje, detalle);
  }
}

/** 423: recurso bloqueado temporalmente (usuario tras intentos fallidos). */
export class ErrorBloqueado extends ErrorAplicacion {
  readonly status = 423;
  readonly tipo = 'bloqueado';
}

/** 429: demasiadas peticiones. */
export class ErrorDemasiadasPeticiones extends ErrorAplicacion {
  readonly status = 429;
  readonly tipo = 'demasiadas-peticiones';
}
