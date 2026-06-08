// Authenticated app shell — sidebar navigation + content area.
// New tools/pages get added to the `navItems` list as they're built.

import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Layout.css';

const navItems = [
  { to: '/', label: 'Store Performance', end: true },
  { to: '/debt-reduction', label: 'Showcase Debt Reduction' },
  { to: '/pandora-ordering', label: 'Pandora Ordering' },
  { to: '/pandora-discontinued', label: 'Pandora Discontinued' },
];

export default function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1>Burrows Dashboard</h1>
        </div>
        <nav>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="user-label">{user?.username}</span>
          <button onClick={logout} className="logout-btn">Log out</button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
