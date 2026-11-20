import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Lock, PiggyBank, UserPlus, Users, Wallet } from 'lucide-react';
import { ErrorApi, nuevaClaveIdempotencia } from '../api/cliente';
import { useBeneficiarios, useLimites, usePosicion, useTransferir } from '../api/servicios';
import type { Beneficiario, Cuenta, Destino } from '../api/tipos';
import { Alerta, Boton, Campo, Encabezado, Esqueleto, EstadoVacio, Tarjeta, cx } from '../componentes/ui';
import { formatoMoneda, NOMBRE_TIPO_CUENTA } from '../utilidades/formato';

type Paso = 1 | 2 | 3;
const PASOS = ['Cuentas', 'Monto', 'Confirmar'] as const;

function Progreso({ paso }: { paso: Paso }) {
  return (
    <ol className="mb-6 flex items-center gap-2" aria-label="Pasos de la transferencia">
      {PASOS.map((t, i) => {
        const n = (i + 1) as Paso;
        const estado = n < paso ? 'hecho' : n === paso ? 'actual' : 'pendiente';
        return (
          <li key={t} className="flex flex-1 items-center gap-2" aria-current={estado === 'actual' ? 'step' : undefined}>
            <span
              className={cx(
                'grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold transition-colors',
                estado === 'hecho' && 'bg-exito text-white',
                estado === 'actual' && 'bg-primario text-white',
                estado === 'pendiente' && 'bg-apagado text-texto-apagado',
              )}
            >
              {estado === 'hecho' ? <Check className="size-4" aria-hidden /> : n}
            </span>
            <span className={cx('text-sm font-medium', estado === 'pendiente' && 'text-texto-apagado')}>{t}</span>
            {i < PASOS.length - 1 && <span className="h-px flex-1 bg-borde" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}

interface OpcionDestino {
  clave: string;
  destino: Destino;
  titulo: string;
  detalle: string;
  moneda: Cuenta['moneda'];
  tercero: boolean;
}

function Opcion({ activa, deshabilitada, motivo, alElegir, icono: Icono, titulo, detalle }: {
  activa: boolean; deshabilitada?: boolean; motivo?: string; alElegir: () => void;
  icono: typeof Wallet; titulo: string; detalle: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={activa}
      disabled={deshabilitada}
      onClick={alElegir}
      className={cx(
        'flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors duration-200',
        activa ? 'border-secundario bg-secundario-suave/50 ring-1 ring-secundario' : 'border-borde hover:bg-fondo',
        deshabilitada && 'opacity-50',
      )}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-apagado">
        <Icono className="size-5 text-texto-apagado" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{titulo}</span>
        <span className="cifras block truncate text-sm text-texto-apagado">{deshabilitada && motivo ? motivo : detalle}</span>
      </span>
      {activa && <CheckCircle2 className="size-5 text-secundario" aria-hidden />}
    </button>
  );
}

export function Transferir() {
  const navegar = useNavigate();
  const [params] = useSearchParams();
  const posicion = usePosicion();
  const beneficiarios = useBeneficiarios();
  const limites = useLimites();
  const transferir = useTransferir();

  const [paso, setPaso] = useState<Paso>(1);
  const [origenId, setOrigenId] = useState<string>();
  const [destinoClave, setDestinoClave] = useState<string | undefined>(params.get('beneficiario') ? `b:${params.get('beneficiario')}` : undefined);
  const [monto, setMonto] = useState('');
  const [concepto, setConcepto] = useState('');
  const [errores, setErrores] = useState<{ monto?: string; concepto?: string; destino?: string }>({});
  const [clave, setClave] = useState(nuevaClaveIdempotencia);

  const cuentas = (posicion.data?.cuentas ?? []).filter((c) => c.estado === 'ACTIVA');
  const origen = cuentas.find((c) => c.id === origenId) ?? cuentas[0];

  const opciones = useMemo<OpcionDestino[]>(() => {
    const propias = cuentas
      .filter((c) => c.id !== origen?.id)
      .map((c) => ({
        clave: `c:${c.id}`,
        destino: { tipo: 'PROPIA', cuentaId: c.id } as Destino,
        titulo: c.alias ?? NOMBRE_TIPO_CUENTA[c.tipo],
        detalle: `${NOMBRE_TIPO_CUENTA[c.tipo]} ${c.moneda} ${c.numeroEnmascarado}`,
        moneda: c.moneda,
        tercero: false,
      }));
    const terceros = (beneficiarios.data ?? []).map((b: Beneficiario) => ({
      clave: `b:${b.id}`,
      destino: { tipo: 'BENEFICIARIO', beneficiarioId: b.id } as Destino,
      titulo: b.alias,
      detalle: `${b.titular} · ${NOMBRE_TIPO_CUENTA[b.tipo]} ${b.moneda} ${b.numeroEnmascarado}`,
      moneda: b.moneda,
      tercero: true,
    }));
    return [...propias, ...terceros];
  }, [cuentas, origen?.id, beneficiarios.data]);

  const destino = opciones.find((o) => o.clave === destinoClave && o.moneda === origen?.moneda);
  const limite = limites.data?.find((l) => l.moneda === origen?.moneda);

  const validarMonto = () => {
    const e: typeof errores = {};
    const n = Number(monto);
    if (!/^\d{1,9}(\.\d{1,2})?$/.test(monto) || n <= 0) e.monto = 'Ingrese un monto válido con hasta 2 decimales.';
    else if (n < 1) e.monto = `El monto mínimo es ${formatoMoneda(1, origen!.moneda)}.`;
    else if (origen && n > Number(origen.saldoDisponible)) e.monto = `Supera su saldo disponible (${formatoMoneda(origen.saldoDisponible, origen.moneda)}).`;
    else if (limite && n > Number(limite.porOperacion)) e.monto = `El límite por operación es ${formatoMoneda(limite.porOperacion, limite.moneda)}.`;
    else if (limite && destino?.tercero && n > Number(limite.disponibleHoy))
      e.monto = `Hoy puede transferir a terceros hasta ${formatoMoneda(limite.disponibleHoy, limite.moneda)}.`;
    if (concepto.trim().length < 3) e.concepto = 'Describa brevemente el motivo (mínimo 3 caracteres).';
    setErrores(e);
    return Object.keys(e).length === 0;
  };

  const confirmar = () => {
    if (!origen || !destino) return;
    transferir.mutate(
      { cuentaOrigenId: origen.id, destino: destino.destino, monto, concepto: concepto.trim(), claveIdempotencia: clave },
      { onSuccess: (c) => navegar(`/transferencias/${c.id}?nueva=1`, { replace: true }) },
    );
  };

  const errorServidor = transferir.error instanceof ErrorApi ? transferir.error : null;

  if (posicion.isPending) return <Esqueleto className="h-96 rounded-tarjeta" />;

  return (
    <div className="mx-auto max-w-2xl aparecer">
      <Encabezado titulo="Transferir" descripcion="Entre sus cuentas o a beneficiarios registrados de BancaGT." />
      <Progreso paso={paso} />

      {paso === 1 && origen && (
        <Tarjeta className="space-y-6 p-5">
          <fieldset className="min-w-0">
            <legend className="mb-3 font-semibold">¿Desde qué cuenta?</legend>
            <div role="radiogroup" className="space-y-2">
              {cuentas.map((c) => (
                <Opcion
                  key={c.id}
                  activa={c.id === origen.id}
                  alElegir={() => setOrigenId(c.id)}
                  icono={c.tipo === 'AHORRO' ? PiggyBank : Wallet}
                  titulo={`${c.alias ?? NOMBRE_TIPO_CUENTA[c.tipo]} · ${formatoMoneda(c.saldoDisponible, c.moneda)}`}
                  detalle={`${NOMBRE_TIPO_CUENTA[c.tipo]} ${c.moneda} ${c.numeroEnmascarado} · disponible`}
                />
              ))}
            </div>
          </fieldset>

          <fieldset className="min-w-0">
            <legend className="mb-3 font-semibold">¿A qué cuenta?</legend>
            {opciones.length === 0 ? (
              <EstadoVacio icono={Users} titulo="No tiene cuentas destino" descripcion="Registre un beneficiario para transferir a terceros." />
            ) : (
              <div role="radiogroup" className="space-y-2">
                {opciones.map((o) => (
                  <Opcion
                    key={o.clave}
                    activa={o.clave === destino?.clave}
                    deshabilitada={o.moneda !== origen.moneda}
                    motivo={`Cuenta en ${o.moneda}: elija un origen en la misma moneda`}
                    alElegir={() => setDestinoClave(o.clave)}
                    icono={o.tercero ? Users : Wallet}
                    titulo={o.tercero ? `${o.titulo} (tercero)` : `${o.titulo} (propia)`}
                    detalle={o.detalle}
                  />
                ))}
              </div>
            )}
            <Link to="/beneficiarios" className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-secundario hover:underline">
              <UserPlus className="size-4" aria-hidden /> Registrar un beneficiario
            </Link>
            {errores.destino && <p className="text-sm text-peligro">{errores.destino}</p>}
          </fieldset>

          <div className="flex justify-end">
            <Boton
              onClick={() => (destino ? setPaso(2) : setErrores({ destino: 'Seleccione la cuenta destino.' }))}
              icono={ArrowRight}
            >
              Continuar
            </Boton>
          </div>
        </Tarjeta>
      )}

      {paso === 2 && origen && destino && (
        <Tarjeta className="space-y-5 p-5">
          <div className="rounded-lg bg-fondo p-3 text-sm">
            <p>
              De <strong>{origen.alias ?? NOMBRE_TIPO_CUENTA[origen.tipo]}</strong> <span className="cifras">{origen.numeroEnmascarado}</span> a{' '}
              <strong>{destino.titulo}</strong>
            </p>
            <p className="cifras mt-1 text-texto-apagado">Disponible: {formatoMoneda(origen.saldoDisponible, origen.moneda)}</p>
          </div>
          <Campo
            etiqueta={`Monto (${origen.moneda})`}
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={monto}
            onChange={(e) => setMonto(e.target.value.replace(/[^\d.]/g, ''))}
            onBlur={() => monto && validarMonto()}
            error={errores.monto}
            ayuda={
              limite
                ? `Límite por operación ${formatoMoneda(limite.porOperacion, limite.moneda)}${destino.tercero ? ` · disponible hoy a terceros ${formatoMoneda(limite.disponibleHoy, limite.moneda)}` : ''}`
                : undefined
            }
            className="cifras text-lg"
          />
          <Campo
            etiqueta="Concepto"
            maxLength={80}
            placeholder="Ej.: Pago de alquiler de noviembre"
            value={concepto}
            onChange={(e) => setConcepto(e.target.value)}
            error={errores.concepto}
            ayuda={`${concepto.length}/80 caracteres. El beneficiario verá este texto.`}
          />
          <div className="flex justify-between">
            <Boton variante="secundario" icono={ArrowLeft} onClick={() => setPaso(1)}>Atrás</Boton>
            <Boton icono={ArrowRight} onClick={() => validarMonto() && (setClave(nuevaClaveIdempotencia()), setPaso(3))}>Revisar</Boton>
          </div>
        </Tarjeta>
      )}

      {paso === 3 && origen && destino && (
        <Tarjeta className="p-5">
          <h2 className="font-semibold">Revise antes de confirmar</h2>
          <dl className="mt-4 divide-y divide-borde text-sm">
            {[
              ['Desde', `${origen.alias ?? NOMBRE_TIPO_CUENTA[origen.tipo]} ${origen.numeroEnmascarado}`],
              ['Hacia', `${destino.titulo} · ${destino.detalle}`],
              ['Concepto', concepto.trim()],
            ].map(([t, v]) => (
              <div key={t} className="flex justify-between gap-6 py-3">
                <dt className="text-texto-apagado">{t}</dt>
                <dd className="cifras text-right font-medium">{v}</dd>
              </div>
            ))}
            <div className="flex items-baseline justify-between py-4">
              <dt className="text-texto-apagado">Monto</dt>
              <dd className="cifras text-2xl font-semibold">{formatoMoneda(monto, origen.moneda)}</dd>
            </div>
          </dl>
          {errorServidor && (
            <div className="mb-4">
              <Alerta tipo="error" titulo="No se realizó la transferencia">{errorServidor.message}</Alerta>
            </div>
          )}
          {transferir.isError && !errorServidor && (
            <div className="mb-4">
              <Alerta tipo="aviso" titulo="No recibimos respuesta del banco">
                Puede reintentar con seguridad: la operación está protegida contra cargos duplicados.
              </Alerta>
            </div>
          )}
          <div className="flex justify-between">
            <Boton variante="secundario" icono={ArrowLeft} onClick={() => setPaso(2)} disabled={transferir.isPending}>Atrás</Boton>
            <Boton icono={Lock} cargando={transferir.isPending} onClick={confirmar}>Confirmar transferencia</Boton>
          </div>
        </Tarjeta>
      )}
    </div>
  );
}
