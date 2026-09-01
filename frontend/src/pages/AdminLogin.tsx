import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, ArrowRight, Eye, EyeOff, KeyRound, LockKeyhole, Server, ShieldCheck, Sparkles } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { Card, CardContent } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Button } from '../components/ui/button'
import { Label } from '../components/ui/label'
import ThemeToggle from '../components/ThemeToggle'

export default function AdminLogin() {
  const nav = useNavigate()
  const { user, refresh } = useAuth()
  const [password, setPassword] = useState('')
  const [totp, setTotp] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    if (user?.role === 'admin') nav('/admin/dashboard', { replace: true })
  }, [user, nav])

  async function login(event?: FormEvent) {
    event?.preventDefault()
    if (busy) return
    setError('')
    if (!password || totp.length !== 6) {
      setError('Enter your admin password and 6-digit authenticator code.')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/auth/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password, totp }), credentials: 'include' })
      const d = await res.json().catch(() => ({}))
      if (d.ok) {
        await refresh()
        nav('/admin/dashboard', { replace: true })
      } else setError(d.error || 'Login failed')
    } catch {
      setError('Unable to reach the server')
    } finally { setBusy(false) }
  }

  if (user?.role === 'admin') return null

  return (
    <div className="grid min-h-screen overflow-x-hidden bg-background lg:grid-cols-[.72fr_1.28fr]">
      <aside className="relative hidden min-h-screen overflow-hidden border-r border-white/10 bg-[#080d13] p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-14">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.025)_1px,transparent_1px)] bg-[size:36px_36px]" />
        <div className="relative"><div className="flex items-center gap-2.5 text-lg font-semibold"><span className="grid h-9 w-9 place-items-center rounded-lg border border-cyan-300/25 bg-cyan-300/10"><Sparkles className="h-4 w-4 text-cyan-200" /></span>Piksel Control</div><div className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[.04] px-3 py-1.5 text-[11px] uppercase tracking-[.16em] text-white/45"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />Area administrator</div></div>
        <div className="relative space-y-3">
          {[{ icon: Server, title: 'Infrastructure', text: 'Queue, model, dan konfigurasi sistem' }, { icon: Activity, title: 'Operations', text: 'Monitor aktivitas dan performa layanan' }, { icon: LockKeyhole, title: 'Restricted access', text: 'Dilindungi password dan autentikasi 2 langkah' }].map(({ icon: Icon, title, text }) => <div key={title} className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[.025] p-4"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/5 text-cyan-200"><Icon className="h-4 w-4" /></span><div><p className="text-sm font-medium text-white/80">{title}</p><p className="mt-1 text-xs leading-5 text-white/35">{text}</p></div></div>)}
        </div>
        <p className="relative text-xs leading-5 text-white/30">Setiap sesi dan perubahan administratif dicatat untuk kebutuhan keamanan.</p>
      </aside>

      <main className="relative flex min-h-screen items-center justify-center px-4 py-20 sm:px-8">
        <div className="absolute left-4 top-5 flex items-center gap-2 text-sm font-semibold lg:hidden"><ShieldCheck className="h-5 w-5 text-primary" />Piksel Control</div>
        <div className="absolute right-4 top-4 sm:right-8 sm:top-6"><ThemeToggle /></div>
        <div className="w-full max-w-[430px]">
          <div className="mb-7"><div className="mb-5 grid h-12 w-12 place-items-center rounded-2xl border border-primary/25 bg-primary/10"><ShieldCheck className="h-6 w-6 text-primary" /></div><div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[.16em] text-muted-foreground"><span className="h-px w-6 bg-primary" />admin.piksel.my.id</div><h1 className="text-3xl font-semibold tracking-[-.035em] sm:text-4xl">Masuk ke panel kontrol</h1><p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">Gunakan kredensial administrator dan kode autentikator untuk melanjutkan.</p></div>
          <Card className="border-border/80 shadow-xl shadow-black/5"><CardContent className="p-5 sm:p-6">
            <form className="space-y-5" onSubmit={login}>
              <div className="space-y-2"><Label htmlFor="password">Kata sandi administrator</Label><div className="relative"><Input id="password" type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Masukkan kata sandi" autoComplete="current-password" autoFocus className="h-12 pr-12" /><button type="button" onClick={() => setShowPassword(value => !value)} className="absolute right-1 top-1 grid h-10 w-10 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></div>
              <div className="space-y-2"><div className="flex items-center justify-between"><Label htmlFor="totp">Kode autentikator</Label><span className="text-[11px] text-muted-foreground">6 digit</span></div><Input id="totp" type="text" value={totp} onChange={e => setTotp(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000 000" maxLength={6} inputMode="numeric" autoComplete="one-time-code" className="h-12 text-center font-mono text-lg tracking-[.45em]" /></div>
              {error && <p className="rounded-lg border border-destructive bg-destructive/10 p-3 text-sm text-destructive-foreground">{error}</p>}
              <Button type="submit" disabled={busy} className="h-12 w-full"><KeyRound className="h-4 w-4" />{busy ? 'Memverifikasi…' : 'Masuk dengan aman'}<ArrowRight className="h-4 w-4" /></Button>
            </form>
          </CardContent></Card>
          <div className="mt-5 flex items-center justify-center gap-2 text-xs text-muted-foreground"><LockKeyhole className="h-3.5 w-3.5" />Akses terbatas untuk personel berwenang</div>
        </div>
      </main>
    </div>
  )
}
