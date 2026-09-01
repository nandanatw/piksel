import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { ToastProvider } from './components/Toast'
import TosModal from './components/TosModal'
import Login from './pages/Login'
import Generate from './pages/Generate'
import Gallery from './pages/Gallery'
import Explore from './pages/Explore'
import Payments from './pages/Payments'
import PaymentCheckout from './pages/PaymentCheckout'
import Settings from './pages/Settings'
import Favorites from './pages/Favorites'
import AdminLogin from './pages/AdminLogin'
import AdminSignup from './pages/AdminSignup'
import AdminKeys from './pages/AdminKeys'
import AdminUsers from './pages/AdminUsers'
import AdminSettings from './pages/AdminSettings'
import AdminGallery from './pages/AdminGallery'
import AdminPlans from './pages/AdminPlans'
import AdminReferences from './pages/AdminReferences'
import AdminVouchers from './pages/AdminVouchers'
import AdminDashboard from './pages/AdminDashboard'
import AdminAudit from './pages/AdminAudit'
import AdminQueue from './pages/AdminQueue'
import AdminBackups from './pages/AdminBackups'
import AdminPayments from './pages/AdminPayments'
import Landing from './pages/Landing'
import Help from './pages/Help'
import References from './pages/References'
import Usage from './pages/Usage'
import SharedResult from './pages/SharedResult'
import ResetPassword from './pages/ResetPassword'

const isAdminHost = window.location.hostname === 'admin.kreasya.click'
const isAppHost = window.location.hostname === 'app.kreasya.click'

function Protected({ children, admin }: { children: React.ReactNode; admin?: boolean }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="flex items-center justify-center min-h-screen"><div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" /></div>
  if (!user) return <Navigate to="/" />
  if (admin && user.role !== 'admin') return <Navigate to="/" />
  if (!admin && user.role === 'admin') return <Navigate to={isAdminHost ? '/admin/dashboard' : 'https://admin.kreasya.click'} />
  return <>{children}</>
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
        <TosModal />
        <Routes>
          {isAdminHost ? <>
            <Route path="/" element={<AdminLogin />} />
            <Route path="/admin" element={<Protected admin><Navigate to="/admin/dashboard" replace /></Protected>} />
            <Route path="/admin/dashboard" element={<Protected admin><AdminDashboard /></Protected>} />
            <Route path="/admin/signup" element={<Protected admin><AdminSignup /></Protected>} />
            <Route path="/admin/keys" element={<Protected admin><AdminKeys /></Protected>} />
            <Route path="/admin/users" element={<Protected admin><AdminUsers /></Protected>} />
            <Route path="/admin/gallery" element={<Protected admin><AdminGallery /></Protected>} />
            <Route path="/admin/plans" element={<Protected admin><AdminPlans /></Protected>} />
            <Route path="/admin/vouchers" element={<Protected admin><AdminVouchers /></Protected>} />
            <Route path="/admin/references" element={<Protected admin><AdminReferences /></Protected>} />
            <Route path="/admin/settings" element={<Protected admin><AdminSettings /></Protected>} />
            <Route path="/admin/audit" element={<Protected admin><AdminAudit /></Protected>} />
            <Route path="/admin/queue" element={<Protected admin><AdminQueue /></Protected>} />
            <Route path="/admin/backups" element={<Protected admin><AdminBackups /></Protected>} />
            <Route path="/admin/payments" element={<Protected admin><AdminPayments /></Protected>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </> : isAppHost ? <>
            <Route path="/" element={<Login />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/share/:token" element={<SharedResult />} />
            <Route path="/explore" element={<Explore />} />
            <Route path="/generate" element={<Protected><Generate /></Protected>} />
            <Route path="/gallery" element={<Protected><Gallery /></Protected>} />
            <Route path="/favorites" element={<Protected><Favorites /></Protected>} />
            <Route path="/payments" element={<Protected><Payments /></Protected>} />
            <Route path="/payment" element={<Protected><PaymentCheckout /></Protected>} />
            <Route path="/settings" element={<Protected><Settings /></Protected>} />
            <Route path="/help" element={<Protected><Help /></Protected>} />
            <Route path="/references" element={<Protected><References /></Protected>} />
            <Route path="/usage" element={<Protected><Usage /></Protected>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </> : <>
            <Route path="/" element={<Landing />} />
            <Route path="/share/:token" element={<SharedResult />} />
            <Route path="/login" element={<Login />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/explore" element={<Explore />} />
            <Route path="/generate" element={<Protected><Generate /></Protected>} />
            <Route path="/gallery" element={<Protected><Gallery /></Protected>} />
            <Route path="/favorites" element={<Protected><Favorites /></Protected>} />
            <Route path="/payments" element={<Protected><Payments /></Protected>} />
            <Route path="/payment" element={<Protected><PaymentCheckout /></Protected>} />
            <Route path="/settings" element={<Protected><Settings /></Protected>} />
            <Route path="/help" element={<Protected><Help /></Protected>} />
            <Route path="/references" element={<Protected><References /></Protected>} />
            <Route path="/usage" element={<Protected><Usage /></Protected>} />
            <Route path="/admin-login" element={<AdminLogin />} />
            <Route path="/admin" element={<Protected admin><Navigate to="/admin/dashboard" replace /></Protected>} />
            <Route path="/admin/dashboard" element={<Protected admin><AdminDashboard /></Protected>} />
            <Route path="/admin/signup" element={<Protected admin><AdminSignup /></Protected>} />
            <Route path="/admin/keys" element={<Protected admin><AdminKeys /></Protected>} />
            <Route path="/admin/users" element={<Protected admin><AdminUsers /></Protected>} />
            <Route path="/admin/gallery" element={<Protected admin><AdminGallery /></Protected>} />
            <Route path="/admin/plans" element={<Protected admin><AdminPlans /></Protected>} />
            <Route path="/admin/vouchers" element={<Protected admin><AdminVouchers /></Protected>} />
            <Route path="/admin/references" element={<Protected admin><AdminReferences /></Protected>} />
            <Route path="/admin/settings" element={<Protected admin><AdminSettings /></Protected>} />
            <Route path="/admin/audit" element={<Protected admin><AdminAudit /></Protected>} />
            <Route path="/admin/queue" element={<Protected admin><AdminQueue /></Protected>} />
            <Route path="/admin/backups" element={<Protected admin><AdminBackups /></Protected>} />
            <Route path="/admin/payments" element={<Protected admin><AdminPayments /></Protected>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </>}
        </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
