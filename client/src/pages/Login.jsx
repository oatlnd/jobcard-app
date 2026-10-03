import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { ErrorBox, useAction } from '../components/ui.jsx';

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { busy, error, run } = useAction();

  if (user) return <Navigate to={loc.state?.from || '/'} replace />;

  const submit = (e) => {
    e.preventDefault();
    run(async () => { await login(username, password); nav(loc.state?.from || '/', { replace: true }); });
  };

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="brand big">
          <span className="brand-mark">R</span>
          <div>
            <strong>Ratnam Service Station</strong>
            <small>Workshop job cards</small>
          </div>
        </div>
        <ErrorBox error={error} />
        <label className="field">
          <span className="field-label">Username</span>
          <input autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required />
        </label>
        <label className="field">
          <span className="field-label">Password</span>
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <button className="btn primary block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <a className="muted small center" href="/status">Customer? Check your bike's service status →</a>
      </form>
    </div>
  );
}
