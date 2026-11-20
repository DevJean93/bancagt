import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { ArrowLeft, ArrowLeftRight, CheckCircle2, ChevronRight, History, Printer } from 'lucide-react';
import { useComprobante, useTransferencias } from '../api/servicios';
import type { Comprobante as TipoComprobante } from '../api/tipos';
import { Alerta, Boton, Encabezado, Esqueleto, EstadoVacio, Insignia, Paginacion, Tarjeta } from '../componentes/ui';
import { Logo } from '../componentes/Marco';
import { formatoFechaHora, formatoMoneda, NOMBRE_TIPO_CUENTA } from '../utilidades/formato';

const destinoTexto = (t: TipoComprobante) =>
  t.destino.propia ? `Cuenta propia ${t.destino.numeroEnmascarado}` : `${t.destino.alias ?? t.destino.titular} ${t.destino.numeroEnmascarado}`;

export function HistorialTransferencias() {
  const [pagina, setPagina] = useState(1);
  const q = useTransferencias(pagina);

  return (
    <div className="aparecer">
      <Encabezado
        titulo="Historial de transferencias"
        descripcion="Todas las operaciones realizadas desde su banca en línea."
        acciones={
          <Link to="/transferir" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primario px-4 text-sm font-semibold text-white hover:bg-secundario">
            <ArrowLeftRight className="size-4" aria-hidden /> Nueva transferencia
          </Link>
        }
      />
      <Tarjeta>
        {q.isPending && <div className="space-y-3 p-5">{Array.from({ length: 6 }, (_, i) => <Esqueleto key={i} className="h-14" />)}</div>}
        {q.isError && <div className="p-5"><Alerta tipo="error">No se pudo cargar el historial.</Alerta></div>}
        {q.data && q.data.elementos.length === 0 && (
          <EstadoVacio icono={History} titulo="Aún no ha realizado transferencias" descripcion="Cuando transfiera, aquí verá cada comprobante." />
        )}
        {q.data && q.data.elementos.length > 0 && (
          <ul className="divide-y divide-borde">
            {q.data.elementos.map((t) => (
              <li key={t.id}>
                <Link to={`/transferencias/${t.id}`} className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-fondo">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secundario-suave text-secundario">
                    <ArrowLeftRight className="size-[18px]" aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{t.concepto}</span>
                    <span className="cifras block truncate text-sm text-texto-apagado">
                      {formatoFechaHora(t.fecha)} · a {destinoTexto(t)}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="cifras block font-semibold">−{formatoMoneda(t.monto, t.moneda)}</span>
                    <span className="cifras block text-xs text-texto-apagado">{t.referencia}</span>
                  </span>
                  <ChevronRight className="size-4 text-texto-apagado" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        )}
        {q.data && <Paginacion pagina={q.data.pagina} paginas={q.data.paginas} alCambiar={setPagina} />}
      </Tarjeta>
    </div>
  );
}

export function Comprobante() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const q = useComprobante(id);
  const t = q.data;

  return (
    <div className="mx-auto max-w-xl aparecer">
      <div className="no-imprimir mb-4 flex items-center justify-between">
        <Link to="/transferencias" className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-secundario hover:underline">
          <ArrowLeft className="size-4" aria-hidden /> Historial
        </Link>
        <Boton variante="secundario" icono={Printer} onClick={() => window.print()} disabled={!t}>Imprimir</Boton>
      </div>
      {params.get('nueva') && t && (
        <div className="no-imprimir mb-4">
          <Alerta tipo="exito" titulo="Transferencia realizada">El dinero ya está disponible en la cuenta destino.</Alerta>
        </div>
      )}
      {q.isError && <Alerta tipo="error">Comprobante no encontrado.</Alerta>}
      {!t && !q.isError && <Esqueleto className="h-[480px] rounded-tarjeta" />}
      {t && (
        <Tarjeta className="imprimible overflow-hidden">
          <div className="flex items-center justify-between border-b-4 border-primario p-5">
            <Logo />
            <Insignia tono="exito"><CheckCircle2 className="size-3.5" aria-hidden /> {t.estado === 'COMPLETADA' ? 'Completada' : 'Rechazada'}</Insignia>
          </div>
          <div className="p-6 text-center">
            <p className="text-sm text-texto-apagado">Monto transferido</p>
            <p className="cifras mt-1 text-4xl font-semibold tracking-tight">{formatoMoneda(t.monto, t.moneda)}</p>
            <p className="mt-2 text-sm text-texto-apagado">{formatoFechaHora(t.fecha)}</p>
          </div>
          <dl className="divide-y divide-borde border-t border-borde px-6 text-sm">
            {[
              ['Número de comprobante', t.referencia],
              ['Cuenta de origen', `${NOMBRE_TIPO_CUENTA[t.origen.tipo]} ${t.origen.numeroEnmascarado}`],
              ['Cuenta destino', destinoTexto(t)],
              ['Titular destino', t.destino.titular],
              ['Concepto', t.concepto],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-6 py-3">
                <dt className="text-texto-apagado">{k}</dt>
                <dd className="cifras text-right font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="border-t border-borde bg-fondo p-4 text-center text-xs text-texto-apagado">
            Conserve este comprobante. ID de operación: <span className="cifras">{t.id}</span>
          </p>
        </Tarjeta>
      )}
    </div>
  );
}
