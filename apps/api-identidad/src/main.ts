// Raíz de composición: el ÚNICO lugar donde se eligen las implementaciones
// concretas y se conectan con los casos de uso (inyección de dependencias).
import { z } from 'zod';
import rateLimit from '@fastify/rate-limit';
import { crearClienteIdentidad } from '@bancagt/db-identidad';
import {
  VerificadorJwt,
  camposConfigBD,
  cargarConfig,
  crearServidor,
  iniciar,
  opcionesConexion,
} from '@bancagt/plataforma';
import { CerrarSesion, IniciarSesion, RenovarSesion } from './aplicacion/casos-uso.js';
import { relojSistema } from './aplicacion/puertos.js';
import { BitacoraAccesosPrisma, RepositorioUsuariosPrisma } from './infraestructura/prisma.js';
import { EmisorJwt, HasherArgon2 } from './infraestructura/seguridad.js';
import { registrarRutas } from './http/rutas.js';

const config = cargarConfig({
  ...camposConfigBD,
  JWT_LLAVE_PRIVADA_ARCHIVO: z.string(),
  JWT_LLAVE_PUBLICA_ARCHIVO: z.string(),
  JWT_KID: z.string().default('bancagt-1'),
  SESION_MINUTOS: z.coerce.number().int().min(1).max(60).default(15),
});

const db = crearClienteIdentidad(opcionesConexion(config));

const { app } = await crearServidor({
  nombre: 'api-identidad',
  config,
  verificarListo: async () => {
    await db.usuario.count({ take: 1 });
  },
});
await app.register(rateLimit, { global: false });

const usuarios = new RepositorioUsuariosPrisma(db);
const bitacora = new BitacoraAccesosPrisma(db);
const emisor = new EmisorJwt(config.JWT_LLAVE_PRIVADA_ARCHIVO, config.JWT_KID, config.SESION_MINUTOS, relojSistema);

registrarRutas(app, {
  iniciarSesion: new IniciarSesion(usuarios, bitacora, new HasherArgon2(), emisor, relojSistema),
  renovarSesion: new RenovarSesion(usuarios, bitacora, emisor, relojSistema),
  cerrarSesion: new CerrarSesion(bitacora),
  verificador: new VerificadorJwt(config.JWT_LLAVE_PUBLICA_ARCHIVO),
});

await iniciar(app, config.PORT, () => db.$disconnect());
