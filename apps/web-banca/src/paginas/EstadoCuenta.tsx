import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, Printer } from 'lucide-react';
import { useEstadoCuenta } from '../api/servicios';
import { useSesion } from '../sesion/ContextoSesion';
import { Alerta, Boton, Esqueleto, Selector, Tarjeta } from '../componentes/ui';
import { ListaMovimientos } from '../componentes/Movimientos';
import { Logo } from '../componentes/Marco';
import { formatoFecha, formatoFechaHora, formatoMoneda, formatoPeriodo, NOMBRE_CATEGORIA, NOMBRE_TIPO_CUENTA, periodosRecientes } from '../utilidades/formato';

export function EstadoCuenta() {
  const { id = '' } = useParams();
  const { sesion } = useSesion();
  const periodos = periodosRecientes(4);
  const [periodo, setPeriodo] = useState(periodos[0] ?? '');
  const estado = useEstadoCuenta(id, periodo);
  const e = estado.data;
  const maxCategoria = Math.max(1, ...(e?.porCategoria.map((p) => Number(p.total)) ?? [1]));

  return (
    <div className="aparecer">
      <div className="no-imprimir mb-6 flex flex-wrap items-end justify-between gap-4">
        <Link to={`/cuentas/${id}`} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-secundario hover:underline">
          <ArrowLeft className="size-4" aria-hidden /> Volver a la cuenta
        </Link>
        <div className="flex items-end gap-3">
          <div className="w-52">
            <Selector etiqueta="Periodo" value={periodo} onChange={(ev) => setPeriodo(ev.target.value)}>
              {periodos.map((p) => {
                const [a, m] = p.split('-').map(Number) as [number, number];
                return <option key={p} value={p}>{formatoPeriodo(a, m)}</option>;
              })}
            </Selector>
          </div>
          <Boton variante="secundario" icono={Printer} onClick={() => window.print()} disabled={!e}>
            Imprimir / PDF
          </Boton>
        </div>
      </div>

      {estado.isError && <Alerta tipo="error">No se pudo generar el estado de cuenta.</Alerta>}
      {!e && !estado.isError && <Esqueleto className="h-[600px] rounded-tarjeta" />}

      {e && (
        <Tarjeta className="imprimible overflow-hidden">
          <header className="flex flex-wrap items-start justify-between gap-4 border-b-4 border-primario p-6">
            <div>
              <Logo />
              <p className="mt-2 text-xs text-texto-apagado">BancaGT, S.A. · Laboratorio académico · Datos ficticios</p>
            </div>
            <div className="text-right">
              <h1 className="text-xl font-semibold">Estado de cuenta</h1>
              <p className="text-texto-apagado">{formatoPeriodo(e.periodo.anio, e.periodo.mes)}</p>
              <p className="text-xs text-texto-apagado">
                Del {formatoFecha(e.periodo.desde)} al {formatoFecha(e.periodo.hasta)}
              </p>
            </div>
          </header>

          <section className="grid gap-4 border-b border-borde p-6 sm:grid-cols-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-texto-apagado">Titular</p>
              <p className="font-medium">{sesion?.nombre}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-texto-apagado">Cuenta</p>
              <p className="cifras font-medium">
                {NOMBRE_TIPO_CUENTA[e.cuenta.tipo]} {e.cuenta.moneda} {e.cuenta.numeroEnmascarado}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-texto-apagado">Generado</p>
              <p className="font-medium">{formatoFechaHora(e.generadoEn)}</p>
            </div>
          </section>

          <section aria-label="Resumen del periodo" className="grid grid-cols-2 gap-px bg-borde lg:grid-cols-4">
            {[
              ['Saldo inicial', e.saldoInicial, ''],
              ['(+) Créditos', e.totalCreditos, 'text-exito'],
              ['(−) Débitos', e.totalDebitos, ''],
              ['Saldo final', e.saldoFinal, 'text-primario'],
            ].map(([t, v, clase]) => (
              <div key={t} className="bg-tarjeta p-5">
                <p className="text-sm text-texto-apagado">{t}</p>
                <p className={`cifras mt-1 text-xl font-semibold ${clase}`}>{formatoMoneda(v ?? '0', e.cuenta.moneda)}</p>
              </div>
            ))}
          </section>

          {e.porCategoria.length > 0 && (
            <section className="border-b border-borde p-6">
              <h2 className="mb-4 font-semibold">¿En qué se fue el dinero?</h2>
              <ul className="space-y-3">
                {e.porCategoria.slice(0, 6).map((p) => (
                  <li key={p.categoria} className="grid grid-cols-[120px_1fr_auto] items-center gap-3 text-sm sm:grid-cols-[160px_1fr_auto]">
                    <span>{NOMBRE_CATEGORIA[p.categoria]}</span>
                    <span className="h-2.5 overflow-hidden rounded-full bg-apagado" aria-hidden>
                      <span className="block h-full rounded-full bg-secundario" style={{ width: `${(Number(p.total) / maxCategoria) * 100}%` }} />
                    </span>
                    <span className="cifras text-right font-medium">{formatoMoneda(p.total, e.cuenta.moneda)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h2 className="px-6 pt-6 font-semibold">Detalle de movimientos ({e.movimientos.length})</h2>
            {e.movimientos.length ? (
              <div className="mt-2">
                <ListaMovimientos movimientos={e.movimientos} moneda={e.cuenta.moneda} />
              </div>
            ) : (
              <p className="p-6 text-texto-apagado">Sin movimientos en el periodo.</p>
            )}
          </section>
          <footer className="border-t border-borde p-6 text-xs text-texto-apagado">
            Este documento es una representación electrónica generada por BancaGT en Línea. Verifique sus movimientos y
            reporte cualquier inconsistencia dentro de los 30 días siguientes.
          </footer>
        </Tarjeta>
      )}
    </div>
  );
}
