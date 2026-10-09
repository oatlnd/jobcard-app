import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Layout from './components/Layout.jsx';
import { Loading } from './components/ui.jsx';
import Login from './pages/Login.jsx';
import Board from './pages/Board.jsx';
import Jobs from './pages/Jobs.jsx';
import NewJob from './pages/NewJob.jsx';
import JobDetail from './pages/JobDetail.jsx';
import JobPrint from './pages/JobPrint.jsx';
import Customers from './pages/Customers.jsx';
import CustomerDetail from './pages/CustomerDetail.jsx';
import Parts from './pages/Parts.jsx';
import Invoices from './pages/Invoices.jsx';
import Reminders from './pages/Reminders.jsx';
import Users from './pages/Users.jsx';
import Settings from './pages/Settings.jsx';
import Masters from './pages/Masters.jsx';
import Suppliers from './pages/Suppliers.jsx';
import PurchaseOrders from './pages/PurchaseOrders.jsx';
import PurchaseOrderForm from './pages/PurchaseOrderForm.jsx';
import PurchaseOrderDetail from './pages/PurchaseOrderDetail.jsx';
import Grns from './pages/Grns.jsx';
import GrnForm from './pages/GrnForm.jsx';
import GrnDetail from './pages/GrnDetail.jsx';
import DocPrint from './pages/DocPrint.jsx';
import Expenses from './pages/Expenses.jsx';
import Employees, { EmployeeDetail } from './pages/Employees.jsx';
import Attendance from './pages/Attendance.jsx';
import Advances from './pages/Advances.jsx';
import Payroll, { PayrollRun, PayslipPrint } from './pages/Payroll.jsx';
import PublicStatus from './pages/PublicStatus.jsx';
import EnvBanner from './components/EnvBanner.jsx';
import Cashier from './pages/Cashier.jsx';
import ReceiptPrint from './pages/ReceiptPrint.jsx';
import FreeServiceReport from './pages/FreeServiceReport.jsx';
import Kits from './pages/Kits.jsx';

function RequireAuth({ children, perms }) {
  const { user, ready, can } = useAuth();
  const loc = useLocation();
  if (!ready) return <Loading />;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname + loc.search }} replace />;
  if (perms && !can(...perms)) return <NoAccess />;
  return children;
}

function NoAccess() {
  return <div className="page"><div className="empty">You don’t have access to this page. Ask the admin to update your role.</div></div>;
}

function OldInvoiceLink() {
  const { id } = useParams();
  return <Navigate to={`/print/job/${id}?doc=invoice&format=a4`} replace />;
}

const P = (perms, el) => <RequireAuth perms={perms}>{el}</RequireAuth>;

export default function App() {
  return (
    <>
    <EnvBanner />
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/status" element={<PublicStatus />} />
      <Route path="/print/job/:id" element={P(['jobs.print'], <JobPrint />)} />
      <Route path="/print/receipt/:id" element={P(['payments.record', 'jobs.print'], <ReceiptPrint />)} />
      <Route path="/print/po/:id" element={P(['purchasing.view'], <DocPrint kind="po" />)} />
      <Route path="/print/grn/:id" element={P(['purchasing.view', 'grn.manage'], <DocPrint kind="grn" />)} />
      <Route path="/print/payslips/:id" element={P(['payroll.view'], <PayslipPrint />)} />
      <Route path="/jobs/:id/invoice" element={<OldInvoiceLink />} />
      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<Home />} />
        <Route path="jobs" element={P(['jobs.view'], <Jobs />)} />
        <Route path="jobs/new" element={P(['jobs.create'], <NewJob />)} />
        <Route path="jobs/:id" element={P(['jobs.view'], <JobDetail />)} />
        <Route path="customers" element={P(['customers.view'], <Customers />)} />
        <Route path="customers/:id" element={P(['customers.view'], <CustomerDetail />)} />
        <Route path="invoices" element={P(['invoices.view'], <Invoices />)} />
        <Route path="cashier" element={P(['payments.record'], <Cashier />)} />
        <Route path="reports/free-services" element={P(['invoices.view', 'dashboard.finance'], <FreeServiceReport />)} />
        <Route path="reminders" element={P(['messages.view'], <Reminders />)} />
        <Route path="parts" element={P(['parts.view'], <Parts />)} />
        <Route path="suppliers" element={P(['purchasing.view'], <Suppliers />)} />
        <Route path="purchase-orders" element={P(['purchasing.view'], <PurchaseOrders />)} />
        <Route path="purchase-orders/new" element={P(['purchasing.manage'], <PurchaseOrderForm />)} />
        <Route path="purchase-orders/:id" element={P(['purchasing.view'], <PurchaseOrderDetail />)} />
        <Route path="purchase-orders/:id/edit" element={P(['purchasing.manage'], <PurchaseOrderForm />)} />
        <Route path="grns" element={P(['purchasing.view', 'grn.manage'], <Grns />)} />
        <Route path="grns/new" element={P(['grn.manage'], <GrnForm />)} />
        <Route path="grns/:id" element={P(['purchasing.view', 'grn.manage'], <GrnDetail />)} />
        <Route path="expenses" element={P(['expenses.view'], <Expenses />)} />
        <Route path="employees" element={P(['employees.view'], <Employees />)} />
        <Route path="employees/:id" element={P(['employees.view'], <EmployeeDetail />)} />
        <Route path="attendance" element={P(['attendance.manage'], <Attendance />)} />
        <Route path="advances" element={P(['advances.manage'], <Advances />)} />
        <Route path="payroll" element={P(['payroll.view'], <Payroll />)} />
        <Route path="payroll/:id" element={P(['payroll.view'], <PayrollRun />)} />
        <Route path="kits" element={P(['masters.manage'], <Kits />)} />
        <Route path="masters" element={P(['masters.manage'], <Masters />)} />
        <Route path="users" element={P(['users.manage'], <Users />)} />
        <Route path="settings" element={P(['settings.manage'], <Settings />)} />
        <Route path="*" element={<HomeRedirect />} />
      </Route>
    </Routes>
    </>
  );
}

// People without the job board go to the first page they can use
const FIRST_PAGES = [['parts.view', '/parts'], ['purchasing.view', '/purchase-orders'], ['expenses.view', '/expenses'], ['payroll.view', '/payroll'],
  ['employees.view', '/employees'], ['attendance.manage', '/attendance'], ['users.manage', '/users'], ['settings.manage', '/settings']];
function Home() {
  const { can } = useAuth();
  if (can('payments.record') && !can('jobs.create') && !can('jobs.status')) return <Navigate to="/cashier" replace />; // cashiers start at the counter
  if (can('jobs.view')) return <Board />;
  const hit = FIRST_PAGES.find(([p]) => can(p));
  return hit ? <Navigate to={hit[1]} replace /> : <NoAccess />;
}
function HomeRedirect() {
  return <Navigate to="/" replace />;
}
