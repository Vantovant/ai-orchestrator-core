import { NavLink, Link, Outlet } from "react-router-dom";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Menu, X, ArrowRight } from "lucide-react";
import vantoosLogo from "@/assets/vantoos-logo.png";
import { useAuth } from "@/hooks/useAuth";

const navItems = [
  { to: "/command-center", label: "Command Center" },
  { to: "/features", label: "Features" },
  { to: "/how-it-works", label: "How it Works" },
  { to: "/suite", label: "The Suite" },
  { to: "/company", label: "Company" },
  { to: "/investors", label: "Investors" },
  { to: "/pricing", label: "Pricing" },
];

export default function MarketingLayout({ children }: { children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const appHref = user ? "/app" : "/signin";
  const ctaLabel = user ? "Open the App" : "Open the App";

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <Link to="/" className="flex items-center gap-2">
            <img src={vantoosLogo} alt="VantoOS" className="h-9 w-auto" />
            <div className="hidden sm:block leading-tight">
              <div className="text-base font-bold tracking-tight">VantoOS</div>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                The Executive Operating System
              </div>
            </div>
          </Link>

          <nav className="hidden lg:flex items-center gap-1">
            {navItems.map((i) => (
              <NavLink
                key={i.to}
                to={i.to}
                className={({ isActive }) =>
                  `rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-accent/15 text-accent"
                      : "text-foreground/70 hover:text-foreground hover:bg-muted"
                  }`
                }
              >
                {i.label}
              </NavLink>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-2">
            <Link to="/signin">
              <Button variant="ghost" size="sm">Sign in</Button>
            </Link>
            <Link to="/signin">
              <Button size="sm" className="gap-1.5">
                Open the App <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>

          <button
            className="lg:hidden p-2 -mr-2"
            onClick={() => setOpen(!open)}
            aria-label="Toggle menu"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {open && (
          <div className="lg:hidden border-t border-border bg-background">
            <nav className="px-4 py-3 space-y-1">
              {navItems.map((i) => (
                <NavLink
                  key={i.to}
                  to={i.to}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    `block rounded-md px-3 py-2.5 text-sm font-medium ${
                      isActive ? "bg-accent/15 text-accent" : "text-foreground/80 hover:bg-muted"
                    }`
                  }
                >
                  {i.label}
                </NavLink>
              ))}
              <div className="pt-2 mt-2 border-t border-border flex gap-2">
                <Link to="/signin" className="flex-1" onClick={() => setOpen(false)}>
                  <Button variant="outline" size="sm" className="w-full">Sign in</Button>
                </Link>
                <Link to="/signin" className="flex-1" onClick={() => setOpen(false)}>
                  <Button size="sm" className="w-full">Open App</Button>
                </Link>
              </div>
            </nav>
          </div>
        )}
      </header>

      <main className="flex-1">
        {children ?? <Outlet />}
      </main>

      <footer className="border-t border-border bg-sidebar text-sidebar-foreground">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 grid gap-8 md:grid-cols-4">
          <div className="md:col-span-1">
            <img src={vantoosLogo} alt="VantoOS" className="h-10 w-auto mb-3" />
            <p className="text-sm opacity-70 leading-relaxed">
              The executive operating system. Built in Africa for the people who run companies — and the companies they run.
            </p>
          </div>

          <div>
            <h4 className="text-xs uppercase tracking-widest opacity-50 mb-3">Product</h4>
            <ul className="space-y-2 text-sm">
              <li><Link to="/command-center" className="hover:text-accent opacity-80">Command Center</Link></li>
              <li><Link to="/features" className="hover:text-accent opacity-80">All Features</Link></li>
              <li><Link to="/how-it-works" className="hover:text-accent opacity-80">How it Works</Link></li>
              <li><Link to="/pricing" className="hover:text-accent opacity-80">Pricing</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs uppercase tracking-widest opacity-50 mb-3">Company</h4>
            <ul className="space-y-2 text-sm">
              <li><Link to="/company" className="hover:text-accent opacity-80">About VantoOS</Link></li>
              <li><Link to="/clientele" className="hover:text-accent opacity-80">Who We Serve</Link></li>
              <li><Link to="/suite" className="hover:text-accent opacity-80">The Suite</Link></li>
              <li><Link to="/investors" className="hover:text-accent opacity-80">Investors</Link></li>
              <li><Link to="/contact" className="hover:text-accent opacity-80">Contact</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs uppercase tracking-widest opacity-50 mb-3">Legal</h4>
            <ul className="space-y-2 text-sm">
              <li><Link to="/privacy" className="hover:text-accent opacity-80">Privacy</Link></li>
              <li><Link to="/terms" className="hover:text-accent opacity-80">Terms</Link></li>
              <li><Link to="/signin" className="hover:text-accent opacity-80">Sign in</Link></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-sidebar-accent">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs opacity-60">
            <div>© {new Date().getFullYear()} VantoOS. All rights reserved.</div>
            <div>Built in Africa · Designed for executives worldwide</div>
          </div>
        </div>
      </footer>
    </div>
  );
}
