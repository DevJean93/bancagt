import {
  ArrowLeftRight,
  Banknote,
  Briefcase,
  Clapperboard,
  Fuel,
  GraduationCap,
  HeartPulse,
  Landmark,
  Percent,
  Receipt,
  ShoppingBag,
  ShoppingCart,
  Utensils,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { Categoria } from '../api/tipos';
import { NOMBRE_CATEGORIA } from '../utilidades/formato';

// Iconos SVG (Lucide), nunca emojis. Cada categoría tiene icono + texto.
const ICONOS: Record<Categoria, LucideIcon> = {
  SALARIO: Briefcase,
  TRANSFERENCIA: ArrowLeftRight,
  SERVICIOS: Receipt,
  SUPERMERCADO: ShoppingCart,
  RESTAURANTE: Utensils,
  COMBUSTIBLE: Fuel,
  CAJERO: Banknote,
  SALUD: HeartPulse,
  EDUCACION: GraduationCap,
  ENTRETENIMIENTO: Clapperboard,
  COMPRAS: ShoppingBag,
  INTERESES: Percent,
  COMISIONES: Landmark,
  OTROS: Wallet,
};

export function IconoCategoria({ categoria, credito }: { categoria: Categoria; credito?: boolean }) {
  const Icono = ICONOS[categoria];
  return (
    <span
      title={NOMBRE_CATEGORIA[categoria]}
      className={`grid size-10 shrink-0 place-items-center rounded-full ${credito ? 'bg-exito-suave text-exito' : 'bg-apagado text-texto-apagado'}`}
    >
      <Icono className="size-[18px]" aria-hidden />
    </span>
  );
}
