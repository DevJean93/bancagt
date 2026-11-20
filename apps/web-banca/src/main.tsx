import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorApi } from './api/cliente';
import { ProveedorSesion } from './sesion/ContextoSesion';
import { App } from './App';
import './estilos.css';

const clienteConsultas = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // No se reintentan errores de negocio/autorización (4xx), solo fallas transitorias.
      retry: (intentos, error) => !(error instanceof ErrorApi && error.status < 500) && intentos < 2,
      refetchOnWindowFocus: true,
    },
    mutations: { retry: false },
  },
});

createRoot(document.getElementById('raiz')!).render(
  <StrictMode>
    <QueryClientProvider client={clienteConsultas}>
      <ProveedorSesion>
        <App />
      </ProveedorSesion>
    </QueryClientProvider>
  </StrictMode>,
);
