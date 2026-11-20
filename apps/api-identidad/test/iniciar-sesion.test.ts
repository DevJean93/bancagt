import { beforeEach, describe, expect, it } from 'vitest';
import { ErrorBloqueado, ErrorNoAutenticado } from '@bancagt/plataforma';
import { IniciarSesion } from '../src/aplicacion/casos-uso.js';
import type { BitacoraAccesos, EmisorTokens, EventoAcceso, HasherContrasenas, RepositorioUsuarios } from '../src/aplicacion/puertos.js';
import type { Usuario } from '../src/dominio/usuario.js';

// Dobles de prueba en memoria: los casos de uso dependen de interfaces (DIP).
class UsuariosEnMemoria implements RepositorioUsuarios {
  constructor(readonly datos = new Map<string, Usuario>()) {}
  async buscarPorUsuario(u: string) { return [...this.datos.values()].find((x) => x.usuario === u) ?? null; }
  async buscarPorId(id: string) { return this.datos.get(id) ?? null; }
  async registrarIntentoFallido(id: string, hasta: Date | null) {
    const u = this.datos.get(id)!;
    this.datos.set(id, hasta ? { ...u, intentosFallidos: 0, bloqueadoHasta: hasta } : { ...u, intentosFallidos: u.intentosFallidos + 1 });
  }
  async registrarAccesoExitoso(id: string, f: Date) {
    const u = this.datos.get(id)!;
    this.datos.set(id, { ...u, intentosFallidos: 0, bloqueadoHasta: null, ultimoAcceso: f });
  }
}
class BitacoraEnMemoria implements BitacoraAccesos {
  eventos: EventoAcceso[] = [];
  async registrar(e: EventoAcceso) { this.eventos.push(e); }
}
const hasher: HasherContrasenas = { verificar: async (h, c) => h === `hash:${c}`, hashFicticio: () => 'hash:x' };
const emisor: EmisorTokens = { emitir: async () => ({ token: 'jwt', expiraEn: new Date('2026-11-20T00:15:00Z') }) };
const ahora = new Date('2026-11-20T00:00:00Z');
const ctx = { ip: '10.0.0.1', userAgent: 'vitest' };

describe('IniciarSesion', () => {
  let usuarios: UsuariosEnMemoria;
  let bitacora: BitacoraEnMemoria;
  let caso: IniciarSesion;

  beforeEach(() => {
    usuarios = new UsuariosEnMemoria(new Map([['u1', {
      id: 'u1', usuario: 'mlopez', clienteId: 'c1', nombreMostrar: 'María López', hashContrasena: 'hash:Correcta#1',
      intentosFallidos: 0, bloqueadoHasta: null, ultimoAcceso: null,
    }]]));
    bitacora = new BitacoraEnMemoria();
    caso = new IniciarSesion(usuarios, bitacora, hasher, emisor, { ahora: () => ahora });
  });

  it('emite token con credenciales correctas y registra el acceso', async () => {
    const r = await caso.ejecutar('MLopez ', 'Correcta#1', ctx);
    expect(r.token).toBe('jwt');
    expect(bitacora.eventos.at(-1)?.tipo).toBe('LOGIN_OK');
  });

  it('usa el mismo mensaje para usuario inexistente (anti-enumeración)', async () => {
    const a = await caso.ejecutar('nadie', 'x'.repeat(8), ctx).catch((e: Error) => e);
    const b = await caso.ejecutar('mlopez', 'incorrecta', ctx).catch((e: Error) => e);
    expect(a).toBeInstanceOf(ErrorNoAutenticado);
    expect(b).toBeInstanceOf(ErrorNoAutenticado);
    expect(a.message).toBe(b.message);
  });

  it('bloquea al usuario al 5.º intento fallido (PCI-DSS 8.3.4)', async () => {
    for (let i = 0; i < 4; i++) await expect(caso.ejecutar('mlopez', 'mala', ctx)).rejects.toBeInstanceOf(ErrorNoAutenticado);
    await expect(caso.ejecutar('mlopez', 'mala', ctx)).rejects.toBeInstanceOf(ErrorBloqueado);
    // Aun con la contraseña correcta, sigue bloqueado.
    await expect(caso.ejecutar('mlopez', 'Correcta#1', ctx)).rejects.toBeInstanceOf(ErrorBloqueado);
    expect(bitacora.eventos.some((e) => e.tipo === 'BLOQUEO')).toBe(true);
  });
});
