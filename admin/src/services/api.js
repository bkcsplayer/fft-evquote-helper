import axios from 'axios'

export const api = axios.create({
  baseURL: '/api/v1/admin',
  timeout: 15000,
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('adminToken')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err?.response?.status
    if (status === 413) {
      err.response.data = { detail: 'File too large. Please try a smaller file (max 25MB).' }
    }
    if (status === 401 || status === 403) {
      // Token invalid/expired -> force re-login for all admin pages
      localStorage.removeItem('adminToken')
      if (window.location.pathname !== '/admin/login') {
        window.location.assign('/admin/login')
      }
    }
    return Promise.reject(err)
  }
)

