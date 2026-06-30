import { useEffect, useState } from 'react'
import { AdminShell } from '../components/layout/AdminShell.jsx'
import { api } from '../services/api.js'

export default function Users() {
  const [items, setItems] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('admin')
  const [isActive, setIsActive] = useState(true)

  async function load() {
    setError('')
    try { const res = await api.get('/users'); setItems(res.data || []) }
    catch (e) { setError(e?.response?.data?.detail || 'Failed to load users') }
  }

  useEffect(() => { load() }, [])

  async function createUser() {
    setBusy(true); setError('')
    try { await api.post('/users', { username, email, password, role, is_active: isActive }); setUsername(''); setEmail(''); setPassword(''); setRole('admin'); setIsActive(true); await load() }
    catch (e) { setError(e?.response?.data?.detail || 'Failed to create user') }
    finally { setBusy(false) }
  }

  async function deleteUser(id) {
    setBusy(true); setError('')
    try { await api.delete(`/users/${id}`); await load() }
    catch (e) { setError(e?.response?.data?.detail || 'Failed to delete user') }
    finally { setBusy(false) }
  }

  const inputClass = "w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"

  return (
    <AdminShell>
      <div className="animate-fade-in">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Users</h1>
          <p className="mt-1 text-sm text-slate-500">Super Admin only.</p>
        </div>

        {error && <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-medium text-rose-700">{error}</div>}

        {/* Create user form */}
        <div className="mt-5 rounded-3xl border border-zinc-100 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-900">Create user</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-5">
            <input value={username} onChange={(e) => setUsername(e.target.value)} className={inputClass} placeholder="username" />
            <input value={email} onChange={(e) => setEmail(e.target.value)} className={`${inputClass} md:col-span-2`} placeholder="email" />
            <input value={password} onChange={(e) => setPassword(e.target.value)} className={inputClass} placeholder="password" type="password" />
            <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20">
              <option value="admin">admin</option>
              <option value="super_admin">super_admin</option>
            </select>
            <label className="flex items-center gap-2 text-sm md:col-span-2">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
              <span className="text-slate-700">Active</span>
            </label>
            <button type="button" disabled={busy} onClick={createUser} className="md:col-span-5 inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-slate-800 active:scale-95 disabled:opacity-60">
              Create
            </button>
          </div>
        </div>

        {/* User list */}
        <div className="mt-5 overflow-hidden rounded-3xl border border-zinc-100 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <h2 className="text-sm font-bold text-slate-900">User list</h2>
            <button type="button" disabled={busy} onClick={load} className="rounded-lg border bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50 active:scale-95 disabled:opacity-60">
              Refresh
            </button>
          </div>
          <div className="overflow-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3">Username</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Active</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((u) => (
                  <tr key={u.id} className="transition-colors hover:bg-slate-50">
                    <td className="px-4 py-3 font-semibold text-slate-900">{u.username}</td>
                    <td className="px-4 py-3 text-slate-600">{u.email}</td>
                    <td className="px-4 py-3"><span className="inline-flex rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">{u.role}</span></td>
                    <td className="px-4 py-3">{u.is_active ? <span className="font-medium text-emerald-600">yes</span> : <span className="text-slate-400">no</span>}</td>
                    <td className="px-4 py-3 text-right">
                      <button type="button" disabled={busy} onClick={() => deleteUser(u.id)} className="rounded-lg border bg-white px-2.5 py-1.5 text-xs font-semibold text-rose-600 transition-all hover:bg-rose-50 disabled:opacity-60">Delete</button>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-slate-500">No users.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminShell>
  )
}
