import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Moneda, PuntoFlujo } from '../api/tipos';
import { formatoMoneda } from '../utilidades/formato';

// Colores de la paleta (las gráficas SVG necesitan valores, se toman de los tokens).
const PRINCIPAL = '#0F766E';
const VERDE = '#15803D'; // ingresos: mismo verde que los montos +Q del portal
const GRIS = '#A8B5B2';

const animar = typeof window !== 'undefined' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const diaCorto = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-GT', { day: '2-digit', month: 'short' });
const compacto = (n: number) => (Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : n.toFixed(0));

/** Evolución del saldo (área) — con tabla alternativa para lectores de pantalla. */
export function GraficaSaldo({ datos, moneda }: { datos: PuntoFlujo[]; moneda: Moneda }) {
  const serie = datos.map((p) => ({ fecha: p.fecha, saldo: Number(p.saldo) }));
  return (
    <figure>
      <div className="h-56 w-full" aria-hidden>
        <ResponsiveContainer>
          <AreaChart data={serie} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="relleno-saldo" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={PRINCIPAL} stopOpacity={0.18} />
                <stop offset="100%" stopColor={PRINCIPAL} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="#E2E8F0" />
            <XAxis dataKey="fecha" tickFormatter={diaCorto} tick={{ fontSize: 12, fill: '#475569' }} tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis tickFormatter={compacto} tick={{ fontSize: 12, fill: '#475569' }} tickLine={false} axisLine={false} width={44} />
            <Tooltip
              formatter={(v) => [formatoMoneda(Number(v), moneda), 'Saldo']}
              labelFormatter={(l) => diaCorto(String(l))}
              contentStyle={{ borderRadius: 8, borderColor: '#E2E8F0', fontSize: 13 }}
            />
            <Area type="monotone" dataKey="saldo" stroke={PRINCIPAL} strokeWidth={2} fill="url(#relleno-saldo)" isAnimationActive={animar} animationDuration={500} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">
        Saldo al {diaCorto(datos.at(-1)?.fecha ?? '')}: {formatoMoneda(datos.at(-1)?.saldo ?? 0, moneda)}
      </figcaption>
    </figure>
  );
}

/** Ingresos vs egresos por semana. */
export function GraficaFlujo({ datos, moneda }: { datos: PuntoFlujo[]; moneda: Moneda }) {
  const semanas: { semana: string; ingresos: number; egresos: number }[] = [];
  datos.forEach((p, i) => {
    const s = Math.floor(i / 7);
    semanas[s] ??= { semana: `Sem. ${diaCorto(p.fecha)}`, ingresos: 0, egresos: 0 };
    semanas[s].ingresos += Number(p.ingresos);
    semanas[s].egresos += Number(p.egresos);
  });
  return (
    <div className="h-56 w-full" role="img" aria-label="Ingresos y egresos por semana">
      <ResponsiveContainer>
        <BarChart data={semanas} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barGap={4}>
          <CartesianGrid vertical={false} stroke="#E2E8F0" />
          <XAxis dataKey="semana" tick={{ fontSize: 12, fill: '#475569' }} tickLine={false} axisLine={false} />
          <YAxis tickFormatter={compacto} tick={{ fontSize: 12, fill: '#475569' }} tickLine={false} axisLine={false} width={44} />
          <Tooltip formatter={(v, n) => [formatoMoneda(Number(v), moneda), n === 'ingresos' ? 'Ingresos' : 'Egresos']} contentStyle={{ borderRadius: 8, fontSize: 13 }} />
          <Legend formatter={(v) => (v === 'ingresos' ? 'Ingresos' : 'Egresos')} iconType="circle" wrapperStyle={{ fontSize: 13 }} />
          <Bar dataKey="ingresos" fill={VERDE} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={animar} animationDuration={500} />
          <Bar dataKey="egresos" fill={GRIS} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={animar} animationDuration={500} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
