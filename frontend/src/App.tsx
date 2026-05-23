import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
} from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { useAuthStore } from "./stores/authStore";
import { authAPI, setAuthNavigationHandler } from "./services/api";
import LoginPage from "./pages/auth/LoginPage";
import RegisterPage from "./pages/auth/RegisterPage";
import DashboardLayout from "./components/layout/DashboardLayout";
import DashboardPage from "./pages/dashboard/DashboardPage";
import JobDetailPage from "./pages/dashboard/JobDetailPage";
import HomePage from "./pages/HomePage";
import ToastContainer from "./components/ui/ToastContainer";
import ConfirmDialog from "./components/ui/ConfirmDialog";
import "./toast-animation.css";
import { Analytics } from "@vercel/analytics/react";


const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  if (!isAuthenticated) return <Navigate to="/login" />;
  return <>{children}</>;
}

function AuthNavigationBridge() {
  const navigate = useNavigate();

  useEffect(() => {
    setAuthNavigationHandler(() => navigate("/login"));
  }, [navigate]);

  return null;
}

function App() {
  const { initialize, login, logout } = useAuthStore();

  useEffect(() => {
    initialize();
    authAPI
      .refresh()
      .then((response) => {
        if (response.data?.user) {
          login(response.data.user);
        }
      })
      .catch(() => {
        logout();
      });
  }, [initialize, login, logout]);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthNavigationBridge />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="jobs/:jobId" element={<JobDetailPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
        <ToastContainer />
        <ConfirmDialog />
        <Analytics />
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
