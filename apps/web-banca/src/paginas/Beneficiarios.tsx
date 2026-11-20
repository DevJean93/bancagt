import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { ArrowLeftRight, Search, Trash2, UserPlus, Users } from 'lucide-react';
import { ErrorApi } from '../api/cliente';
import { consultarTitular, useAgregarBeneficiario, useBeneficiarios, useEliminarBeneficiario } from '../api/servicios';
import type { ConsultaTitular } from '../api/tipos';
import { Alerta, Boton, Campo, Encabezado, Esqueleto, EstadoVacio, Insignia, Tarjeta } from '../componentes/ui';
import { formatoFecha, NOMBRE_TIPO_CUENTA } from '../utilidades/formato';

function FormularioNuevo({ alTerminar }: { alTerminar: () => void }) {
  const [numero, setNumero] = useState('');
  const [alias, setAlias] = useState('');
  const [titular, setTitular] = useState<ConsultaTitular | null>(null);
  const [errores, setErrores] = useState<{ numero?: string; alias?: string; general?: string }>({});
  const [buscando, setBuscando] = useState(false);
  const agregar = useAgregarBeneficiario();

  const buscar = async () => {
    setTitular(null);
    if (!/^\d{10}$/.test(numero)) return setErrores({ numero: 'El número de cuenta tiene 10 dígitos.' });
    setBuscando(true);
    try {
      const t = await consultarTitular(numero);
      if (t.esPropia) setErrores({ numero: 'Es una cuenta suya: ya está disponible para transferir.' });
      else {
        setErrores({});
        setTitular(t);
      }
    } catch (e) {
      setErrores({ numero: e instanceof ErrorApi ? e.message : 'No se pudo verificar la cuenta.' });
    } finally {
      setBuscando(false);
    }
  };

  const guardar = (ev: FormEvent) => {
    ev.preventDefault();
    if (!titular) return void buscar();
    if (alias.trim().length < 2) return setErrores({ alias: 'Escriba un nombre para identificarlo (mínimo 2 caracteres).' });
    agregar.mutate(
      { numero, alias: alias.trim() },
      {
        onSuccess: alTerminar,
        onError: (e) => setErrores({ general: e instanceof ErrorApi ? e.message : 'No se pudo registrar.' }),
      },
    );
  };

  return (
    <Tarjeta className="mb-6 p-5 aparecer">
      <h2 className="font-semibold">Nuevo beneficiario</h2>
      <p className="text-sm text-texto-apagado">Solo cuentas de BancaGT. Verificaremos el titular antes de guardarlo.</p>
      <form onSubmit={guardar} className="mt-4 space-y-4" noValidate>
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <Campo
              etiqueta="Número de cuenta"
              inputMode="numeric"
              maxLength={10}
              placeholder="10 dígitos"
              value={numero}
              onChange={(e) => {
                setNumero(e.target.value.replace(/\D/g, ''));
                setTitular(null);
              }}
              error={errores.numero}
              className="cifras"
            />
          </div>
          <Boton type="button" variante="secundario" icono={Search} cargando={buscando} onClick={buscar} className="mt-7">
            Verificar
          </Boton>
        </div>
        {titular && (
          <Alerta tipo="info" titulo={`Titular: ${titular.titular}`}>
            {NOMBRE_TIPO_CUENTA[titular.tipo]} en {titular.moneda} {titular.numeroEnmascarado}
          </Alerta>
        )}
        {titular && (
          <Campo etiqueta="Alias" placeholder="Ej.: Mamá, alquiler, Juan" maxLength={40} value={alias} onChange={(e) => setAlias(e.target.value)} error={errores.alias} />
        )}
        {errores.general && <Alerta tipo="error">{errores.general}</Alerta>}
        <div className="flex justify-end gap-2">
          <Boton type="button" variante="fantasma" onClick={alTerminar}>Cancelar</Boton>
          <Boton type="submit" icono={UserPlus} disabled={!titular} cargando={agregar.isPending}>Guardar beneficiario</Boton>
        </div>
      </form>
    </Tarjeta>
  );
}

export function Beneficiarios() {
  const q = useBeneficiarios();
  const eliminar = useEliminarBeneficiario();
  const [nuevo, setNuevo] = useState(false);
  const [confirmando, setConfirmando] = useState<string | null>(null);

  return (
    <div className="aparecer">
      <Encabezado
        titulo="Beneficiarios"
        descripcion="Cuentas de terceros a las que transfiere con frecuencia."
        acciones={!nuevo && <Boton icono={UserPlus} onClick={() => setNuevo(true)}>Agregar</Boton>}
      />
      {nuevo && <FormularioNuevo alTerminar={() => setNuevo(false)} />}
      <Tarjeta>
        {q.isPending && <div className="space-y-3 p-5">{Array.from({ length: 4 }, (_, i) => <Esqueleto key={i} className="h-14" />)}</div>}
        {q.data?.length === 0 && (
          <EstadoVacio icono={Users} titulo="No tiene beneficiarios" descripcion="Agregue uno para transferir a terceros." accion={<Boton icono={UserPlus} onClick={() => setNuevo(true)}>Agregar beneficiario</Boton>} />
        )}
        <ul className="divide-y divide-borde">
          {q.data?.map((b) => (
            <li key={b.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
              <span className="grid size-10 place-items-center rounded-full bg-apagado font-semibold text-texto-apagado" aria-hidden>
                {b.alias.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{b.alias}</p>
                <p className="cifras text-sm text-texto-apagado">
                  {b.titular} · {NOMBRE_TIPO_CUENTA[b.tipo]} {b.numeroEnmascarado} · desde {formatoFecha(b.creadoEn)}
                </p>
              </div>
              <Insignia tono={b.moneda === 'USD' ? 'acento' : 'neutro'}>{b.moneda}</Insignia>
              {confirmando === b.id ? (
                <span className="flex gap-2">
                  <Boton variante="peligro" cargando={eliminar.isPending} onClick={() => eliminar.mutate(b.id, { onSettled: () => setConfirmando(null) })}>
                    Sí, eliminar
                  </Boton>
                  <Boton variante="fantasma" onClick={() => setConfirmando(null)}>No</Boton>
                </span>
              ) : (
                <span className="flex gap-1">
                  <Link
                    to={`/transferir?beneficiario=${b.id}`}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-secundario hover:bg-secundario-suave"
                  >
                    <ArrowLeftRight className="size-4" aria-hidden /> Transferir
                  </Link>
                  <button
                    onClick={() => setConfirmando(b.id)}
                    aria-label={`Eliminar a ${b.alias}`}
                    className="grid size-11 place-items-center rounded-lg text-texto-apagado transition-colors hover:bg-peligro-suave hover:text-peligro"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      </Tarjeta>
    </div>
  );
}
