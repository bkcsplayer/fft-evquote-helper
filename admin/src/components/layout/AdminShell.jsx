import { Link, NavLink, useNavigate } from 'react-router-dom'

export function AdminShell({ children }) {
  const nav = useNavigate()
  const logoSrc = `${import.meta.env.BASE_URL || '/'}brand-logo.png`

  function logout() {
    localStorage.removeItem('adminToken')
    nav('/admin/login')
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100 to-slate-50">
      <header className="sticky top-0 z-40 border-b bg-white/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-[1680px] flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6">
          <div className="flex items-center gap-4">
            <Link to="/admin" className="flex items-center gap-2 text-sm font-semibold tracking-wide text-slate-900">
              <img
                src={logoSrc}
                alt="FFT"
                className="h-6 w-6 rounded-md bg-slate-900/5 object-contain"
                onError={(e) => {
                  // Avoid noisy 404s in console if logo is missing
                  e.currentTarget.style.display = 'none'
                }}
              />
              <span>FFT Admin</span>
            </Link>
            <nav className="hidden items-center gap-2 md:flex">
              <TopNav to="/admin" label="Dashboard" />
              <TopNav to="/admin/cases" label="Cases" />
              <TopNav to="/admin/surveys" label="Surveys" />
              <TopNav to="/admin/installations" label="Installations" />
              <TopNav to="/admin/permits" label="Permits" />
              <TopNav to="/admin/referrers" label="Referrers" />
              <TopNav to="/admin/settings" label="Settings" />
              <TopNav to="/admin/users" label="Users" />
            </nav>
          </div>
          <button
            type="button"
            onClick={logout}
            className="self-start rounded-lg border bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 md:self-auto"
          >
            Logout
          </button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1680px] px-4 py-6 md:px-6">{children}</main>
    </div>
  )
}

function TopNav({ to, label }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `rounded-lg px-2 py-1 text-sm font-semibold ${
          isActive ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
        }`
      }
    >
      {label}
    </NavLink>
  )
}

