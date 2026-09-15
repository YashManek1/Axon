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
import OverviewPage from "./pages/dashboard/OverviewPage";
import AgentsPage from "./pages/dashboard/AgentsPage";
import JobsPage from "./pages/dashboard/JobsPage";
import JobDetailPage from "./pages/dashboard/JobDetailPage";
import AuditPage from "./pages/dashboard/AuditPage";
import LivePage from "./pages/dashboard/LivePage";
import RunbooksPage from "./pages/dashboard/RunbooksPage";
import SettingsPage from "./pages/dashboard/SettingsPage";
import AdminAnalyticsPage from "./pages/dashboard/AdminAnalyticsPage";
import HomePage from "./pages/HomePage";
import ToastContainer from "./components/ui/ToastContainer";
import ConfirmDialog from "./components/ui/ConfirmDialog";
import "./toast-animation.css";
import { Analytics } from "@vercel/analytics/react";


const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isBootstrapping } = useAuthStore();
  // The session lives in an httpOnly cookie, so after a reload the store is
  // empty until /user/refresh answers. Redirecting during that window is what
  // logged users out on every refresh and broke deep links.
  if (isBootstrapping) {
    return (
      <div
        className="min-h-screen flex items-center justify-center bg-bg text-ink-2 text-sm"
        role="status"
        aria-live="polite"
      >
        Restoring your session…
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}


function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  if (user?.role !== "admin") return <Navigate to="/dashboard/overview" />;
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
  const { finishBootstrap, login, logout } = useAuthStore();

  useEffect(() => {
    authAPI
      .refresh()
      .then((response) => {
        if (response.data?.user) {
          login(response.data.user);
        } else {
          // A 2xx without a user still means "not signed in"; without this the
          // bootstrap flag would never clear and the app would hang on the
          // loading state forever.
          finishBootstrap();
        }
      })
      .catch(() => {
        logout();
      });
  }, [finishBootstrap, login, logout]);

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
            <Route index element={<Navigate to="/dashboard/overview" />} />
            <Route path="overview" element={<OverviewPage />} />
            <Route path="agents" element={<AgentsPage />} />
            <Route path="jobs" element={<JobsPage />} />
            <Route path="jobs/:jobId" element={<JobDetailPage />} />
            <Route path="audit" element={<AuditPage />} />
            <Route path="live" element={<LivePage />} />
            <Route path="runbooks" element={<RunbooksPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="admin" element={<AdminRoute><AdminAnalyticsPage /></AdminRoute>} />
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
