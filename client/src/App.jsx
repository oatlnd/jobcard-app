import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Layout from './components/Layout.jsx';
import { Loading } from './components/ui.jsx';
import Login from './pages/Login.jsx';
import Board from './pages/Board.jsx';
import Jobs from './pages/Jobs.jsx';
import NewJob from './pages/NewJob.jsx';
import JobDetail from './pages/JobDetail.jsx';
import InvoicePrint from './pages/InvoicePrint.jsx';
import Customers from './pages/Customers.jsx';
import CustomerDetail from './pages/CustomerDetail.jsx';
import Parts from './pages/Parts.jsx';
import Invoices from './pages/Invoices.jsx';
import Reminders from './pages/Reminders.jsx';
import Users from './pages/Users.jsx';
import Settings from './pages/Settings.jsx';
import PublicStatus from './pages/PublicStatus.jsx';

function RequireAuth({ children, roles }) {
  const { user, ready } = useAuth();
  const loc = useLocation();
  if (!ready) return <Loading />;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/status" element={<PublicStatus />} />
      <Route path="/jobs/:id/invoice" element={<RequireAuth><InvoicePrint /></RequireAuth>} />
      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<Board />} />
        <Route path="jobs" element={<Jobs />} />
        <Route path="jobs/new" element={<RequireAuth roles={['admin', 'advisor']}><NewJob /></RequireAuth>} />
        <Route path="jobs/:id" element={<JobDetail />} />
        <Route path="customers" element={<Customers />} />
        <Route path="customers/:id" element={<CustomerDetail />} />
        <Route path="parts" element={<Parts />} />
        <Route path="invoices" element={<RequireAuth roles={['admin', 'advisor']}><Invoices /></RequireAuth>} />
        <Route path="reminders" element={<RequireAuth roles={['admin', 'advisor']}><Reminders /></RequireAuth>} />
        <Route path="users" element={<RequireAuth roles={['admin']}><Users /></RequireAuth>} />
        <Route path="settings" element={<RequireAuth roles={['admin']}><Settings /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
