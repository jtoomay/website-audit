import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './lib/auth';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import ScannerPage from './pages/ScannerPage';
import HistoryPage from './pages/HistoryPage';
import ScanDetailPage from './pages/ScanDetailPage';

function Protected({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  if (loading) return <div className="p-10 text-center text-muted">Loading…</div>;
  if (!session) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  const { session } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={session ? <Navigate to="/app" replace /> : <LoginPage />} />
      <Route path="/app" element={<Protected><ScannerPage /></Protected>} />
      <Route path="/app/history" element={<Protected><HistoryPage /></Protected>} />
      <Route path="/app/scan/:id" element={<Protected><ScanDetailPage /></Protected>} />
      <Route path="*" element={<Navigate to={session ? '/app' : '/login'} replace />} />
    </Routes>
  );
}
