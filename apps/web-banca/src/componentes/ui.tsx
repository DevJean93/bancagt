// Componentes de interfaz reutilizables (presentacionales, sin lógica de negocio).
import {
  forwardRef,
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import { AlertTriangle, CheckCircle2, Info, Loader2, XCircle, type LucideIcon } from 'lucide-react';
import type { Moneda } from '../api/tipos';
import { formatoMoneda } from '../utilidades/formato';

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

// ---------------- Botón ----------------
type Variante = 'primario' | 'secundario' | 'fantasma' | 'peligro';
const VARIANTES: Record<Variante, string> = {
  primario: 'bg-primario text-sobre-primario hover:bg-secundario shadow-sm',
  secundario: 'bg-tarjeta text-texto border border-borde hover:bg-apagado',
  fantasma: 'text-secundario hover:bg-secundario-suave',
  peligro: 'bg-tarjeta text-peligro border border-borde hover:bg-peligro-suave',
};

interface PropsBoton extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: Variante;
  cargando?: boolean;
  icono?: LucideIcon;
  bloque?: boolean;
}

export function Boton({ variante = 'primario', cargando, icono: Icono, bloque, className, children, disabled, ...p }: PropsBoton) {
  return (
    <button
      {...p}
      disabled={disabled || cargando}
      aria-busy={cargando || undefined}
      className={cx(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold',
        'transition-colors duration-200 ease-(--ease-suave) disabled:cursor-not-allowed disabled:opacity-60',
        VARIANTES[variante],
        bloque && 'w-full',
        className,
      )}
    >
      {cargando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : Icono && <Icono className="size-4" aria-hidden />}
      {children}
    </button>
  );
}

// ---------------- Campos de formulario (etiqueta visible + error junto al campo) ----------------
interface PropsCampoBase {
  etiqueta: string;
  error?: string | undefined;
  ayuda?: string | undefined;
}

function Envoltura({ id, etiqueta, error, ayuda, children }: PropsCampoBase & { id: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-texto">
        {etiqueta}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="flex items-center gap-1 text-sm text-peligro">
          <XCircle className="size-4 shrink-0" aria-hidden /> {error}
        </p>
      ) : (
        ayuda && <p id={`${id}-ayuda`} className="text-sm text-texto-apagado">{ayuda}</p>
      )}
    </div>
  );
}

const claseCampo = (error?: string) =>
  cx(
    'min-h-11 w-full rounded-lg border bg-tarjeta px-3 text-base text-texto placeholder:text-texto-apagado/70',
    'transition-colors duration-200 focus:border-anillo focus:outline-none focus:ring-2 focus:ring-anillo/20',
    error ? 'border-peligro' : 'border-borde',
  );

export const Campo = forwardRef<HTMLInputElement, PropsCampoBase & InputHTMLAttributes<HTMLInputElement>>(
  ({ etiqueta, error, ayuda, className, ...p }, ref) => {
    const id = useId();
    return (
      <Envoltura id={id} etiqueta={etiqueta} error={error} ayuda={ayuda}>
        <input
          ref={ref}
          id={id}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? `${id}-error` : ayuda ? `${id}-ayuda` : undefined}
          className={cx(claseCampo(error), className)}
          {...p}
        />
      </Envoltura>
    );
  },
);
Campo.displayName = 'Campo';

export function Selector({ etiqueta, error, ayuda, children, className, ...p }: PropsCampoBase & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId();
  return (
    <Envoltura id={id} etiqueta={etiqueta} error={error} ayuda={ayuda}>
      <select id={id} aria-invalid={Boolean(error) || undefined} className={cx(claseCampo(error), className)} {...p}>
        {children}
      </select>
    </Envoltura>
  );
}

// ---------------- Contenedores y textos ----------------
export function Tarjeta({ className, children, ...p }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLElement>) {
  return (
    <section {...p} className={cx('rounded-tarjeta border border-borde bg-tarjeta shadow-tarjeta', className)}>
      {children}
    </section>
  );
}

