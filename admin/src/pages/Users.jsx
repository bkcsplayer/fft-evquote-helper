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
    try {
      const res = await api.get('/users')
      setItems(res.data || [])
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to load users')
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function createUser() {
    setBusy(true)
    setError('')
    try {
      await api.post('/users', { username, email, password, role, is_active: isActive })
      setUsername('')
      setEmail('')
      setPassword('')
      setRole('admin')
      setIsActive(true)
      await load()
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to create user')
    } finally {
      setBusy(false)
    }
  }

  async function deleteUser(id) {
    setBusy(true)
    setError('')
    try {
      await api.delete(`/users/${id}`)
      await load()
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to delete user')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AdminShell>
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Users</h1>
        <div className="mt-1 text-sm text-slate-600">Super Admin only.</div>
      </div>

      {error ? <div className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}

      <div className="mt-4 rounded-2xl border bg-white p-4 shadow-sm">
        <div className="text-sm font-semibold text-slate-900">Create user</div>
        <div className="mt-3 grid gap-3 md:grid-cols-5">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600"
            placeholder="username"
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600 md:col-span-2"
            placeholder="email"
          />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600"
            placeholder="password"
            type="password"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="rounded-xl border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-600"
          >
            <option value="admin">admin</option>
            <option value="super_admin">super_admin</option>
          </select>
          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            Active
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={createUser}
            className="md:col-span-5 inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            Create
          </button>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-slate-900">User list</div>
          <button
            type="button"
            disabled={busy}
            onClick={load}
            className="rounded-lg border bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
          >
            Refresh
          </button>
        </div>

        <div className="mt-3 overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2">Username</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Active</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((u) => (
                <tr key={u.id}>
                  <td className="px-3 py-2 font-semibold text-slate-900">{u.username}</td>
                  <td className="px-3 py-2 text-slate-700">{u.email}</td>
                  <td className="px-3 py-2">{u.role}</td>
                  <td className="px-3 py-2">{u.is_active ? 'yes' : 'no'}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => deleteUser(u.id)}
                      className="rounded-lg border bg-white px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-sm text-slate-500">
                    No users.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </AdminShell>
  )
}

