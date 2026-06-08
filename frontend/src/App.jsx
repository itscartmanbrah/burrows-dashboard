import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import StorePerformance from './pages/StorePerformance';
import PandoraFunctions from './pages/PandoraFunctions';
import Placeholder from './pages/Placeholder';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<StorePerformance />} />
          <Route path="debt-reduction" element={<Placeholder title="Showcase Debt Reduction" />} />
          <Route path="pandora-functions" element={<PandoraFunctions />} />
        </Route>
        <Route path="*" element={<Placeholder title="Page not found" />} />
      </Routes>
    </AuthProvider>
  );
}
