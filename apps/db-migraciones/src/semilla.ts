// Datos semilla FICTICIOS pero realistas para la demo (ningún dato real).
// Generador determinista: la misma semilla produce siempre los mismos datos.
import type { PrismaClient as ClienteCore } from '@bancagt/db-core';
import type { PrismaClient as ClienteIdentidad } from '@bancagt/db-identidad';
import { hash } from '@node-rs/argon2';

type Moneda = 'GTQ' | 'USD';
type Categoria =
  | 'SALARIO' | 'SERVICIOS' | 'SUPERMERCADO' | 'RESTAURANTE' | 'COMBUSTIBLE' | 'CAJERO' | 'SALUD'
  | 'EDUCACION' | 'ENTRETENIMIENTO' | 'COMPRAS' | 'INTERESES' | 'COMISIONES' | 'TRANSFERENCIA' | 'OTROS';

// PRNG mulberry32 (determinista).
function generador(semilla: number) {
  let a = semilla >>> 0;
  const siguiente = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    numero: siguiente,
    entre: (min: number, max: number) => Math.round((min + siguiente() * (max - min)) * 100) / 100,
    entero: (min: number, max: number) => Math.floor(min + siguiente() * (max - min + 1)),
    de: <T>(lista: readonly T[]): T => lista[Math.floor(siguiente() * lista.length)] as T,
    probabilidad: (p: number) => siguiente() < p,
  };
}

interface PerfilCliente {
  usuario: string;
  nombres: string;
  apellidos: string;
  telefono: string;
  empresa: string;
  salario: [number, number];
  ahorro: boolean;
  dolares: boolean;
  colegio?: string;
}

export const CLIENTES_DEMO: PerfilCliente[] = [
  { usuario: 'mlopez', nombres: 'María Fernanda', apellidos: 'López García', telefono: '5521-4870', empresa: 'Cementos del Valle, S.A.', salario: [6800, 7400], ahorro: true, dolares: true, colegio: 'Colegio Monte María' },
  { usuario: 'jperez', nombres: 'José Antonio', apellidos: 'Pérez Morales', telefono: '4417-2290', empresa: 'Distribuidora La Fragua', salario: [4300, 4900], ahorro: true, dolares: false },
  { usuario: 'agarcia', nombres: 'Ana Lucía', apellidos: 'García Herrera', telefono: '3062-1185', empresa: 'Ministerio de Salud Pública', salario: [5200, 5600], ahorro: true, dolares: true, colegio: 'Liceo Javier' },
  { usuario: 'cramirez', nombres: 'Carlos Eduardo', apellidos: 'Ramírez Castillo', telefono: '5893-6624', empresa: 'Tecnología Maya, S.A.', salario: [11800, 13200], ahorro: true, dolares: true },
  { usuario: 'shernandez', nombres: 'Sofía Alejandra', apellidos: 'Hernández Rivas', telefono: '4258-7731', empresa: 'Universidad Mariano Gálvez', salario: [5900, 6300], ahorro: false, dolares: false },
  { usuario: 'lmendez', nombres: 'Luis Fernando', apellidos: 'Méndez Orellana', telefono: '3374-9012', empresa: 'Agroexportadora Atitlán', salario: [8200, 9100], ahorro: true, dolares: true, colegio: 'Colegio Austriaco' },
  { usuario: 'gcifuentes', nombres: 'Gabriela Isabel', apellidos: 'Cifuentes Ruiz', telefono: '5146-3358', empresa: 'Hotel Camino Real', salario: [4600, 5100], ahorro: true, dolares: false },
  // Usuario técnico del monitoreo sintético (k6). No es un cliente real.
  { usuario: 'sonda', nombres: 'Sonda', apellidos: 'Monitoreo Sintético', telefono: '0000-0000', empresa: 'BancaGT SRE', salario: [9000, 9000], ahorro: true, dolares: false },
];

