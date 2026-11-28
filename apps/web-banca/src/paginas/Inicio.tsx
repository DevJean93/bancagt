import { useState } from 'react';
import { Link } from 'react-router';
import { ArrowLeftRight, ArrowRight, ChevronRight, FileText, PiggyBank, Users, Wallet } from 'lucide-react';
import { useFlujo, useMovimientos, usePosicion } from '../api/servicios';
import type { Cuenta } from '../api/tipos';
import { useSesion } from '../sesion/ContextoSesion';
import { Alerta, Encabezado, Esqueleto, Insignia, Tarjeta, cx } from '../componentes/ui';
import { GraficaFlujo, GraficaSaldo } from '../componentes/Graficas';
import { ListaMovimientos } from '../componentes/Movimientos';
import { formatoMoneda, NOMBRE_TIPO_CUENTA } from '../utilidades/formato';

function saludo() {
  const h = Number(new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/Guatemala' }));
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
}

function TarjetaCuenta({ c, activa, alElegir }: { c: Cuenta; activa: boolean; alElegir: () => void }) {
  const Icono = c.tipo === 'AHORRO' ? PiggyBank : Wallet;
  return (
    <button
      onClick={alElegir}
      aria-pressed={activa}
      className={cx(
        'group flex flex-col rounded-tarjeta border bg-tarjeta p-5 text-left shadow-tarjeta transition-all duration-200',
        activa ? 'border-secundario ring-2 ring-secundario/15' : 'border-borde hover:border-secundario/40',
      )}
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-medium text-texto-apagado">
          <Icono className="size-4" aria-hidden />
          {c.alias ?? NOMBRE_TIPO_CUENTA[c.tipo]}
        </span>
        <Insignia tono={c.moneda === 'USD' ? 'acento' : 'neutro'}>{c.moneda}</Insignia>
      </div>
      <p className="mt-4 text-xs text-texto-apagado">Saldo disponible</p>
      <p className="cifras text-2xl font-semibold tracking-tight">{formatoMoneda(c.saldoDisponible, c.moneda)}</p>
      <div className="mt-3 flex items-center justify-between text-xs text-texto-apagado">
        <span className="cifras">
          {NOMBRE_TIPO_CUENTA[c.tipo]} {c.numeroEnmascarado}
        </span>
        {Number(c.enReserva) > 0 && <span className="cifras text-aviso">En reserva {formatoMoneda(c.enReserva, c.moneda)}</span>}
      </div>
    </button>
  );
}

function Resumen({ cuenta }: { cuenta: Cuenta }) {
  const flujo = useFlujo(cuenta.id, 28);
  const movs = useMovimientos(cuenta.id, { pagina: 1, tamano: 6 });
  const ingresos = flujo.data?.reduce((s, p) => s + Number(p.ingresos), 0) ?? 0;
  const egresos = flujo.data?.reduce((s, p) => s + Number(p.egresos), 0) ?? 0;

  return (
    <div className="mt-6 grid gap-6 xl:grid-cols-5">
      <Tarjeta className="min-w-0 p-5 xl:col-span-3">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold">Evolución del saldo</h2>
            <p className="text-sm text-texto-apagado">Últimas 4 semanas · {cuenta.alias ?? NOMBRE_TIPO_CUENTA[cuenta.tipo]}</p>
          </div>
          <dl className="flex gap-6 text-sm">
            <div>
              <dt className="text-texto-apagado">Ingresos</dt>
              <dd className="cifras font-semibold text-exito">+{formatoMoneda(ingresos, cuenta.moneda)}</dd>
            </div>
            <div>
              <dt className="text-texto-apagado">Egresos</dt>
              <dd className="cifras font-semibold">−{formatoMoneda(egresos, cuenta.moneda)}</dd>
            </div>
          </dl>
        </div>
        <div className="mt-4">{flujo.data ? <GraficaSaldo datos={flujo.data} moneda={cuenta.moneda} /> : <Esqueleto className="h-56" />}</div>
        <div className="mt-6 border-t border-borde pt-4">
          {flujo.data ? <GraficaFlujo datos={flujo.data} moneda={cuenta.moneda} /> : <Esqueleto className="h-56" />}
        </div>
      </Tarjeta>

      <Tarjeta className="flex min-w-0 flex-col xl:col-span-2">
        <div className="flex items-center justify-between border-b border-borde px-5 py-4">
          <h2 className="font-semibold">Últimos movimientos</h2>
          <Link to={`/cuentas/${cuenta.id}`} className="flex min-h-11 items-center gap-1 text-sm font-medium text-secundario hover:underline">
            Ver todos <ChevronRight className="size-4" aria-hidden />
          </Link>
        </div>
        {movs.data ? (
          <ListaMovimientos movimientos={movs.data.elementos} moneda={cuenta.moneda} compacta />
        ) : (
          <div className="space-y-3 p-5">{Array.from({ length: 6 }, (_, i) => <Esqueleto key={i} className="h-12" />)}</div>
        )}
      </Tarjeta>
    </div>
  );
}

export function Inicio() {
  const { sesion } = useSesion();
  const posicion = usePosicion();
  const [elegida, setElegida] = useState<string>();
  const cuentas = posicion.data?.cuentas ?? [];
  const activa = cuentas.find((c) => c.id === elegida) ?? cuentas[0];

  return (
    <div className="aparecer">
      <Encabezado
        titulo={`${saludo()}, ${sesion?.nombre.split(' ')[0] ?? ''}`}
        descripcion="Este es el resumen de sus productos."
        acciones={
          <>
            <Link to="/transferir" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primario px-4 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-secundario">
              <ArrowLeftRight className="size-4" aria-hidden /> Transferir
            </Link>
            {activa && (
              <Link to={`/cuentas/${activa.id}/estado`} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-borde bg-tarjeta px-4 text-sm font-semibold transition-colors hover:bg-apagado">
                <FileText className="size-4" aria-hidden /> Estado de cuenta
              </Link>
            )}
          </>
        }
      />

      {posicion.isError && <Alerta tipo="error" titulo="No pudimos cargar sus cuentas">Intente de nuevo en unos segundos.</Alerta>}

      {posicion.data && posicion.data.totales.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-x-10 gap-y-2 rounded-tarjeta bg-primario px-6 py-5 text-white">
          {posicion.data.totales.map((t) => (
            <div key={t.moneda}>
              <p className="text-sm text-white/70">Disponible total en {t.moneda === 'GTQ' ? 'quetzales' : 'dólares'}</p>
              <p className="cifras text-3xl font-semibold tracking-tight">{formatoMoneda(t.disponible, t.moneda)}</p>
            </div>
          ))}
          <Link to="/beneficiarios" className="ml-auto flex min-h-11 items-center gap-2 self-end text-sm text-white/80 hover:text-white">
            <Users className="size-4" aria-hidden /> Beneficiarios <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {posicion.isPending
          ? Array.from({ length: 3 }, (_, i) => <Esqueleto key={i} className="h-40 rounded-tarjeta" />)
          : cuentas.map((c) => <TarjetaCuenta key={c.id} c={c} activa={c.id === activa?.id} alElegir={() => setElegida(c.id)} />)}
      </div>

      {activa && <Resumen key={activa.id} cuenta={activa} />}
    </div>
  );
}
