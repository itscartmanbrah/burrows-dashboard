// Authenticated app shell — sidebar navigation + content area.
// On large screens (lg+) the sidebar is always visible.
// On smaller screens it slides in as a drawer, toggled by the top-bar
// hamburger button, with a dimmed overlay to close it.

import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Gem, LayoutDashboard, Banknote, PackageSearch, LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';

const navItems = [
  { to: '/', label: 'Store Performance', end: true, icon: LayoutDashboard },
  { to: '/debt-reduction', label: 'Showcase Debt Reduction', icon: Banknote },
  { to: '/pandora-functions', label: 'Pandora Functions', icon: PackageSearch },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const initials = (user?.username || '?').slice(0, 2).toUpperCase();

  return (
    <div className="flex min-h-screen overflow-hidden bg-muted/30">

      {/* ── Mobile overlay — dims the page behind the open drawer ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ──────────────────────────────────────────────────
          • Mobile  : fixed drawer, slides in from left (z-30 sits above overlay)
          • Desktop : static column, always visible                   */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 flex w-64 shrink-0 flex-col border-r bg-card',
          'transition-transform duration-200 ease-in-out',
          'lg:static lg:z-auto lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Gem className="size-5" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold leading-tight">Burrows</p>
            <p className="text-xs text-muted-foreground leading-tight">Dashboard</p>
          </div>
          {/* Close button — mobile only */}
          <button
            className="rounded-md p-1 text-muted-foreground hover:bg-accent lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
          >
            <X className="size-5" />
          </button>
        </div>

        <Separator />

        <nav className="flex flex-col gap-1 p-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  )
                }
              >
                <Icon className="size-4 shrink-0" />
                {item.label}
              </NavLink>
            );
          })}
        </nav>

        <div className="mt-auto p-3">
          <Separator className="mb-3" />
          <div className="flex items-center gap-2.5 rounded-md px-2 py-1.5">
            <Avatar className="size-8">
              <AvatarFallback className="bg-primary/10 text-xs text-primary">{initials}</AvatarFallback>
            </Avatar>
            <span className="flex-1 truncate text-sm font-medium">{user?.username}</span>
            <Button variant="ghost" size="icon" className="size-8" onClick={logout} title="Log out">
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* ── Main area ─────────────────────────────────────────────── */}
      <main className="flex min-h-screen min-w-0 flex-1 flex-col overflow-y-auto">

        {/* Mobile top bar — hidden on lg+ (sidebar is always visible there) */}
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b bg-card px-4 py-3 lg:hidden">
          <button
            className="rounded-md p-1 text-muted-foreground hover:bg-accent"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="size-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Gem className="size-4" />
            </div>
            <span className="text-sm font-semibold">Burrows Dashboard</span>
          </div>
        </header>

        <div className="mx-auto w-full max-w-6xl px-3 py-4 sm:px-6 sm:py-6 md:px-10 lg:py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
