import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { closeSocket, useConnected } from '../socket.js';

// Each link shows only if the user has one of its permissions
const NAV = [
  { section: 'Workshop' },
  { to: '/', label: 'Job board', icon: '▦', end: true, perms: ['jobs.view'] },
  { to: '/jobs', label: 'Job cards', icon: '≡', end: true, perms: ['jobs.view'] },
  { to: '/jobs/new', label: 'New job card', icon: '+', perms: ['jobs.create'] },
  { to: '/cashier', label: 'Cashier', icon: '💵', perms: ['payments.record'] },
  { to: '/customers', label: 'Customers', icon: '☺', perms: ['customers.view'] },
  { to: '/invoices', label: 'Invoices', icon: '₨', perms: ['invoices.view'] },
  { to: '/reminders', label: 'Reminders & messages', icon: '✉', perms: ['messages.view'] },
  { section: 'Stock & purchasing' },
  { to: '/parts', label: 'Parts & stock', icon: '⚙', perms: ['parts.view'] },
  { to: '/purchase-orders', label: 'Purchase orders', icon: '⇩', perms: ['purchasing.view'] },
  { to: '/grns', label: 'Goods received (GRN)', icon: '✓', perms: ['purchasing.view', 'grn.manage'] },
  { to: '/suppliers', label: 'Suppliers', icon: '⌂', perms: ['purchasing.view'] },
  { section: 'Money' },
  { to: '/expenses', label: 'Expenses', icon: '−', perms: ['expenses.view'] },
  { to: '/reports/free-services', label: 'Free service claims', icon: '★', perms: ['invoices.view', 'dashboard.finance'] },
  { section: 'People' },
  { to: '/employees', label: 'Employees', icon: '◉', perms: ['employees.view'] },
  { to: '/attendance', label: 'Attendance', icon: '◷', perms: ['attendance.manage'] },
  { to: '/advances', label: 'Salary advances', icon: '↗', perms: ['advances.manage'] },
  { to: '/payroll', label: 'Payroll', icon: '¶', perms: ['payroll.view'] },
  { section: 'Admin' },
  { to: '/masters', label: 'Lists & service types', icon: '☰', perms: ['masters.manage'] },
  { to: '/users', label: 'Staff logins & roles', icon: '⚿', perms: ['users.manage'] },
  { to: '/settings', label: 'Settings', icon: '⚑', perms: ['settings.manage'] },
];

export default function Layout() {
  const { user, logout, can } = useAuth();
  const nav = useNavigate();
  const connected = useConnected();
  const [open, setOpen] = useState(false);

  const signOut = () => { closeSocket(); logout(); nav('/login'); };

  // Drop section headers that have no visible links under them
  const visible = NAV.filter((n) => n.section || can(...n.perms));
  const items = visible.filter((n, i) => !n.section || (visible[i + 1] && !visible[i + 1].section));

  return (
    <div className={`shell${open ? ' nav-open' : ''}`}>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">R</span>
          <div>
            <strong>Ratnam</strong>
            <small>Service Station · Workshop</small>
          </div>
        </div>
        <nav onClick={() => setOpen(false)}>
          {items.map((n) => n.section
            ? <div key={n.section} className="nav-section">{n.section}</div>
            : (
              <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => (isActive ? 'active' : '')}>
                <span className="nav-icon" aria-hidden>{n.icon}</span>
                {n.label}
              </NavLink>
            ))}
        </nav>
        <div className="sidebar-foot">
          <div className="me">
            <strong>{user.name}</strong>
            <small>{user.role}</small>
          </div>
          <button className="btn ghost small" onClick={signOut}>Sign out</button>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" onClick={() => setOpen(!open)} aria-label="Menu">☰</button>
          <span className={`live ${connected ? 'on' : 'off'}`} title={connected ? 'Live updates on' : 'Reconnecting…'}>
            <span className="dot" /> {connected ? 'Live' : 'Offline'}
          </span>
        </header>
        <main className="content">
          <Outlet />
        </main>
      </div>
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
    </div>
  );
}
