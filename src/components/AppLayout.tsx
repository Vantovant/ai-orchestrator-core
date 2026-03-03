import { NavLink, useLocation } from "react-router-dom";
import PageGuide from "@/components/guide/PageGuide";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, ClipboardList, Mail,
  DollarSign, Plane, ShoppingCart, Settings, LogOut, Menu, FolderKanban, Brain, FileText, BookOpen, Users
} from "lucide-react";
import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/plan", label: "Plan", icon: ClipboardList },
  { to: "/email", label: "Email", icon: Mail },
  { to: "/finance", label: "Finance", icon: DollarSign },
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/dashboard/partner", label: "Partner", icon: Brain },
  { to: "/knowledge", label: "Knowledge", icon: BookOpen },
  { to: "/investor-report", label: "Reports", icon: FileText },
  { to: "/travel", label: "Travel", icon: Plane },
  { to: "/shopping", label: "Shopping", icon: ShoppingCart },
  { to: "/testers", label: "Testers", icon: Users },
  { to: "/settings", label: "Settings", icon: Settings },
];

const mobileNavItems = [
  { to: "/", label: "Home", icon: LayoutDashboard },
  { to: "/plan", label: "Plan", icon: ClipboardList },
  { to: "/email", label: "Email", icon: Mail },
  { to: "/finance", label: "Finance", icon: DollarSign },
  { to: "/settings", label: "More", icon: Settings },
];

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { signOut, user } = useAuth();

  return (
    <>
      <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-6">
        <div className="h-8 w-8 rounded-lg bg-sidebar-primary flex items-center justify-center">
          <span className="text-sm font-bold text-sidebar-primary-foreground">V</span>
        </div>
        <span className="text-lg font-bold">VantoOS</span>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-4">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            onClick={onNavigate}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              }`
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-sidebar-border p-4">
        <div className="mb-2 truncate text-xs text-sidebar-foreground/50">{user?.email}</div>
        <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-sidebar-foreground/70" onClick={signOut}>
          <LogOut className="h-4 w-4" />
          Sign Out
        </Button>
      </div>
    </>
  );
}

function MobileBottomNav() {
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card md:hidden">
      <div className="flex items-center justify-around">
        {mobileNavItems.map(({ to, label, icon: Icon }) => {
          const isActive = to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);
          return (
            <NavLink
              key={to}
              to={to}
              className="flex flex-col items-center gap-0.5 py-2 px-3 min-w-0"
            >
              <Icon className={`h-5 w-5 ${isActive ? "text-primary" : "text-muted-foreground"}`} />
              <span className={`text-[10px] font-medium ${isActive ? "text-primary" : "text-muted-foreground"}`}>{label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 flex-col border-r border-border bg-sidebar text-sidebar-foreground md:flex">
        <SidebarNav />
      </aside>

      {/* Mobile */}
      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center gap-4 border-b border-border bg-card px-4 md:hidden">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon"><Menu className="h-5 w-5" /></Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 bg-sidebar p-0 text-sidebar-foreground">
              <SidebarNav onNavigate={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>
          <span className="font-bold">VantoOS</span>
        </header>
        <main className="flex-1 overflow-auto p-4 pb-20 md:p-6 md:pb-6">{children}</main>
        <PageGuide />
        <MobileBottomNav />
      </div>
    </div>
  );
}
