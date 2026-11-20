// Puertos (interfaces) que necesitan los casos de uso. La infraestructura
// los implementa; los casos de uso nunca dependen de Prisma, jose ni argon2
// directamente (Principio de Inversión de Dependencias).
import type { Usuario } from '../dominio/usuario.js';

export interface RepositorioUsuarios {
  buscarPorUsuario(usuario: string): Promise<Usuario | null>;
  buscarPorId(id: string): Promise<Usuario | null>;
  registrarIntentoFallido(id: string, bloquearHasta: Date | null): Promise<void>;
  registrarAccesoExitoso(id: string, fecha: Date): Promise<void>;
}

export type TipoEvento = 'LOGIN_OK' | 'LOGIN_FALLIDO' | 'BLOQUEO' | 'RENOVACION' | 'CIERRE';

export interface EventoAcceso {
  tipo: TipoEvento;
  usuario: string;
  usuarioId?: string;
  ip: string;
  userAgent: string;
}

export interface BitacoraAccesos {
  registrar(evento: EventoAcceso): Promise<void>;
}

export interface HasherContrasenas {
  verificar(hash: string, contrasena: string): Promise<boolean>;
  /** Hash de referencia para igualar tiempos cuando el usuario no existe. */
  hashFicticio(): string;
}

export interface DatosToken {
  usuarioId: string;
  clienteId: string;
  nombre: string;
  ultimoAcceso: Date | null;
}

export interface TokenEmitido {
  token: string;
  expiraEn: Date;
}

export interface EmisorTokens {
  emitir(datos: DatosToken): Promise<TokenEmitido>;
}

export interface Reloj {
  ahora(): Date;
}

export const relojSistema: Reloj = { ahora: () => new Date() };
