import { useState, useEffect, useRef, createContext, useContext } from 'react'
import { useLocation } from 'react-router-dom'

interface User { email?: string; role?: string; credits?: number; unlimited?: boolean; freeTrial?: boolean; unlimitedUntil?: string | null; username?: string | null; displayName?: string | null; telegramUsername?: string | null; telegramId?: string | null; tosAccepted?: boolean }

const AuthContext = createContext<{ user: User | null; loading: boolean; refresh: () => Promise<User | null>; logout: () => void }>({ user: null, loading: true, refresh: async () => null, logout: () => {} })

const LOCAL_DEV = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || new URLSearchParams(window.location.search).has('dev')
const DEV_USER = { email: 'admin@piksel.my.id', role: 'admin', credits: 100, unlimited: true, freeTrial: false, username: 'admin', displayName: 'Piksel Admin', tosAccepted: true }

// In local dev, intercept all API fetches and inject the dev user header.
if (LOCAL_DEV && typeof window !== 'undefined') {
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input: any, init: any = {}) => {
    const headers = new Headers(init?.headers || {});
    if (!headers.has('X-Dev-User') && typeof input === 'string' && input.startsWith('/api/')) {
      headers.set('X-Dev-User', DEV_USER.email);
    }
    return originalFetch(input, { ...init, headers });
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(LOCAL_DEV ? DEV_USER : null)
  const [loading, setLoading] = useState(!LOCAL_DEV)
  const { pathname } = useLocation()
  const userRef = useRef<User | null>(LOCAL_DEV ? DEV_USER : null)
  useEffect(() => { userRef.current = user }, [user])

  const refresh = async () => {
    if (LOCAL_DEV) {
      setUser(DEV_USER)
      return DEV_USER
    }
    const isAdmin = window.location.hostname === 'admin.piksel.my.id' || pathname === '/admin' || pathname.startsWith('/admin/')
    const url = isAdmin ? '/api/auth/admin/me' : '/api/auth/me'
    return fetch(url, { credentials: 'include' })
      .then(async r => {
        if (r.ok) {
          const d = await r.json().catch(() => null)
          setUser(d || null)
          return d || null
        }
        // Only treat a genuine auth failure (401/403) as a logout. Transient
        // errors (429 rate limit, 5xx, network) must NOT drop the session,
        // otherwise heavy polling during many tasks looks like a random logout.
        if (r.status === 401 || r.status === 403) {
          setUser(null)
          return null
        }
        return userRef.current
      })
      .catch(() => userRef.current)
  }
  useEffect(() => {
    refresh().finally(() => setLoading(false))
  }, [pathname])

  const logout = () => {
    const isAdmin = window.location.hostname === 'admin.piksel.my.id' || pathname === '/admin' || pathname.startsWith('/admin/')
    sessionStorage.removeItem('Piksel_mode')
    fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
      .then(() => { 
        setUser(null); 
        // Redirect based on which page we're on
        window.location.href = isAdmin ? (window.location.hostname === 'admin.piksel.my.id' ? '/' : '/admin') : '/'
      })
  }

  return <AuthContext.Provider value={{ user, loading, refresh, logout }}>{children}</AuthContext.Provider>
}

export function useAuth() { return useContext(AuthContext) }
