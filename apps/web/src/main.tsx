import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Outlet, RouterProvider, ScrollRestoration } from 'react-router';
import { AppShell } from './components/AppShell';
import { ToastProvider } from './components/Toast';
import { ApiError } from './lib/api';
import { RequireMerchant } from './lib/session';
import { Login, Register } from './pages/Auth';
import { CustomerPage } from './pages/CustomerPage';
import { Customers } from './pages/Customers';
import { Home } from './pages/Home';
import { Landing } from './pages/Landing';
import { NewCustomer } from './pages/NewCustomer';
import { NotFound, PaymentReturn, PaymentSimulation, PublicStatement } from './pages/Public';
import { Settings } from './pages/Settings';
import './styles.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchOnWindowFocus: true,
      // Pas de nouvel essai sur une erreur « normale » (404, 401...) : seulement sur le réseau.
      retry: (count, err) => (!(err instanceof ApiError) || err.status === 0 || err.status >= 500) && count < 2,
    },
  },
});

function Root() {
  return (
    <>
      <ScrollRestoration />
      <Outlet />
    </>
  );
}

const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      { path: '/', element: <Landing /> },
      { path: '/connexion', element: <Login /> },
      { path: '/inscription', element: <Register /> },
      { path: '/c/:token', element: <PublicStatement /> },
      { path: '/paiement/simulation/:id', element: <PaymentSimulation /> },
      { path: '/paiement/:id', element: <PaymentReturn /> },
      {
        path: '/app',
        element: <RequireMerchant>{(merchant) => <AppShell merchant={merchant} />}</RequireMerchant>,
        children: [
          { index: true, element: <Home /> },
          { path: 'clients', element: <Customers /> },
          { path: 'clients/nouveau', element: <NewCustomer /> },
          { path: 'clients/:id', element: <CustomerPage /> },
          { path: 'reglages', element: <Settings /> },
        ],
      },
      { path: '*', element: <NotFound /> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
