// Authenticated app shell — sidebar navigation + content area.
// New tools/pages get added to the `navItems` list as they're built.

import { NavLink, Outlet } from 'react-router-dom';
import { Gem, LayoutDashboard, Banknote, PackageSearch, PackageX, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';

const navItems = [
  { to: '/', label: 'Store Performance', end: true, icon: LayoutDashboard },
  { to: '/debt-reduction', label: 'Showcase Debt Reduction', icon: Banknote },
  { to: '/pandora-ordering', label: 'Pandora Ordering', icon: PackageSearch },
  { to: '/pandora-discontinued', label: 'Pandora Discontinued', icon: PackageX },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const initials = (user?.username || '?').slice(0, 2).toUpperCase();

  return (
    <div className="flex min-h-screen bg-muted/30">
      <aside className="flex w-64 shrink-0 flex-col border-r bg-card">
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Gem className="size-5" />
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight">Burrows</p>
            <p className="text-xs text-muted-foreground leading-tight">Dashboard</p>
          </div>
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

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-6 py-8 md:px-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
