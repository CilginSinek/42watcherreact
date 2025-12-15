import { Routes, Route, Navigate } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Students from './pages/Students'
import StudentDetail from './pages/StudentDetail'
import Reviews from './pages/Reviews'
import Login from './pages/Login'
import Callback from './pages/Callback'
import Banned from './pages/Banned'
import PrivacyPolicy from './pages/PrivacyPolicy'
import KVKK from './pages/KVKK'
import CookiePolicy from './pages/CookiePolicy'
import TermsOfUse from './pages/TermsOfUse'
import Disclaimer from './pages/Disclaimer'
import Contact from './pages/Contact'
import ProtectedRoute from './components/ProtectedRoute'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/callback" element={<Callback />} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/students"
        element={
          <ProtectedRoute>
            <Students />
          </ProtectedRoute>
        }
      />
      <Route
        path="/students/:login"
        element={
          <ProtectedRoute>
            <StudentDetail />
          </ProtectedRoute>
        }
      />
      <Route
        path="/reviews"
        element={
          <ProtectedRoute>
            <Reviews />
          </ProtectedRoute>
        }
      />
      <Route path="/banned" element={<Banned />} />
      <Route path="/privacy-policy" element={<PrivacyPolicy />} />
      <Route path="/kvkk" element={<KVKK />} />
      <Route path="/cookie-policy" element={<CookiePolicy />} />
      <Route path="/terms" element={<TermsOfUse />} />
      <Route path="/disclaimer" element={<Disclaimer />} />
      <Route path="/contact" element={<Contact />} />
    </Routes>
  )
}

export default App