const SERVICIOS: [string, number, number][] = [
  ['EEGSA · Energía eléctrica', 240, 690],
  ['EMPAGUA · Agua potable', 75, 165],
  ['Claro · Plan pospago', 149, 349],
  ['Tigo Residencial · Internet y cable', 319, 459],
];
const SUPERMERCADOS = ['Supermercado La Torre', 'Walmart Guatemala', 'Paiz Roosevelt', 'PriceSmart Miraflores'];
const RESTAURANTES = ['Pollo Campero', 'Restaurante Los Cebollines', 'Café Barista Oakland', 'Pizza Hut Pradera', 'Saúl Bistro'];
const GASOLINERAS = ['Shell Vista Hermosa', 'Puma Energy Carretera a El Salvador', 'Texaco Las Américas', 'UNO Zona 10'];
const CAJEROS = ['Cajero 5B · Zona 4', 'Cajero Oakland Mall', 'Cajero Plaza Fontabella', 'Cajero Miraflores'];
const SALUD = ['Farmacia Cruz Verde', 'Farmacias Galeno', 'Laboratorio Clínico Herrera Llerandi', 'Hospital Centro Médico'];
const ENTRETENIMIENTO = ['Cinépolis Oakland Mall', 'Netflix', 'Spotify Premium', 'Teatro Nacional'];
const COMPRAS = ['Siman Pradera', 'Pacifiko.com', 'Cemaco Miraflores', 'Max Distelsa', 'Amazon.com'];

interface MovimientoSemilla {
  fecha: Date;
  tipo: 'CREDITO' | 'DEBITO';
  categoria: Categoria;
  descripcion: string;
  monto: number;
}

