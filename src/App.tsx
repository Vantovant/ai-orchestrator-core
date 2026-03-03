import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useActivityTracker } from "@/hooks/useActivityTracker";
import AuthPage from "@/pages/AuthPage";
import AppLayout from "@/components/AppLayout";
import DashboardPage from "@/pages/DashboardPage";
import PlanPage from "@/pages/PlanPage";
import EmailPage from "@/pages/EmailPage";
import FinancePage from "@/pages/FinancePage";
import TravelPage from "@/pages/TravelPage";
import ShoppingPage from "@/pages/ShoppingPage";
import ProjectsPage from "@/pages/ProjectsPage";
import SettingsPage from "@/pages/SettingsPage";
import NotFound from "@/pages/NotFound";
import WeeklyReportPage from "@/pages/WeeklyReportPage";
import AdminHealthPage from "@/pages/AdminHealthPage";
import PortfolioPartnerPage from "@/pages/PortfolioPartnerPage";
import InvestorReportPage from "@/pages/InvestorReportPage";
import KnowledgeBasePage from "@/pages/KnowledgeBasePage";
import TeamPage from "@/pages/TeamPage";
import UserManualPage from "@/pages/UserManualPage";
import OnboardingEmailsPage from "@/pages/OnboardingEmailsPage";

const queryClient = new QueryClient();

function AppRoutes() {
  const { user, loading } = useAuth();
  useActivityTracker();

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
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/travel" element={<TravelPage />} />
        <Route path="/shopping" element={<ShoppingPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/weekly-report" element={<WeeklyReportPage />} />
        <Route path="/admin/health" element={<AdminHealthPage />} />
        <Route path="/dashboard/partner" element={<PortfolioPartnerPage />} />
        <Route path="/knowledge" element={<KnowledgeBasePage />} />
        <Route path="/investor-report" element={<InvestorReportPage />} />
        <Route path="/testers" element={<TeamPage />} />
        <Route path="/manual" element={<UserManualPage />} />
        <Route path="/onboarding-emails" element={<OnboardingEmailsPage />} />
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
