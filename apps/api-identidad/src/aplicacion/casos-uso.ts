import { ErrorBloqueado, ErrorNoAutenticado, type Sesion } from '@bancagt/plataforma';
import { PoliticaBloqueo, type Usuario } from '../dominio/usuario.js';
import type {
  BitacoraAccesos,
  EmisorTokens,
  HasherContrasenas,
  Reloj,
  RepositorioUsuarios,
  TokenEmitido,
} from './puertos.js';

export interface Contexto {
  ip: string;
  userAgent: string;
}

export interface ResultadoSesion extends TokenEmitido {
  perfil: Perfil;
}

export interface Perfil {
  usuario: string;
  nombre: string;
  ultimoAcceso: Date | null;
}

const perfilDe = (u: Usuario, ultimoAccesoPrevio: Date | null): Perfil => ({
  usuario: u.usuario,
  nombre: u.nombreMostrar,
  ultimoAcceso: ultimoAccesoPrevio,
});

/** Mensaje único para usuario inexistente o contraseña incorrecta (anti-enumeración). */
const CREDENCIALES_INVALIDAS = 'Usuario o contraseña incorrectos';

export class IniciarSesion {
  constructor(
    private readonly usuarios: RepositorioUsuarios,
    private readonly bitacora: BitacoraAccesos,
    private readonly hasher: HasherContrasenas,
    private readonly tokens: EmisorTokens,
    private readonly reloj: Reloj,
    private readonly politica = new PoliticaBloqueo(),
  ) {}

  async ejecutar(usuario: string, contrasena: string, ctx: Contexto): Promise<ResultadoSesion> {
    const nombre = usuario.trim().toLowerCase();
    const ahora = this.reloj.ahora();
    const u = await this.usuarios.buscarPorUsuario(nombre);

    if (!u) {
      // Se verifica igual contra un hash ficticio: el tiempo de respuesta no
      // revela si el usuario existe.
      await this.hasher.verificar(this.hasher.hashFicticio(), contrasena);
      await this.bitacora.registrar({ tipo: 'LOGIN_FALLIDO', usuario: nombre, ...ctx });
      throw new ErrorNoAutenticado(CREDENCIALES_INVALIDAS);
    }

    if (this.politica.estaBloqueado(u, ahora)) {
      await this.bitacora.registrar({ tipo: 'LOGIN_FALLIDO', usuario: nombre, usuarioId: u.id, ...ctx });
      throw new ErrorBloqueado('Usuario bloqueado temporalmente por intentos fallidos', {
        bloqueadoHasta: u.bloqueadoHasta?.toISOString(),
      });
    }

    if (!(await this.hasher.verificar(u.hashContrasena, contrasena))) {
      const bloquearHasta = this.politica.bloqueoTrasFallo(u, ahora);
      await this.usuarios.registrarIntentoFallido(u.id, bloquearHasta);
      await this.bitacora.registrar({
        tipo: bloquearHasta ? 'BLOQUEO' : 'LOGIN_FALLIDO',
        usuario: nombre,
        usuarioId: u.id,
        ...ctx,
      });
      if (bloquearHasta) {
        throw new ErrorBloqueado('Usuario bloqueado temporalmente por intentos fallidos', {
          bloqueadoHasta: bloquearHasta.toISOString(),
        });
      }
      throw new ErrorNoAutenticado(CREDENCIALES_INVALIDAS, {
        intentosRestantes: this.politica.maxIntentos - (u.intentosFallidos + 1),
      });
    }

    await this.usuarios.registrarAccesoExitoso(u.id, ahora);
    await this.bitacora.registrar({ tipo: 'LOGIN_OK', usuario: nombre, usuarioId: u.id, ...ctx });
    const token = await this.tokens.emitir({ usuarioId: u.id, clienteId: u.clienteId, nombre: u.nombreMostrar, ultimoAcceso: u.ultimoAcceso });
    return { ...token, perfil: perfilDe(u, u.ultimoAcceso) };
  }
}

/** Emite un token nuevo si la sesión actual sigue vigente y el usuario no está bloqueado. */
export class RenovarSesion {
  constructor(
    private readonly usuarios: RepositorioUsuarios,
    private readonly bitacora: BitacoraAccesos,
    private readonly tokens: EmisorTokens,
    private readonly reloj: Reloj,
    private readonly politica = new PoliticaBloqueo(),
  ) {}

  async ejecutar(sesion: Sesion, ctx: Contexto): Promise<ResultadoSesion> {
    const u = await this.usuarios.buscarPorId(sesion.usuarioId);
    if (!u || this.politica.estaBloqueado(u, this.reloj.ahora())) {
      throw new ErrorNoAutenticado('La sesión ya no es válida');
    }
    await this.bitacora.registrar({ tipo: 'RENOVACION', usuario: u.usuario, usuarioId: u.id, ...ctx });
    const previo = sesion.ultimoAcceso ? new Date(sesion.ultimoAcceso) : null;
    const token = await this.tokens.emitir({ usuarioId: u.id, clienteId: u.clienteId, nombre: u.nombreMostrar, ultimoAcceso: previo });
    return { ...token, perfil: perfilDe(u, previo) };
  }
}

export class CerrarSesion {
  constructor(private readonly bitacora: BitacoraAccesos) {}

  async ejecutar(sesion: Sesion | undefined, ctx: Contexto): Promise<void> {
    if (!sesion) return;
    await this.bitacora.registrar({ tipo: 'CIERRE', usuario: sesion.nombre, usuarioId: sesion.usuarioId, ...ctx });
  }
}