/** Genera la historia de una cuenta, día por día, sin dejar nunca saldo negativo. */
function historia(
  r: ReturnType<typeof generador>,
  p: PerfilCliente,
  tipo: 'MONETARIA' | 'AHORRO',
  moneda: Moneda,
  dias: number,
  hoy: Date,
): { movimientos: (MovimientoSemilla & { saldoPosterior: number })[]; saldo: number } {
  const propuestos: MovimientoSemilla[] = [];
  const dia = (i: number, hora = r.entero(7, 20)) => {
    const f = new Date(hoy.getTime() - (dias - i) * 86_400_000);
    f.setUTCHours(hora + 6, r.entero(0, 59), r.entero(0, 59), 0);
    return f;
  };
  const debito = (i: number, categoria: Categoria, descripcion: string, monto: number) =>
    propuestos.push({ fecha: dia(i), tipo: 'DEBITO', categoria, descripcion, monto });
  const credito = (i: number, categoria: Categoria, descripcion: string, monto: number, hora?: number) =>
    propuestos.push({ fecha: dia(i, hora), tipo: 'CREDITO', categoria, descripcion, monto });

  const apertura = moneda === 'USD' ? r.entre(300, 1500) : tipo === 'AHORRO' ? r.entre(2000, 15000) : r.entre(1500, 6000);
  credito(0, 'OTROS', 'Depósito de apertura de cuenta', apertura, 9);

  for (let i = 1; i <= dias; i++) {
    const fecha = dia(i, 12);
    const dm = fecha.getUTCDate();
    const finDeMes = new Date(fecha.getTime() + 86_400_000).getUTCDate() === 1;

    if (moneda === 'USD') {
      if (r.probabilidad(0.04)) credito(i, 'OTROS', 'Remesa recibida · Western Union', r.entre(150, 900));
      if (r.probabilidad(0.05)) debito(i, 'COMPRAS', r.de(['Amazon.com', 'Apple.com/bill', 'Booking.com', 'eBay']), r.entre(15, 260));
      if (finDeMes) credito(i, 'INTERESES', 'Intereses del mes', r.entre(0.4, 3.5), 23);
      continue;
    }
    if (tipo === 'AHORRO') {
      if (dm === 16) credito(i, 'TRANSFERENCIA', 'Ahorro programado quincenal', r.entre(400, 1200), 8);
      if (finDeMes) credito(i, 'INTERESES', 'Intereses del mes (3.25 % anual)', r.entre(12, 65), 23);
      if (r.probabilidad(0.015)) debito(i, 'CAJERO', `Retiro · ${r.de(CAJEROS)}`, r.entero(5, 20) * 100);
      continue;
    }
    // Cuenta monetaria en quetzales: la de uso diario.
    if (dm === 15 || finDeMes) credito(i, 'SALARIO', `Planilla · ${p.empresa}`, r.entre(...p.salario) / 2, 6);
    if (dm === 5) for (const [desc, min, max] of SERVICIOS) debito(i, 'SERVICIOS', desc, r.entre(min, max));
    if (dm === 3 && p.colegio) debito(i, 'EDUCACION', `${p.colegio} · Colegiatura`, r.entre(1450, 2600));
    if (dm === 10) debito(i, 'ENTRETENIMIENTO', r.de(['Netflix', 'Spotify Premium']), r.entre(55, 99));
    if (dm === 28) debito(i, 'COMISIONES', 'Comisión por manejo de cuenta', 15);
    if (r.probabilidad(0.3)) debito(i, 'SUPERMERCADO', r.de(SUPERMERCADOS), r.entre(85, 920));
    if (r.probabilidad(0.25)) debito(i, 'RESTAURANTE', r.de(RESTAURANTES), r.entre(45, 380));
    if (r.probabilidad(0.12)) debito(i, 'COMBUSTIBLE', r.de(GASOLINERAS), r.entre(200, 520));
    if (r.probabilidad(0.08)) debito(i, 'CAJERO', `Retiro · ${r.de(CAJEROS)}`, r.entero(2, 10) * 100);
    if (r.probabilidad(0.05)) debito(i, 'SALUD', r.de(SALUD), r.entre(60, 1400));
    if (r.probabilidad(0.06)) debito(i, 'COMPRAS', r.de(COMPRAS), r.entre(120, 2400));
    if (r.probabilidad(0.04)) debito(i, 'ENTRETENIMIENTO', r.de(ENTRETENIMIENTO), r.entre(60, 350));
  }

  propuestos.sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
  let saldo = 0;
  const movimientos: (MovimientoSemilla & { saldoPosterior: number })[] = [];
  for (const m of propuestos) {
    if (m.tipo === 'DEBITO' && m.monto > saldo) continue; // sin fondos: la compra no ocurre
    saldo = Math.round((m.tipo === 'CREDITO' ? saldo + m.monto : saldo - m.monto) * 100) / 100;
    movimientos.push({ ...m, saldoPosterior: saldo });
  }
  return { movimientos, saldo };
}

export interface ResultadoSemilla {
  clientes: number;
  cuentas: number;
  movimientos: number;
  usuarios: number;
}

