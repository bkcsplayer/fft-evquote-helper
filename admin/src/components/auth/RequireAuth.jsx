import { Navigate, useLocation } from 'react-router-dom'

function isJwtExpired(token) {
  try {
    const parts = token.split('.')
    if (parts.length < 2) return true
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
    const exp = payload?.exp
    if (!exp) return false
    const now = Math.floor(Date.now() / 1000)
    return now >= exp
  } catch {
    return true
  }
}

export function RequireAuth({ children }) {
  const token = localStorage.getItem('adminToken')
  const loc = useLocation()
  if (!token || isJwtExpired(token)) {
    localStorage.removeItem('adminToken')
    return <Navigate to="/admin/login" replace state={{ from: loc.pathname }} />
  }
  return children
}

