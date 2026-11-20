// Servicios por dominio + hooks de React Query (estado de servidor con caché).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './cliente';
import type {
  Beneficiario,
  Comprobante,
  ConsultaTitular,
  Cuenta,
  Destino,
  EstadoCuenta,
  Limite,
  Movimiento,
  Pagina,
  Posicion,
  PuntoFlujo,
  Sesion,
} from './tipos';

// ---------------- Identidad ----------------
export const servicioSesion = {
  iniciar: (usuario: string, contrasena: string) =>
    api<Sesion>('/api/v1/auth/sesion', { metodo: 'POST', cuerpo: { usuario, contrasena }, silencioso: true }),
  actual: () => api<Sesion>('/api/v1/auth/sesion', { silencioso: true }),
  renovar: () => api<Sesion>('/api/v1/auth/sesion/renovar', { metodo: 'POST' }),
  cerrar: () => api<void>('/api/v1/auth/sesion', { metodo: 'DELETE', silencioso: true }),
};

// ---------------- Cuentas ----------------
export interface FiltrosMovimientos {
  desde?: string;
  hasta?: string;
  tipo?: string;
  categoria?: string;
  texto?: string;
  pagina: number;
  tamano: number;
}

const consulta = (f: object) =>
  new URLSearchParams(
    Object.entries(f)
      .filter(([, v]) => v !== undefined && v !== '')
      .map(([k, v]) => [k, String(v)]),
  ).toString();

export const claves = {
  posicion: ['posicion'] as const,
  cuenta: (id: string) => ['cuenta', id] as const,
  movimientos: (id: string, f: FiltrosMovimientos) => ['movimientos', id, f] as const,
  flujo: (id: string, dias: number) => ['flujo', id, dias] as const,
  estado: (id: string, periodo: string) => ['estado-cuenta', id, periodo] as const,
  transferencias: (pagina: number) => ['transferencias', pagina] as const,
  comprobante: (id: string) => ['comprobante', id] as const,
  beneficiarios: ['beneficiarios'] as const,
  limites: ['limites'] as const,
};

export const usePosicion = () => useQuery({ queryKey: claves.posicion, queryFn: () => api<Posicion>('/api/v1/cuentas') });

export const useCuenta = (id: string) =>
  useQuery({ queryKey: claves.cuenta(id), queryFn: () => api<Cuenta>(`/api/v1/cuentas/${id}`) });

export const useMovimientos = (id: string, f: FiltrosMovimientos) =>
  useQuery({
    queryKey: claves.movimientos(id, f),
    queryFn: () => api<Pagina<Movimiento>>(`/api/v1/cuentas/${id}/movimientos?${consulta(f)}`),
    placeholderData: (previo) => previo, // la tabla no "salta" al paginar
  });

export const useFlujo = (id: string | undefined, dias = 30) =>
  useQuery({
    queryKey: claves.flujo(id ?? '', dias),
    queryFn: () => api<PuntoFlujo[]>(`/api/v1/cuentas/${id}/flujo?dias=${dias}`),
    enabled: Boolean(id),
  });

export const useEstadoCuenta = (id: string, periodo: string) =>
  useQuery({
    queryKey: claves.estado(id, periodo),
    queryFn: () => api<EstadoCuenta>(`/api/v1/cuentas/${id}/estado-cuenta?periodo=${periodo}`),
  });

// ---------------- Transferencias ----------------
export const useTransferencias = (pagina: number) =>
  useQuery({
    queryKey: claves.transferencias(pagina),
    queryFn: () => api<Pagina<Comprobante>>(`/api/v1/transferencias?pagina=${pagina}&tamano=10`),
    placeholderData: (previo) => previo,
  });

export const useComprobante = (id: string) =>
  useQuery({ queryKey: claves.comprobante(id), queryFn: () => api<Comprobante>(`/api/v1/transferencias/${id}`) });

export const useLimites = () => useQuery({ queryKey: claves.limites, queryFn: () => api<Limite[]>('/api/v1/transferencias/limites') });

export interface SolicitudTransferencia {
  cuentaOrigenId: string;
  destino: Destino;
  monto: string;
  concepto: string;
  claveIdempotencia: string;
}

export function useTransferir() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ claveIdempotencia, ...cuerpo }: SolicitudTransferencia) =>
      api<Comprobante>('/api/v1/transferencias', {
        metodo: 'POST',
        cuerpo,
        encabezados: { 'Idempotency-Key': claveIdempotencia },
      }),
    // Saldos, movimientos y límites cambian: se invalida la caché.
    onSuccess: () => qc.invalidateQueries(),
  });
}

// ---------------- Beneficiarios ----------------
export const useBeneficiarios = () =>
  useQuery({ queryKey: claves.beneficiarios, queryFn: () => api<Beneficiario[]>('/api/v1/beneficiarios') });

export const consultarTitular = (numero: string) =>
  api<ConsultaTitular>(`/api/v1/beneficiarios/consulta?numero=${encodeURIComponent(numero)}`);

export function useAgregarBeneficiario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: { numero: string; alias: string }) => api<Beneficiario>('/api/v1/beneficiarios', { metodo: 'POST', cuerpo: d }),
    onSuccess: () => qc.invalidateQueries({ queryKey: claves.beneficiarios }),
  });
}

export function useEliminarBeneficiario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/api/v1/beneficiarios/${id}`, { metodo: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: claves.beneficiarios }),
  });
}
