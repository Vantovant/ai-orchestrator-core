import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useActivityTracker } from "@/hooks/useActivityTracker";
import AuthPage from "@/pages/AuthPage";
import AppLayout from "@/components/AppLayout";
import MarketingLayout from "@/components/marketing/MarketingLayout";

// App pages
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
import VoiceDiaryPage from "@/pages/VoiceDiaryPage";
import VantoOSConsolePage from "@/pages/admin/VantoOSConsolePage";
import Step5DConsolePage from "@/pages/admin/Step5DConsolePage";

// Marketing pages
import HomePage from "@/pages/marketing/HomePage";
import CommandCenterPage from "@/pages/marketing/CommandCenterPage";
import FeaturesPage from "@/pages/marketing/FeaturesPage";
import HowItWorksPage from "@/pages/marketing/HowItWorksPage";
import SuitePage from "@/pages/marketing/SuitePage";
import CompanyPage from "@/pages/marketing/CompanyPage";
import ClientelePage from "@/pages/marketing/ClientelePage";
import InvestorsPage from "@/pages/marketing/InvestorsPage";
import PricingPage from "@/pages/marketing/PricingPage";
import ContactPage from "@/pages/marketing/ContactPage";
import PrivacyPage from "@/pages/marketing/PrivacyPage";
import TermsPage from "@/pages/marketing/TermsPage";

const queryClient = new QueryClient();

// Authenticated app shell — wraps Outlet so child routes render inside AppLayout
function AppShell() {
  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  );
}

// Guards
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/signin" replace />;
  return <>{children}</>;
}

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
    </div>
  );
}

function SignInRoute() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (user) return <Navigate to="/" replace />;
  return <AuthPage />;
}

// Renders marketing home for guests; app dashboard for authenticated users
function RootRoute() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (user) {
    return (
      <AppLayout>
        <DashboardPage />
      </AppLayout>
    );
  }
  return (
    <MarketingLayout>
      <HomePage />
    </MarketingLayout>
  );
}

// MarketingLayout uses <Outlet/>; wrap children prop usage by adapting it for RootRoute above
// (RootRoute renders MarketingLayout as a parent route via children injection; we route via Outlet elsewhere)
function MarketingShell() {
  return (
    <MarketingLayoutWithOutlet />
  );
}
function MarketingLayoutWithOutlet() {
  return <MarketingLayout />;
}

function AppRoutes() {
  useActivityTracker();

  return (
    <Routes>
      {/* Root — guest gets marketing home, user gets dashboard */}
      <Route path="/" element={<RootRoute />} />

      {/* Public marketing site */}
      <Route element={<MarketingShell />}>
        <Route path="/command-center" element={<CommandCenterPage />} />
        <Route path="/features" element={<FeaturesPage />} />
        <Route path="/how-it-works" element={<HowItWorksPage />} />
        <Route path="/suite" element={<SuitePage />} />
        <Route path="/company" element={<CompanyPage />} />
        <Route path="/clientele" element={<ClientelePage />} />
        <Route path="/investors" element={<InvestorsPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
      </Route>

      {/* Auth entry */}
      <Route path="/signin" element={<SignInRoute />} />
      <Route path="/auth" element={<Navigate to="/signin" replace />} />
      <Route path="/login" element={<Navigate to="/signin" replace />} />

      {/* Authenticated app — keeps original absolute paths so AppLayout & navigate() calls remain unchanged */}
      <Route element={<RequireAuth><AppShell /></RequireAuth>}>
        <Route path="/plan" element={<PlanPage />} />
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
        <Route path="/admin/vanto-os" element={<VantoOSConsolePage />} />
        <Route path="/admin/step5d" element={<Step5DConsolePage />} />
        <Route path="/dashboard/partner" element={<PortfolioPartnerPage />} />
        <Route path="/knowledge" element={<KnowledgeBasePage />} />
        <Route path="/investor-report" element={<InvestorReportPage />} />
        <Route path="/testers" element={<TeamPage />} />
        <Route path="/manual" element={<UserManualPage />} />
        <Route path="/onboarding-emails" element={<OnboardingEmailsPage />} />
        <Route path="/voice-diary" element={<VoiceDiaryPage />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
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