export function Encabezado({ titulo, descripcion, acciones }: { titulo: string; descripcion?: string; acciones?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-texto text-balance">{titulo}</h1>
        {descripcion && <p className="mt-1 text-texto-apagado">{descripcion}</p>}
      </div>
      {acciones && <div className="flex flex-wrap gap-2 no-imprimir">{acciones}</div>}
    </header>
  );
}

/** Monto con color semántico + signo (el color nunca es el único indicador). */
export function Monto({ valor, moneda, tipo, className }: { valor: string; moneda: Moneda; tipo?: 'CREDITO' | 'DEBITO'; className?: string }) {
  const texto = tipo === 'DEBITO' ? `−${formatoMoneda(valor, moneda)}` : tipo === 'CREDITO' ? `+${formatoMoneda(valor, moneda)}` : formatoMoneda(valor, moneda);
  return (
    <span className={cx('cifras whitespace-nowrap font-medium', tipo === 'CREDITO' && 'text-exito', tipo === 'DEBITO' && 'text-texto', className)}>
      {texto}
    </span>
  );
}

const ALERTA = {
  info: { clase: 'border-secundario/20 bg-secundario-suave text-secundario', Icono: Info },
  exito: { clase: 'border-exito/20 bg-exito-suave text-exito', Icono: CheckCircle2 },
  aviso: { clase: 'border-aviso/25 bg-aviso-suave text-aviso', Icono: AlertTriangle },
  error: { clase: 'border-peligro/20 bg-peligro-suave text-peligro', Icono: XCircle },
} as const;

export function Alerta({ tipo = 'info', titulo, children }: { tipo?: keyof typeof ALERTA; titulo?: string; children?: ReactNode }) {
  const { clase, Icono } = ALERTA[tipo];
  return (
    <div role={tipo === 'error' ? 'alert' : 'status'} className={cx('flex gap-3 rounded-lg border p-3 text-sm', clase)}>
      <Icono className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div>
        {titulo && <p className="font-semibold">{titulo}</p>}
        {children && <div className="text-texto">{children}</div>}
      </div>
    </div>
  );
}

export function Insignia({ children, tono = 'neutro' }: { children: ReactNode; tono?: 'neutro' | 'exito' | 'acento' | 'peligro' }) {
  const tonos = {
    neutro: 'bg-apagado text-texto-apagado',
    exito: 'bg-exito-suave text-exito',
    acento: 'bg-acento-suave text-acento',
    peligro: 'bg-peligro-suave text-peligro',
  };
  return <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium', tonos[tono])}>{children}</span>;
}

/** Marcador de carga con el mismo tamaño que el contenido final (sin saltos de diseño). */
export function Esqueleto({ className }: { className?: string }) {
  return <div aria-hidden className={cx('animate-pulse rounded-md bg-apagado', className)} />;
}

export function EstadoVacio({ icono: Icono, titulo, descripcion, accion }: { icono: LucideIcon; titulo: string; descripcion?: string; accion?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-apagado">
        <Icono className="size-6 text-texto-apagado" aria-hidden />
      </span>
      <p className="font-medium">{titulo}</p>
      {descripcion && <p className="max-w-sm text-sm text-texto-apagado">{descripcion}</p>}
      {accion && <div className="mt-2">{accion}</div>}
    </div>
  );
}

export function Paginacion({ pagina, paginas, alCambiar }: { pagina: number; paginas: number; alCambiar: (p: number) => void }) {
  if (paginas <= 1) return null;
  return (
    <nav aria-label="Paginación" className="flex items-center justify-between gap-3 border-t border-borde px-4 py-3 text-sm no-imprimir">
      <span className="text-texto-apagado">
        Página <strong className="text-texto">{pagina}</strong> de {paginas}
      </span>
      <div className="flex gap-2">
        <Boton variante="secundario" disabled={pagina <= 1} onClick={() => alCambiar(pagina - 1)}>
          Anterior
        </Boton>
        <Boton variante="secundario" disabled={pagina >= paginas} onClick={() => alCambiar(pagina + 1)}>
          Siguiente
        </Boton>
      </div>
    </nav>
  );
}
