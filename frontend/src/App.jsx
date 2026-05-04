import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from './store/authStore';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import AdminPage from './pages/AdminPage';
import PositionPage from './pages/PositionPage';
import TicketBoardPage from './pages/TicketBoardPage';
import RoleGuard from './components/RoleGuard';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

function ProtectedRoute({ children }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return isAuthenticated ? children : <Navigate to="/login" replace />;
}

export default function App() {
  const hydrate   = useAuthStore((s) => s.hydrate);
  const refreshMe = useAuthStore((s) => s.refreshMe);
  const isAuth    = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => { hydrate(); }, []);
  useEffect(() => { if (isAuth) refreshMe(); }, [isAuth]);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: '#1e1e2e',
              color: '#cdd6f4',
              border: '1px solid rgba(255,255,255,0.1)',
            },
          }}
        />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <RoleGuard>
                  <AdminPage />
                </RoleGuard>
              </ProtectedRoute>
            }
          />
          <Route
            path="/positions/:positionId"
            element={
              <ProtectedRoute>
                <PositionPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/tickets/:ticketId/board"
            element={
              <ProtectedRoute>
                <TicketBoardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
