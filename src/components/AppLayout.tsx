import { NavLink } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, CheckSquare, Bell, Calendar, LogOut } from "lucide-react";

const navItems = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/tasks", label: "Tasks", icon: CheckSquare },
  { to: "/reminders", label: "Reminders", icon: Bell },
  { to: "/meetings", label: "Meetings", icon: Calendar },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { signOut, user } = useAuth();

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="hidden w-64 flex-col border-r border-border bg-sidebar text-sidebar-foreground md:flex">
        <div className="flex h-16 items-center gap-2 border-b border-sidebar-border px-6">
          <div className="h-8 w-8 rounded-lg bg-sidebar-primary flex items-center justify-center">
            <span className="text-sm font-bold text-sidebar-primary-foreground">V</span>
          </div>
          <span className="text-lg font-bold">VantoOS</span>
        </div>
        <nav className="flex-1 space-y-1 p-4">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
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
      </aside>

      {/* Mobile header */}
      <div className="flex flex-1 flex-col">
        <header className="flex h-14 items-center gap-4 border-b border-border bg-card px-4 md:hidden">
          <span className="font-bold">VantoOS</span>
          <nav className="flex flex-1 gap-2 overflow-x-auto">
            {navItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  `flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium ${
                    isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground"
                  }`
                }
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </NavLink>
            ))}
          </nav>
        </header>
        <main className="flex-1 overflow-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
