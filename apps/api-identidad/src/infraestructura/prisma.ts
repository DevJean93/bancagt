// Adaptadores Prisma de los puertos de persistencia (patrón Repository).
import type { PrismaClient } from '@bancagt/db-identidad';
import type { Usuario } from '../dominio/usuario.js';
import type { BitacoraAccesos, EventoAcceso, RepositorioUsuarios } from '../aplicacion/puertos.js';

export class RepositorioUsuariosPrisma implements RepositorioUsuarios {
  constructor(private readonly db: PrismaClient) {}

  buscarPorUsuario(usuario: string): Promise<Usuario | null> {
    return this.db.usuario.findUnique({ where: { usuario } });
  }

  buscarPorId(id: string): Promise<Usuario | null> {
    return this.db.usuario.findUnique({ where: { id } });
  }

  async registrarIntentoFallido(id: string, bloquearHasta: Date | null): Promise<void> {
    await this.db.usuario.update({
      where: { id },
      data: bloquearHasta
        ? { intentosFallidos: 0, bloqueadoHasta: bloquearHasta }
        : { intentosFallidos: { increment: 1 } },
    });
  }

  async registrarAccesoExitoso(id: string, fecha: Date): Promise<void> {
    await this.db.usuario.update({
      where: { id },
      data: { intentosFallidos: 0, bloqueadoHasta: null, ultimoAcceso: fecha },
    });
  }
}

export class BitacoraAccesosPrisma implements BitacoraAccesos {
  constructor(private readonly db: PrismaClient) {}

  async registrar(e: EventoAcceso): Promise<void> {
    await this.db.eventoAcceso.create({
      data: {
        tipo: e.tipo,
        usuario: e.usuario.slice(0, 40),
        usuarioId: e.usuarioId ?? null,
        ip: e.ip.slice(0, 45),
        userAgent: e.userAgent.slice(0, 200),
      },
    });
  }
}
