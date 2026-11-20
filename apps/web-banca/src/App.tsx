import { Navigate, Outlet, createBrowserRouter, useLocation } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { Compass } from 'lucide-react';
import { useSesion } from './sesion/ContextoSesion';
import { Marco } from './componentes/Marco';
import { EstadoVacio } from './componentes/ui';
import { Ingresar } from './paginas/Ingresar';

// Carga diferida por ruta (code splitting): cada página se descarga al visitarla.
const pagina = <K extends string>(cargar: () => Promise<Record<K, React.ComponentType>>, nombre: K) => async () => ({ Component: (await cargar())[nombre] });

/** Guarda de ruta: sin sesión, se redirige al inicio de sesión recordando el destino. */
function RutaProtegida() {
  const { estado } = useSesion();
  const ubicacion = useLocation();
  if (estado === 'verificando') {
    return (
      <div className="grid min-h-dvh place-items-center" role="status" aria-live="polite">
        <span className="size-8 animate-spin rounded-full border-2 border-borde border-t-secundario" aria-hidden />
        <span className="sr-only">Verificando su sesión…</span>
      </div>
    );
  }
  if (estado === 'inactiva') return <Navigate to="/ingresar" replace state={{ desde: ubicacion.pathname + ubicacion.search }} />;
  return <Outlet />;
}

const enrutador = createBrowserRouter([
  { path: '/ingresar', element: <Ingresar /> },
  {
    element: <RutaProtegida />,
    children: [
      {
        element: <Marco />,
        children: [
          { index: true, lazy: pagina(() => import('./paginas/Inicio'), 'Inicio') },
          { path: 'cuentas/:id', lazy: pagina(() => import('./paginas/DetalleCuenta'), 'DetalleCuenta') },
          { path: 'cuentas/:id/estado', lazy: pagina(() => import('./paginas/EstadoCuenta'), 'EstadoCuenta') },
          { path: 'transferir', lazy: pagina(() => import('./paginas/Transferir'), 'Transferir') },
          { path: 'transferencias', lazy: pagina(() => import('./paginas/Transferencias'), 'HistorialTransferencias') },
          { path: 'transferencias/:id', lazy: pagina(() => import('./paginas/Transferencias'), 'Comprobante') },
          { path: 'beneficiarios', lazy: pagina(() => import('./paginas/Beneficiarios'), 'Beneficiarios') },
          { path: '*', element: <EstadoVacio icono={Compass} titulo="Página no encontrada" descripcion="La dirección no existe o fue movida." /> },
        ],
      },
    ],
  },
]);

export function App() {
  return <RouterProvider router={enrutador} />;
}
