import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { Eye, EyeOff, Lock, ShieldCheck, Smartphone, TrendingUp } from 'lucide-react';
import { ErrorApi } from '../api/cliente';
import { useSesion } from '../sesion/ContextoSesion';
import { Alerta, Boton, Campo } from '../componentes/ui';
import { Logo } from '../componentes/Marco';
import { formatoFechaHora } from '../utilidades/formato';

export function Ingresar() {
  const { estado, iniciar, motivoCierre } = useSesion();
  const navegar = useNavigate();
  const ubicacion = useLocation();
  const [usuario, setUsuario] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [ver, setVer] = useState(false);
  const [errores, setErrores] = useState<{ usuario?: string; contrasena?: string; general?: string; bloqueo?: string }>({});
  const [enviando, setEnviando] = useState(false);

  if (estado === 'activa') return <Navigate to="/" replace />;

  const validar = () => {
    const e: typeof errores = {};
    if (!/^[a-zA-Z0-9._-]{3,40}$/.test(usuario.trim())) e.usuario = 'Ingrese su usuario (3 a 40 caracteres, sin espacios).';
    if (contrasena.length < 8) e.contrasena = 'La contraseña tiene al menos 8 caracteres.';
    setErrores(e);
    return Object.keys(e).length === 0;
  };

  const enviar = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!validar()) return;
    setEnviando(true);
    try {
      await iniciar(usuario.trim(), contrasena);
      const destino = (ubicacion.state as { desde?: string } | null)?.desde ?? '/';
      navegar(destino, { replace: true });
    } catch (err) {
      setContrasena('');
      if (err instanceof ErrorApi && err.status === 423) {
        const hasta = err.problema.bloqueadoHasta as string | undefined;
        setErrores({ bloqueo: `Por seguridad, su usuario está bloqueado${hasta ? ` hasta las ${formatoFechaHora(hasta)}` : ''}.` });
      } else if (err instanceof ErrorApi && err.status === 401) {
        const restantes = err.problema.intentosRestantes as number | undefined;
        setErrores({ general: `${err.message}.${restantes !== undefined ? ` Le quedan ${restantes} intento(s) antes del bloqueo temporal.` : ''}` });
      } else if (err instanceof ErrorApi && err.status === 429) {
        setErrores({ general: 'Demasiados intentos desde este equipo. Espere un minuto e intente de nuevo.' });
      } else {
        setErrores({ general: 'No pudimos conectar con el banco. Verifique su conexión e intente de nuevo.' });
      }
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* Panel de marca: confianza y seguridad (patrón Trust & Authority) */}
      <section className="relative hidden overflow-hidden bg-primario p-12 text-white lg:flex lg:flex-col">
        <Logo claro />
        <div className="my-auto max-w-md">
          <p className="text-sm font-semibold uppercase tracking-widest text-acento-claro">Banca en línea</p>
          <h1 className="mt-3 text-4xl font-semibold leading-tight text-balance">Su dinero, claro y seguro, cuando lo necesite.</h1>
          <ul className="mt-10 space-y-5 text-white/80">
            {[
              { Icono: ShieldCheck, t: 'Cifrado TLS 1.3 de extremo a extremo y bloqueo automático ante intentos sospechosos.' },
              { Icono: TrendingUp, t: 'Consulte saldos, movimientos y estados de cuenta en tiempo real.' },
              { Icono: Smartphone, t: 'Transfiera entre sus cuentas y a terceros con comprobante inmediato.' },
            ].map(({ Icono, t }) => (
              <li key={t} className="flex gap-3">
                <Icono className="mt-0.5 size-5 shrink-0 text-acento-claro" aria-hidden />
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-white/50">Entorno de laboratorio académico · Datos ficticios · Proyecto Final AWySI MIBC 2026</p>
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full border border-white/5" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 -right-10 size-[28rem] rounded-full border border-white/5" />
      </section>

      <section className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-sm aparecer">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">Ingrese a su banca</h2>
          <p className="mt-1 text-texto-apagado">Use el usuario y la contraseña de su banca en línea.</p>

          <div className="mt-6 space-y-3">
            {motivoCierre === 'expirada' && <Alerta tipo="aviso" titulo="Su sesión expiró">Por su seguridad la cerramos tras 15 minutos.</Alerta>}
            {errores.bloqueo && <Alerta tipo="error" titulo="Usuario bloqueado temporalmente">{errores.bloqueo}</Alerta>}
            {errores.general && <Alerta tipo="error">{errores.general}</Alerta>}
          </div>

          <form onSubmit={enviar} noValidate className="mt-6 space-y-5">
            <Campo
              etiqueta="Usuario"
              name="usuario"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              onBlur={() => usuario && validar()}
              error={errores.usuario}
            />
            <div className="relative">
              <Campo
                etiqueta="Contraseña"
                name="contrasena"
                type={ver ? 'text' : 'password'}
                autoComplete="current-password"
                value={contrasena}
                onChange={(e) => setContrasena(e.target.value)}
                error={errores.contrasena}
                className="pr-12"
              />
              <button
                type="button"
                onClick={() => setVer((v) => !v)}
                aria-label={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                aria-pressed={ver}
                className="absolute right-1 top-[30px] grid size-10 place-items-center rounded-md text-texto-apagado hover:bg-apagado"
              >
                {ver ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
              </button>
            </div>
            <Boton type="submit" bloque cargando={enviando} icono={Lock}>
              Ingresar
            </Boton>
          </form>

          <details className="mt-8 rounded-lg border border-borde bg-tarjeta p-4 text-sm">
            <summary className="font-medium text-secundario">Usuarios de demostración</summary>
            <p className="mt-2 text-texto-apagado">
              Contraseña para todos: <code className="rounded bg-apagado px-1.5 py-0.5 text-texto">BancaGT#2026</code>
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {['mlopez', 'jperez', 'agarcia', 'cramirez', 'lmendez'].map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUsuario(u)}
                  className="min-h-9 rounded-md border border-borde px-2.5 font-mono text-xs transition-colors hover:bg-apagado"
                >
                  {u}
                </button>
              ))}
            </div>
          </details>
        </div>
      </section>
    </div>
  );
}
