import { NavLink, Outlet, useNavigate } from 'react-router';
import { ArrowLeftRight, History, Home, LogOut, ShieldCheck, Users, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { useSesion, useSegundosRestantes } from '../sesion/ContextoSesion';
import { Boton, cx } from './ui';
import { formatoFechaHora } from '../utilidades/formato';

const NAVEGACION: { a: string; texto: string; icono: LucideIcon; fin?: boolean }[] = [
  { a: '/', texto: 'Inicio', icono: Home, fin: true },
  { a: '/transferir', texto: 'Transferir', icono: ArrowLeftRight },
  { a: '/transferencias', texto: 'Historial', icono: History },
  { a: '/beneficiarios', texto: 'Beneficiarios', icono: Users },
];

export function Logo({ claro }: { claro?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      {/* Marca propia de BancaGT: "G" abierta con punto terracota (no imita a ningún banco existente). */}
      <svg viewBox="0 0 32 32" className="size-8" aria-hidden>
        <rect width="32" height="32" rx="9" className={claro ? 'fill-white' : 'fill-primario'} />
        <path
          d="M22.4 11.2A8 8 0 1 0 24 16h-7.5"
          fill="none"
          className={claro ? 'stroke-primario' : 'stroke-white'}
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="23.6" cy="8.6" r="2.3" className="fill-acento-claro" />
      </svg>
      <span className={cx('text-lg font-semibold tracking-tight', claro ? 'text-white' : 'text-primario')}>
        BancaGT<span className={cx('ml-1 font-normal', claro ? 'text-white/70' : 'text-texto-apagado')}>en Línea</span>
      </span>
    </span>
  );
}

/** Aviso antes de que expire la sesión, con opción de extenderla. */
function AvisoExpiracion() {
  const { sesion, renovar } = useSesion();
  const segundos = useSegundosRestantes(sesion?.expiraEn);
  const [renovando, setRenovando] = useState(false);
  if (!sesion || segundos > 120) return null;
  return (
    <div role="alert" className="no-imprimir border-b border-aviso/25 bg-aviso-suave px-4 py-2.5 text-sm">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
        <span className="text-aviso">
          Por seguridad, su sesión se cerrará en <strong className="cifras">{Math.floor(segundos / 60)}:{String(segundos % 60).padStart(2, '0')}</strong>.
        </span>
        <Boton
          variante="secundario"
          cargando={renovando}
          onClick={async () => {
            setRenovando(true);
            await renovar().finally(() => setRenovando(false));
          }}
        >
          Mantener sesión
        </Boton>
      </div>
    </div>
  );
}

/** Estructura de la app autenticada: barra lateral (escritorio) y navegación inferior (móvil). */
export function Marco() {
  const { sesion, cerrar } = useSesion();
  const navegar = useNavigate();
  const salir = async () => {
    await cerrar();
    navegar('/ingresar', { replace: true });
  };

  const enlace = ({ isActive }: { isActive: boolean }) =>
    cx(
      'flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors duration-200',
      isActive ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5 hover:text-white',
    );

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[256px_minmax(0,1fr)]">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-tarjeta focus:px-3 focus:py-2">
        Saltar al contenido
      </a>

      {/* Barra lateral (≥ 1024 px) */}
      <div className="no-imprimir hidden bg-primario lg:block">
      <aside className="sticky top-0 flex h-dvh flex-col px-4 py-6">
        <Logo claro />
        <nav aria-label="Principal" className="mt-10 flex flex-col gap-1">
          {NAVEGACION.map(({ a, texto, icono: Icono, fin }) => (
            <NavLink key={a} to={a} end={fin} className={enlace}>
              <Icono className="size-5" aria-hidden /> {texto}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto space-y-4">
          <div className="flex items-start gap-2 rounded-lg bg-white/5 p-3 text-xs text-white/70">
            <ShieldCheck className="size-4 shrink-0 text-acento-claro" aria-hidden />
            <span>Conexión cifrada TLS 1.3. BancaGT nunca le pedirá su contraseña por correo o teléfono.</span>
          </div>
          <div className="border-t border-white/10 pt-4">
            <p className="truncate text-sm font-medium text-white">{sesion?.nombre}</p>
            {sesion?.ultimoAcceso && <p className="text-xs text-white/60">Último acceso: {formatoFechaHora(sesion.ultimoAcceso)}</p>}
            <button onClick={salir} className="mt-3 flex min-h-11 items-center gap-2 text-sm text-white/80 transition-colors hover:text-white">
              <LogOut className="size-4" aria-hidden /> Cerrar sesión
            </button>
          </div>
        </div>
      </aside>
      </div>

      <div className="flex min-h-dvh min-w-0 flex-col">
        {/* Encabezado móvil */}
        <header className="no-imprimir sticky top-0 z-20 flex items-center justify-between border-b border-borde bg-tarjeta/95 px-4 py-3 backdrop-blur lg:hidden">
          <Logo />
          <button onClick={salir} aria-label="Cerrar sesión" className="grid size-11 place-items-center rounded-lg text-texto-apagado hover:bg-apagado">
            <LogOut className="size-5" aria-hidden />
          </button>
        </header>
        <AvisoExpiracion />

        <main id="contenido" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-6 sm:px-6 lg:px-10 lg:pb-12 lg:pt-10">
          <Outlet />
        </main>

        {/* Navegación inferior (móvil, ≤ 5 destinos) */}
        <nav aria-label="Principal" className="no-imprimir fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-borde bg-tarjeta pb-[env(safe-area-inset-bottom)] lg:hidden">
          {NAVEGACION.map(({ a, texto, icono: Icono, fin }) => (
            <NavLink
              key={a}
              to={a}
              end={fin}
              className={({ isActive }) =>
                cx('flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium', isActive ? 'text-secundario' : 'text-texto-apagado')
              }
            >
              <Icono className="size-5" aria-hidden />
              {texto}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
