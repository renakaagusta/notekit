import axios from 'axios'
import { getSessionToken, handleAuthError } from '@/lib/http'

const apiBaseURL = import.meta.env.VITE_API_URL || 'http://localhost:3001'

// Axios instance for the NoteKit admin API. The better-auth session token is
// attached as a bearer on every request.
export const backend = axios.create({
  baseURL: apiBaseURL,
  withCredentials: true,
})

backend.interceptors.request.use((config) => {
  const token = getSessionToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

backend.interceptors.response.use(
  (res) => res,
  async (error: unknown) => {
    const axiosError = error as { config?: { _retried?: boolean } }
    if (!axiosError.config?._retried) {
      if (axiosError.config) axiosError.config._retried = true
      handleAuthError(error)
    }
    return Promise.reject(error)
  },
)
