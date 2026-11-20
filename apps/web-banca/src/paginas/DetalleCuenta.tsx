import { useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { ArrowLeft, Eye, EyeOff, FileText, Filter, Inbox, X } from 'lucide-react';
import { useCuenta, useMovimientos, type FiltrosMovimientos } from '../api/servicios';
import type { Categoria } from '../api/tipos';
import { Alerta, Boton, Campo, Encabezado, Esqueleto, Paginacion, Selector, Tarjeta } from '../componentes/ui';
import { ListaMovimientos } from '../componentes/Movimientos';
import { formatoFecha, formatoMoneda, formatoNumeroCuenta, NOMBRE_CATEGORIA, NOMBRE_TIPO_CUENTA } from '../utilidades/formato';

export function DetalleCuenta() {
  const { id = '' } = useParams();
  const cuenta = useCuenta(id);
  const [verNumero, setVerNumero] = useState(false);
  // Los filtros viven en la URL: se pueden compartir/recargar (deep linking).
  const [parametros, setParametros] = useSearchParams();
  const filtros: FiltrosMovimientos = {
    desde: parametros.get('desde') ?? undefined,
    hasta: parametros.get('hasta') ?? undefined,
    tipo: parametros.get('tipo') ?? undefined,
    categoria: parametros.get('categoria') ?? undefined,
    texto: parametros.get('texto') ?? undefined,
    pagina: Number(parametros.get('pagina') ?? 1),
    tamano: 15,
  };
  const movs = useMovimientos(id, filtros);
  const hayFiltros = Boolean(filtros.desde || filtros.hasta || filtros.tipo || filtros.categoria || filtros.texto);

  const aplicar = (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    const nuevos = new URLSearchParams();
    for (const k of ['desde', 'hasta', 'tipo', 'categoria', 'texto']) {
      const v = String(f.get(k) ?? '').trim();
      if (v) nuevos.set(k, v);
    }
    setParametros(nuevos);
  };

  const c = cuenta.data;
  return (
    <div className="aparecer">
      <Link to="/" className="mb-4 inline-flex min-h-11 items-center gap-1 text-sm font-medium text-secundario hover:underline">
        <ArrowLeft className="size-4" aria-hidden /> Volver al inicio
      </Link>

      {cuenta.isError && <Alerta tipo="error" titulo="Cuenta no disponible">Verifique que la cuenta le pertenezca.</Alerta>}

      {c ? (
        <>
          <Encabezado
            titulo={c.alias ?? `Cuenta ${NOMBRE_TIPO_CUENTA[c.tipo].toLowerCase()}`}
            descripcion={`${NOMBRE_TIPO_CUENTA[c.tipo]} en ${c.moneda === 'GTQ' ? 'quetzales' : 'dólares'} · abierta el ${formatoFecha(c.abiertaEn)}`}
            acciones={
              <Link to={`/cuentas/${c.id}/estado`} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-borde bg-tarjeta px-4 text-sm font-semibold hover:bg-apagado">
                <FileText className="size-4" aria-hidden /> Estado de cuenta
              </Link>
            }
          />
          <Tarjeta className="mb-6 grid gap-6 p-5 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-sm text-texto-apagado">Número de cuenta</p>
              <p className="cifras mt-1 flex items-center gap-2 text-lg font-semibold">
                {verNumero ? formatoNumeroCuenta(c.numero) : c.numeroEnmascarado}
                <button
                  onClick={() => setVerNumero((v) => !v)}
                  aria-label={verNumero ? 'Ocultar número' : 'Mostrar número completo'}
                  className="grid size-9 place-items-center rounded-md text-texto-apagado hover:bg-apagado"
                >
                  {verNumero ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                </button>
              </p>
            </div>
            <div>
              <p className="text-sm text-texto-apagado">Saldo disponible</p>
              <p className="cifras mt-1 text-2xl font-semibold">{formatoMoneda(c.saldoDisponible, c.moneda)}</p>
            </div>
            <div>
              <p className="text-sm text-texto-apagado">Saldo contable</p>
              <p className="cifras mt-1 text-lg font-medium">{formatoMoneda(c.saldoContable, c.moneda)}</p>
            </div>
            <div>
              <p className="text-sm text-texto-apagado">En reserva</p>
              <p className="cifras mt-1 text-lg font-medium text-aviso">{formatoMoneda(c.enReserva, c.moneda)}</p>
              <p className="text-xs text-texto-apagado">Cheques depositados pendientes de liberar</p>
            </div>
          </Tarjeta>
        </>
      ) : (
        !cuenta.isError && <Esqueleto className="mb-6 h-36 rounded-tarjeta" />
      )}

      <Tarjeta>
        <form onSubmit={aplicar} className="grid gap-4 border-b border-borde p-5 sm:grid-cols-2 lg:grid-cols-6" aria-label="Filtrar movimientos">
          <Campo etiqueta="Desde" type="date" name="desde" defaultValue={filtros.desde} />
          <Campo etiqueta="Hasta" type="date" name="hasta" defaultValue={filtros.hasta} />
          <Selector etiqueta="Tipo" name="tipo" defaultValue={filtros.tipo ?? ''}>
            <option value="">Todos</option>
            <option value="CREDITO">Créditos</option>
            <option value="DEBITO">Débitos</option>
          </Selector>
          <Selector etiqueta="Categoría" name="categoria" defaultValue={filtros.categoria ?? ''}>
            <option value="">Todas</option>
            {(Object.keys(NOMBRE_CATEGORIA) as Categoria[]).map((k) => (
              <option key={k} value={k}>{NOMBRE_CATEGORIA[k]}</option>
            ))}
          </Selector>
          <Campo etiqueta="Buscar" name="texto" placeholder="Comercio o concepto" defaultValue={filtros.texto} minLength={2} />
          <div className="flex items-end gap-2">
            <Boton type="submit" icono={Filter} className="flex-1">Filtrar</Boton>
            {hayFiltros && (
              <Boton type="button" variante="fantasma" aria-label="Quitar filtros" onClick={() => setParametros({})} icono={X} />
            )}
          </div>
        </form>

        {movs.isError && <div className="p-5"><Alerta tipo="error">No se pudieron cargar los movimientos con esos filtros.</Alerta></div>}
        {movs.data && (
          <p className="px-5 pt-4 text-sm text-texto-apagado" aria-live="polite">
            {movs.data.total} movimiento{movs.data.total === 1 ? '' : 's'}
            {hayFiltros ? ' con los filtros aplicados' : ''}
          </p>
        )}
        {movs.data && c ? (
          movs.data.elementos.length ? (
            <ListaMovimientos movimientos={movs.data.elementos} moneda={c.moneda} />
          ) : (
            <EstadoVacioFiltros />
          )
        ) : (
          !movs.isError && <div className="space-y-3 p-5">{Array.from({ length: 8 }, (_, i) => <Esqueleto key={i} className="h-12" />)}</div>
        )}
        {movs.data && (
          <Paginacion
            pagina={movs.data.pagina}
            paginas={movs.data.paginas}
            alCambiar={(p) => {
              const n = new URLSearchParams(parametros);
              n.set('pagina', String(p));
              setParametros(n);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        )}
      </Tarjeta>
    </div>
  );
}

function EstadoVacioFiltros() {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <Inbox className="size-8 text-texto-apagado" aria-hidden />
      <p className="font-medium">No hay movimientos con esos criterios</p>
      <p className="text-sm text-texto-apagado">Pruebe ampliar el rango de fechas o quitar filtros.</p>
    </div>
  );
}
