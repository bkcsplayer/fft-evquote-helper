import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { RequireAuth } from './components/auth/RequireAuth.jsx'
import CaseDetail from './pages/CaseDetail.jsx'
import Cases from './pages/Cases.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Login from './pages/Login.jsx'
import Installations from './pages/Installations.jsx'
import Permits from './pages/Permits.jsx'
import Referrers from './pages/Referrers.jsx'
import Settings from './pages/Settings.jsx'
import Surveys from './pages/Surveys.jsx'
import Users from './pages/Users.jsx'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/admin" replace />} />

        <Route path="/admin/login" element={<Login />} />

        <Route
          path="/admin"
          element={
            <RequireAuth>
              <Dashboard />
            </RequireAuth>
          }
        />

        <Route
          path="/admin/surveys"
          element={
            <RequireAuth>
              <Surveys />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/installations"
          element={
            <RequireAuth>
              <Installations />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/permits"
          element={
            <RequireAuth>
              <Permits />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/referrers"
          element={
            <RequireAuth>
              <Referrers />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/settings"
          element={
            <RequireAuth>
              <Settings />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/users"
          element={
            <RequireAuth>
              <Users />
            </RequireAuth>
          }
        />

        <Route
          path="/admin/cases"
          element={
            <RequireAuth>
              <Cases />
            </RequireAuth>
          }
        />
        <Route
          path="/admin/cases/:id"
          element={
            <RequireAuth>
              <CaseDetail />
            </RequireAuth>
          }
        />

        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
