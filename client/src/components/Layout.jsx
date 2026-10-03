import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { closeSocket, useConnected } from '../socket.js';

const NAV = [
  { to: '/', label: 'Job board', icon: '▦', end: true },
  { to: '/jobs/new', label: 'New job card', icon: '+', roles: ['admin', 'advisor'] },
  { to: '/jobs', label: 'All jobs', icon: '≡', end: true },
  { to: '/customers', label: 'Customers', icon: '☺' },
  { to: '/parts', label: 'Parts & stock', icon: '⚙' },
  { to: '/invoices', label: 'Invoices', icon: '₨', roles: ['admin', 'advisor'] },
  { to: '/reminders', label: 'Reminders & messages', icon: '✉', roles: ['admin', 'advisor'] },
  { to: '/users', label: 'Staff', icon: '◉', roles: ['admin'] },
  { to: '/settings', label: 'Settings', icon: '⚑', roles: ['admin'] },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const connected = useConnected();
  const [open, setOpen] = useState(false);

  const signOut = () => { closeSocket(); logout(); nav('/login'); };

  return (
    <div className={`shell${open ? ' nav-open' : ''}`}>
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">R</span>
          <div>
            <strong>Ratnam</strong>
            <small>Service Station · Job Cards</small>
          </div>
        </div>
        <nav onClick={() => setOpen(false)}>
          {NAV.filter((n) => !n.roles || n.roles.includes(user.role)).map((n) => (
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
