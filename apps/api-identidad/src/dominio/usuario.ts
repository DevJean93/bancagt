// Entidad Usuario y política de bloqueo (reglas puras, sin dependencias).

export interface Usuario {
  id: string;
  usuario: string;
  clienteId: string;
  nombreMostrar: string;
  hashContrasena: string;
  intentosFallidos: number;
  bloqueadoHasta: Date | null;
  ultimoAcceso: Date | null;
}

/**
 * PCI-DSS 8.3.4: bloquear la cuenta tras no más de 10 intentos inválidos
 * durante al menos 30 minutos. Se usa una política más estricta.
 */
export class PoliticaBloqueo {
  constructor(
    readonly maxIntentos = 5,
    readonly minutosBloqueo = 30,
  ) {}

  estaBloqueado(u: Usuario, ahora: Date): boolean {
    return u.bloqueadoHasta !== null && u.bloqueadoHasta > ahora;
  }

  /** Devuelve hasta cuándo bloquear si este intento fallido alcanza el máximo. */
  bloqueoTrasFallo(u: Usuario, ahora: Date): Date | null {
    const intentos = u.intentosFallidos + 1;
    return intentos >= this.maxIntentos ? new Date(ahora.getTime() + this.minutosBloqueo * 60_000) : null;
  }
}
