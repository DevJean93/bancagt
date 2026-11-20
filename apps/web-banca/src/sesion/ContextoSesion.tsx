import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { EVENTO_SESION_EXPIRADA } from '../api/cliente';
import { servicioSesion } from '../api/servicios';
import type { Sesion } from '../api/tipos';

type Estado = 'verificando' | 'activa' | 'inactiva';

interface ValorSesion {
  estado: Estado;
  sesion: Sesion | null;
  motivoCierre: 'expirada' | 'manual' | null;
  iniciar: (usuario: string, contrasena: string) => Promise<Sesion>;
  cerrar: () => Promise<void>;
  renovar: () => Promise<void>;
}

const Contexto = createContext<ValorSesion | null>(null);

/**
 * Proveedor de sesión (patrón Provider/Context). El token NO es accesible
 * desde JavaScript (cookie HttpOnly); aquí solo se guarda el perfil y la
 * hora de expiración para avisar al usuario.
 */
export function ProveedorSesion({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [estado, setEstado] = useState<Estado>('verificando');
  const [sesion, setSesion] = useState<Sesion | null>(null);
  const [motivoCierre, setMotivo] = useState<ValorSesion['motivoCierre']>(null);

  const terminar = useCallback(
    (motivo: 'expirada' | 'manual') => {
      setSesion(null);
      setEstado('inactiva');
      setMotivo(motivo);
      qc.clear(); // no quedan datos financieros en memoria
    },
    [qc],
  );

  useEffect(() => {
    servicioSesion
      .actual()
      .then((s) => {
        setSesion(s);
        setEstado('activa');
      })
      .catch(() => setEstado('inactiva'));
  }, []);

  useEffect(() => {
    const alExpirar = () => terminar('expirada');
    window.addEventListener(EVENTO_SESION_EXPIRADA, alExpirar);
    return () => window.removeEventListener(EVENTO_SESION_EXPIRADA, alExpirar);
  }, [terminar]);

  // Cierre automático exacto al vencer el token (PCI-DSS 8.2.8: inactividad).
  useEffect(() => {
    if (!sesion) return;
    const restante = new Date(sesion.expiraEn).getTime() - Date.now();
    const t = window.setTimeout(() => terminar('expirada'), Math.max(0, restante));
    return () => window.clearTimeout(t);
  }, [sesion, terminar]);

  const valor = useMemo<ValorSesion>(
    () => ({
      estado,
      sesion,
      motivoCierre,
      iniciar: async (usuario, contrasena) => {
        const s = await servicioSesion.iniciar(usuario, contrasena);
        setSesion(s);
        setEstado('activa');
        setMotivo(null);
        return s;
      },
      cerrar: async () => {
        await servicioSesion.cerrar().catch(() => undefined);
        terminar('manual');
      },
      renovar: async () => {
        const s = await servicioSesion.renovar();
        setSesion((previa) => ({ ...previa, ...s }));
      },
    }),
    [estado, sesion, motivoCierre, terminar],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSesion(): ValorSesion {
  const v = useContext(Contexto);
  if (!v) throw new Error('useSesion debe usarse dentro de ProveedorSesion');
  return v;
}

/** Segundos que faltan para que expire la sesión (se actualiza cada segundo). */
export function useSegundosRestantes(expiraEn: string | undefined): number {
  const calcular = () => (expiraEn ? Math.max(0, Math.round((new Date(expiraEn).getTime() - Date.now()) / 1000)) : 0);
  const [s, setS] = useState(calcular);
  useEffect(() => {
    setS(calcular());
    const t = window.setInterval(() => setS(calcular()), 1000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expiraEn]);
  return s;
}
