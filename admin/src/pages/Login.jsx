import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../services/api.js'

export default function Login() {
  const nav = useNavigate()
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('admin1234')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const res = await api.post('/auth/login', { username, password })
      localStorage.setItem('adminToken', res.data.access_token)
      nav('/admin/cases')
    } catch (e2) {
      setError(e2?.response?.data?.detail || 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-10">
      <div className="mx-auto max-w-sm rounded-2xl border bg-white p-6 shadow-sm">
        <div className="text-xs font-medium uppercase tracking-wider text-slate-500">FFT</div>
        <h1 className="mt-2 text-xl font-semibold text-slate-900">Admin Login</h1>
        <form onSubmit={onSubmit} className="mt-5 space-y-3">
          <label className="block">
            <div className="text-sm font-medium text-slate-800">Username</div>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600"
              required
            />
          </label>
          <label className="block">
            <div className="text-sm font-medium text-slate-800">Password</div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600"
              required
            />
          </label>
          {error ? <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}
          <button
            type="submit"
            disabled={busy}
            className="inline-flex w-full items-center justify-center rounded-xl bg-teal-700 px-4 py-3 text-sm font-semibold text-white hover:bg-teal-800 disabled:opacity-60"
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <div className="mt-4 text-xs text-slate-500">
          Dev default: <span className="font-semibold">admin / admin1234</span>
        </div>
      </div>
    </div>
  )
}

