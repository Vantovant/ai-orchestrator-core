import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import AuthPage from "@/pages/AuthPage";
import AppLayout from "@/components/AppLayout";
import DashboardPage from "@/pages/DashboardPage";
import PlanPage from "@/pages/PlanPage";
import EmailPage from "@/pages/EmailPage";
import FinancePage from "@/pages/FinancePage";
import TravelPage from "@/pages/TravelPage";
import ShoppingPage from "@/pages/ShoppingPage";
import SettingsPage from "@/pages/SettingsPage";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!user) return <AuthPage />;

  return (
    <AppLayout>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/plan" element={<PlanPage />} />
        {/* Legacy redirects */}
        <Route path="/tasks" element={<Navigate to="/plan?tab=tasks" replace />} />
        <Route path="/reminders" element={<Navigate to="/plan?tab=reminders" replace />} />
        <Route path="/meetings" element={<Navigate to="/plan?tab=meetings" replace />} />
        <Route path="/calendar" element={<Navigate to="/plan?tab=calendar" replace />} />
        <Route path="/email" element={<EmailPage />} />
        <Route path="/finance" element={<FinancePage />} />
        <Route path="/travel" element={<TravelPage />} />
        <Route path="/shopping" element={<ShoppingPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AppLayout>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