export async function sembrar(
  core: ClienteCore,
  identidad: ClienteIdentidad,
  contrasenaDemo: string,
  hoy = new Date(),
): Promise<ResultadoSemilla | null> {
  if ((await core.cliente.count()) > 0) return null; // ya sembrado: idempotente

  const r = generador(20261120);
  const hashDemo = await hash(contrasenaDemo, { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const usados = new Set<string>();
  const numeroCuenta = (prefijo: string) => {
    let n: string;
    do n = `${prefijo}${String(r.entero(0, 99_999_999)).padStart(8, '0')}`;
    while (usados.has(n));
    usados.add(n);
    return n;
  };

  let totalCuentas = 0;
  let totalMovimientos = 0;
  const cuentasPorUsuario = new Map<string, string[]>();

  for (const [i, p] of CLIENTES_DEMO.entries()) {
    const cliente = await core.cliente.create({
      data: {
        codigo: `CIF${String(100245 + i * 37).padStart(7, '0')}`,
        nombres: p.nombres,
        apellidos: p.apellidos,
        correo: `${p.usuario}@correo-demo.gt`,
        telefono: p.telefono,
      },
    });

    const planes: { tipo: 'MONETARIA' | 'AHORRO'; moneda: Moneda; alias: string; prefijo: string }[] = [
      { tipo: 'MONETARIA', moneda: 'GTQ', alias: 'Cuenta de nómina', prefijo: '30' },
      ...(p.ahorro ? [{ tipo: 'AHORRO' as const, moneda: 'GTQ' as const, alias: 'Ahorro', prefijo: '40' }] : []),
      ...(p.dolares ? [{ tipo: 'MONETARIA' as const, moneda: 'USD' as const, alias: 'Dólares', prefijo: '50' }] : []),
    ];

    const ids: string[] = [];
    for (const plan of planes) {
      const h = historia(r, p, plan.tipo, plan.moneda, 120, hoy);
      // Algunas cuentas monetarias tienen un cheque depositado en reserva (disponible < contable).
      const reserva = plan.tipo === 'MONETARIA' && plan.moneda === 'GTQ' && r.probabilidad(0.35) ? Math.min(h.saldo, r.entero(5, 25) * 100) : 0;
      const cuenta = await core.cuenta.create({
        data: {
          numero: numeroCuenta(plan.prefijo),
          clienteId: cliente.id,
          tipo: plan.tipo,
          moneda: plan.moneda,
          alias: plan.alias,
          saldoContable: h.saldo.toFixed(2),
          saldoDisponible: (h.saldo - reserva).toFixed(2),
          abiertaEn: h.movimientos[0]?.fecha ?? hoy,
        },
      });
      await core.movimiento.createMany({
        data: h.movimientos.map((m) => ({
          cuentaId: cuenta.id,
          fecha: m.fecha,
          tipo: m.tipo,
          categoria: m.categoria,
          descripcion: m.descripcion,
          monto: m.monto.toFixed(2),
          saldoPosterior: m.saldoPosterior.toFixed(2),
          referencia: `MOV-${String(r.entero(1, 99_999_999)).padStart(8, '0')}`,
        })),
      });
      ids.push(cuenta.id);
      totalCuentas += 1;
      totalMovimientos += h.movimientos.length;
    }
    cuentasPorUsuario.set(p.usuario, ids);

    await identidad.usuario.create({
      data: {
        usuario: p.usuario,
        clienteId: cliente.id,
        nombreMostrar: `${p.nombres.split(' ')[0]} ${p.apellidos.split(' ')[0]}`,
        hashContrasena: hashDemo,
      },
    });
  }

  // Beneficiarios frecuentes (cuentas de otros clientes en quetzales).
  const relaciones: [string, string, string][] = [
    ['mlopez', 'jperez', 'José · alquiler'],
    ['mlopez', 'agarcia', 'Ana Lucía'],
    ['jperez', 'mlopez', 'María López'],
    ['agarcia', 'cramirez', 'Carlos · cooperacha'],
    ['cramirez', 'lmendez', 'Luis Méndez'],
    ['lmendez', 'gcifuentes', 'Gaby Cifuentes'],
  ];
  const clientes = await core.cuenta.findMany({ select: { id: true, clienteId: true } });
  const clienteDeCuenta = new Map(clientes.map((c) => [c.id, c.clienteId]));
  for (const [de, a, alias] of relaciones) {
    const cuentaDe = cuentasPorUsuario.get(de)?.[0];
    const cuentaA = cuentasPorUsuario.get(a)?.[0];
    const clienteId = cuentaDe ? clienteDeCuenta.get(cuentaDe) : undefined;
    if (clienteId && cuentaA) await core.beneficiario.create({ data: { clienteId, cuentaId: cuentaA, alias } });
  }

  return { clientes: CLIENTES_DEMO.length, cuentas: totalCuentas, movimientos: totalMovimientos, usuarios: CLIENTES_DEMO.length };
}
