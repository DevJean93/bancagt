import type { Moneda, Movimiento } from '../api/tipos';
import { formatoFecha, NOMBRE_CATEGORIA } from '../utilidades/formato';
import { IconoCategoria } from './categorias';
import { Monto } from './ui';

/** Lista de movimientos: tabla en escritorio, lista apilada en móvil (sin scroll horizontal). */
export function ListaMovimientos({ movimientos, moneda, conSaldo = true, compacta = false }: { movimientos: Movimiento[]; moneda: Moneda; conSaldo?: boolean; compacta?: boolean }) {
  return (
    <>
      <table className={compacta ? 'hidden' : 'hidden w-full table-fixed text-sm md:table'}>
        <caption className="sr-only">Movimientos de la cuenta</caption>
        <thead>
          <tr className="border-b border-borde text-left text-xs uppercase tracking-wide text-texto-apagado">
            <th scope="col" className="w-32 px-4 py-3 font-medium">Fecha</th>
            <th scope="col" className="px-4 py-3 font-medium">Descripción</th>
            <th scope="col" className="w-36 px-4 py-3 text-right font-medium">Monto</th>
            {conSaldo && <th scope="col" className="w-36 px-4 py-3 text-right font-medium">Saldo</th>}
          </tr>
        </thead>
        <tbody>
          {movimientos.map((m) => (
            <tr key={m.id} className="border-b border-borde last:border-0 transition-colors hover:bg-fondo">
              <td className="cifras whitespace-nowrap px-4 py-3 text-texto-apagado">{formatoFecha(m.fecha)}</td>
              <td className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <IconoCategoria categoria={m.categoria} credito={m.tipo === 'CREDITO'} />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{m.descripcion}</p>
                    <p className="text-xs text-texto-apagado">
                      {NOMBRE_CATEGORIA[m.categoria]}
                      {m.referencia && <span className="cifras"> · {m.referencia}</span>}
                    </p>
                  </div>
                </div>
              </td>
              <td className="px-4 py-3 text-right">
                <Monto valor={m.monto} moneda={moneda} tipo={m.tipo} />
              </td>
              {conSaldo && (
                <td className="px-4 py-3 text-right text-texto-apagado">
                  <Monto valor={m.saldoPosterior} moneda={moneda} className="font-normal text-texto-apagado" />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      <ul className={compacta ? 'divide-y divide-borde' : 'divide-y divide-borde md:hidden'}>
        {movimientos.map((m) => (
          <li key={m.id} className="flex items-center gap-3 px-4 py-3">
            <IconoCategoria categoria={m.categoria} credito={m.tipo === 'CREDITO'} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{m.descripcion}</p>
              <p className="text-xs text-texto-apagado">{formatoFecha(m.fecha)} · {NOMBRE_CATEGORIA[m.categoria]}</p>
            </div>
            <Monto valor={m.monto} moneda={moneda} tipo={m.tipo} className="text-sm" />
          </li>
        ))}
      </ul>
    </>
  );
}
