import { useEffect, useState, type ReactNode } from 'react'
import { Sparkles, Archive, ChartNoAxesCombined, CircleDollarSign, ClipboardList, Images, KeyRound, ListTodo, LogOut, Menu, Settings, UserPlus, Users, X, ShieldOff, Compass, WalletCards, User, Star, HelpCircle, Plus, PanelLeftClose, PanelLeftOpen, ChevronRight, Tag, Image, Ticket, Bell, Gift, Zap, Mic } from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { cn } from '../lib/utils'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from './ui/dialog'
import ThemeToggle from './ThemeToggle'

interface LayoutProps {
  children: ReactNode
  title?: string
  subtitle?: string
  nav?: ReactNode
  headerContent?: ReactNode
  showCredits?: boolean
  floatingHeader?: boolean
}

export function Layout({ children, title = 'Piksel', subtitle = 'AI Image Studio', headerContent, floatingHeader = false }: LayoutProps) {
  const { user, logout } = useAuth()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('userSidebarCollapsed') === 'true')
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [sessionError, setSessionError] = useState('')
  const [bannerOpen, setBannerOpen] = useState(false)
  const [bannerMessages, setBannerMessages] = useState<{ id: string; text: string; icon: string }[]>([])
  const [dismissedBanners, setDismissedBanners] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('dismissedBanners') || '[]')) } catch { return new Set() }
  })
  const userLabel = user?.telegramUsername ? `@${user.telegramUsername.replace(/^@/, '')}` : user?.displayName || user?.email
  const remainingDays = user?.unlimitedUntil ? Math.max(0, Math.ceil((new Date(user.unlimitedUntil).getTime() - Date.now()) / 86400000)) : null

  const navigationGroups = [
    { label: 'Jelajahi', links: [{ to: '/explore', label: 'Explore', icon: Compass }] },
    { label: 'Koleksi', links: [
      { to: '/gallery', label: 'Gallery', icon: Images },
      { to: '/favorites', label: 'Favorites', icon: Star },
      { to: '/references', label: 'References', icon: Images },
    ] },
  ]

  useEffect(() => { setOpen(false); setAccountMenuOpen(false) }, [location.pathname])
  useEffect(() => {
    fetch('/api/banner').then(r => r.ok ? r.json() : null).then(data => {
      if (data?.messages) setBannerMessages(data.messages)
    }).catch(() => {})
  }, [])
  useEffect(() => {
    if (!accountMenuOpen) return
    const close = (event: PointerEvent) => {
      const target = event.target as Element | null
      if (!target?.closest('[data-account-menu]')) setAccountMenuOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [accountMenuOpen])

  function toggleSidebar() {
    setSidebarCollapsed(previous => {
      const next = !previous
      localStorage.setItem('userSidebarCollapsed', String(next))
      return next
    })
  }

  async function logoutAll() {
    setSessionError('')
    const response = await fetch('/api/auth/logout-all', { method: 'POST', credentials: 'include' })
    if (!response.ok) { setSessionError('Could not sign out other sessions.'); return }
    sessionStorage.removeItem('Piksel_mode')
    window.location.assign('/')
  }

  const navigation = (compact = false) => <div className="space-y-4">
    {navigationGroups.map(group => <section key={group.label}>
      {!compact && <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground/70">{group.label}</p>}
      <div className="space-y-1">{group.links.map(({ to, label, icon: Icon }) => (
        <NavLink key={to} to={to} title={compact ? label : undefined} className={({ isActive }) => cn('flex min-h-10 items-center rounded-lg text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground', compact ? 'justify-center px-0' : 'gap-3 px-3', isActive && 'bg-primary/15 text-primary')}>
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md"><Icon className="h-4 w-4" /></span>
          {!compact && <span>{label}</span>}
        </NavLink>
      ))}</div>
    </section>)}
  </div>

  const accountMenu = (compact = false) => {
    if (!user) return null
    const initials = (userLabel || 'U').replace(/^@/, '').split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'U'
const expiryDate = user?.unlimitedUntil ? new Date(user.unlimitedUntil).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : null
    const planBadge = user?.freeTrial
      ? `Trial ${remainingDays !== null ? `${remainingDays}d` : ''}`
      : user?.unlimited
        ? `Unlimited ${remainingDays !== null ? `${remainingDays}d` : ''}`
        : `${user?.credits ?? 0} credits`
    const planSub = user?.freeTrial || user?.unlimited
      ? (remainingDays !== null ? `${remainingDays} hari lagi` : '') + (expiryDate ? ` · sampai ${expiryDate}` : '')
      : ''
    const planLabel = planSub ? `${planBadge} · ${planSub}` : planBadge
    const itemClass = 'flex min-h-10 w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted'
    return <div className="relative" data-account-menu>
      {accountMenuOpen && <div className={cn('absolute bottom-[calc(100%+.5rem)] z-[90] max-h-[calc(100vh-10rem)] overflow-y-auto rounded-2xl border border-border bg-card p-2 text-card-foreground shadow-2xl', compact ? 'left-0 w-64' : 'inset-x-0')}>
        <NavLink to="/payments" className={itemClass}><WalletCards className="h-4 w-4 text-muted-foreground" />Upgrade paket</NavLink>
        <NavLink to="/usage" className={itemClass}><ChartNoAxesCombined className="h-4 w-4 text-muted-foreground" />Penggunaan</NavLink>
        <NavLink to="/settings" className={itemClass}><Settings className="h-4 w-4 text-muted-foreground" />Pengaturan</NavLink>
        <div className="my-1 border-t border-border" />
        <NavLink to="/help" className={itemClass}><HelpCircle className="h-4 w-4 text-muted-foreground" />Bantuan<ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" /></NavLink>
        <button type="button" className={itemClass} onClick={logoutAll}><ShieldOff className="h-4 w-4 text-muted-foreground" />Keluar semua perangkat</button>
        <button type="button" className={itemClass} onClick={logout}><LogOut className="h-4 w-4 text-muted-foreground" />Keluar</button>
      </div>}
      <button type="button" onClick={() => setAccountMenuOpen(value => !value)} aria-expanded={accountMenuOpen} className={cn('flex min-h-12 w-full items-center rounded-xl border border-border bg-background/60 text-left transition-colors hover:bg-muted', compact ? 'justify-center px-0' : 'gap-3 px-2.5')} title={compact ? `${userLabel} · ${planLabel}` : undefined}>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/20 text-[10px] font-semibold text-primary">{initials}</span>
        {!compact && <><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{userLabel}</p><p className="truncate text-[11px] text-muted-foreground">{planLabel}</p></div><User className="h-4 w-4 shrink-0 text-muted-foreground" /></>}
      </button>
    </div>
  }

  return (
    <div className={cn('app-shell min-h-screen overflow-x-hidden bg-background transition-[padding] duration-300', sidebarCollapsed ? 'app-shell--sidebar-collapsed lg:pl-20' : 'lg:pl-64')}>
      {/* Desktop Sidebar */}
      <aside className={cn('fixed inset-y-0 left-0 z-50 hidden flex-col border-r bg-card transition-[width,padding] duration-300 lg:flex', sidebarCollapsed ? 'w-20 p-3' : 'w-64 p-4')}>
        <div className={cn('flex items-center py-3', sidebarCollapsed ? 'justify-center px-0' : 'gap-3 px-2')}>
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-muted">
            <Sparkles className="h-5 w-5 text-foreground" />
          </div>
          {!sidebarCollapsed && <div>
            <p className="text-sm font-semibold leading-none">Piksel</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{subtitle}</p>
          </div>}
        </div>
        <Button variant="outline" size="icon" onClick={toggleSidebar} className="absolute -right-3 top-[4.25rem] h-6 w-6 rounded-full bg-card shadow-sm" title={sidebarCollapsed ? 'Perbesar sidebar' : 'Kecilkan sidebar'} aria-label={sidebarCollapsed ? 'Perbesar sidebar' : 'Kecilkan sidebar'}>
          {sidebarCollapsed ? <PanelLeftOpen className="h-3.5 w-3.5" /> : <PanelLeftClose className="h-3.5 w-3.5" />}
        </Button>
        <NavLink to="/generate" title={sidebarCollapsed ? 'Buat Gambar' : undefined} className={cn('mt-5 flex min-h-11 items-center rounded-xl bg-primary font-semibold text-primary-foreground shadow-sm shadow-primary/20 transition hover:bg-primary/90', sidebarCollapsed ? 'justify-center px-0' : 'gap-2.5 px-3')}>
          <Plus className="h-4 w-4 shrink-0" />{!sidebarCollapsed && <span className="text-sm">Buat Gambar</span>}
        </NavLink>
        <nav className="mt-5 min-h-0 flex-1 overflow-y-auto pr-0.5">{navigation(sidebarCollapsed)}</nav>
        <div className="border-t pt-3">{accountMenu(sidebarCollapsed)}</div>
      </aside>
      
      {/* Mobile Sidebar Overlay */}
      {open && <button aria-label="Close menu overlay" onClick={() => setOpen(false)} className="fixed inset-0 z-[60] border-0 bg-black/65 backdrop-blur-sm lg:hidden" />}
      
      {/* Mobile Sidebar */}
      <aside className={cn('fixed inset-y-0 left-0 z-[70] flex w-[18rem] max-w-[86vw] flex-col border-r bg-card p-4 shadow-lg transition-transform duration-300 lg:hidden', open ? 'translate-x-0' : '-translate-x-full')}>
        <div className="flex items-center justify-between px-2 py-3">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-muted">
              <Sparkles className="h-5 w-5 text-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold">Piksel</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{subtitle}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close menu"><X className="h-5 w-5" /></Button>
        </div>
        <NavLink to="/generate" className="mt-5 flex min-h-11 items-center gap-2.5 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/20"><Plus className="h-4 w-4" />Buat Gambar</NavLink>
        <nav className="mt-5 min-h-0 flex-1 overflow-y-auto">{navigation()}</nav>
        <div className="border-t pt-3">{accountMenu()}</div>
      </aside>
      
      {/* Header */}
      <header className={cn(floatingHeader ? 'pointer-events-none fixed inset-x-0 top-0 z-50 bg-transparent' : 'sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-xl lg:ml-0')}>
        <div className={cn('flex items-center justify-between gap-3', floatingHeader ? 'px-3 pb-2 pt-[max(.75rem,env(safe-area-inset-top))] sm:px-5 lg:pr-8' : 'px-3 py-3 sm:px-5 lg:px-8', floatingHeader && (sidebarCollapsed ? 'lg:pl-[calc(5rem+2rem)]' : 'lg:pl-[calc(16rem+2rem)]'))}>
          <div className="flex shrink-0 items-center gap-3">
            <Button variant={floatingHeader ? 'ghost' : 'outline'} size="icon" onClick={() => setOpen(true)} className={cn('lg:hidden', floatingHeader && 'pointer-events-auto rounded-xl border border-border/60 bg-background/70 shadow-lg backdrop-blur-xl hover:bg-background/90')} aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </Button>
            <div className={cn('lg:hidden', floatingHeader && 'hidden')}>
              <p className="text-sm font-semibold leading-none">Piksel</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{subtitle}</p>
            </div>
            <div className={cn('hidden lg:block', floatingHeader && 'lg:hidden')}>
              <p className="text-sm font-medium text-muted-foreground">{title}</p>
            </div>
          </div>
          
          <div className={cn('flex min-w-0 flex-1 items-center justify-end gap-2', floatingHeader && 'pointer-events-auto')}>
            {user && (
              <div className={cn('flex items-center gap-1', floatingHeader && 'h-10 shrink-0 justify-center rounded-xl border border-border/60 bg-background/70 px-1.5 shadow-lg backdrop-blur-xl')}>
                <NavLink
                  to="/payments"
                  className={cn(
                    'group flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all hover:shadow-sm',
                    user?.freeTrial && 'border-amber-400/50 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20',
                    user?.unlimited && !user?.freeTrial && 'border-emerald-400/50 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20',
                    !user?.unlimited && 'border-destructive/50 bg-destructive/10 text-destructive hover:bg-destructive/20',
                    !floatingHeader && 'lg:hidden',
                    floatingHeader && 'border-transparent bg-transparent px-1.5 shadow-none'
                  )}
                >
                  {user?.freeTrial
                    ? <><span className="h-1.5 w-1.5 rounded-full bg-amber-500" />Trial {remainingDays !== null ? `${remainingDays}d` : ''}<span className="hidden group-hover:inline ml-0.5 text-[10px] opacity-70">Upgrade</span></>
                    : user?.unlimited
                      ? <><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />Unlimited {remainingDays !== null ? `${remainingDays}d` : ''}<span className="hidden group-hover:inline ml-0.5 text-[10px] opacity-70">Extend</span></>
                      : <><span className="h-1.5 w-1.5 rounded-full bg-destructive" />Generate terkunci<span className="hidden group-hover:inline ml-0.5 text-[10px] opacity-70">Upgrade</span></>
                  }
                </NavLink>
                {bannerMessages.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setBannerOpen(true)}
                    className={cn(
                      'relative flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium transition-all hover:shadow-sm',
                      'border-red-400/30 bg-red-500/10 text-red-400 hover:bg-red-500/20',
                      !floatingHeader && 'lg:hidden',
                    )}
                  >
                    <Bell className="h-3 w-3" />
                    <span className="hidden sm:inline">Baru</span>
                    {bannerMessages.filter(m => !dismissedBanners.has(m.id)).length > 0 && (
                      <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 text-[8px] font-bold text-white">{bannerMessages.filter(m => !dismissedBanners.has(m.id)).length}</span>
                    )}
                  </button>
                )}
              </div>
            )}
            {!floatingHeader && <ThemeToggle />}
            {headerContent && <div className={cn(floatingHeader && 'flex items-center justify-center rounded-xl border border-border/60 bg-background/70 p-0.5 shadow-lg backdrop-blur-xl')}>{headerContent}</div>}
          </div>
        </div>
      </header>
      
      <main className={cn('mx-auto max-w-7xl px-3 sm:px-5 lg:px-8', floatingHeader ? 'pb-6 pt-20 sm:pb-8 sm:pt-20' : 'py-6 sm:py-8')}>
        {sessionError && <p className="mb-4 rounded-xl border border-destructive bg-destructive/10 p-3 text-sm text-destructive-foreground">{sessionError}</p>}
        {children}
      </main>

      <Dialog open={bannerOpen} onOpenChange={setBannerOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Bell className="h-4 w-4 text-red-400" />
              Info & Update Terbaru
            </DialogTitle>
            <DialogClose onClose={() => setBannerOpen(false)} />
          </DialogHeader>
          <div className="space-y-2">
            {bannerMessages.map(m => (
              <div key={m.id} className={cn('flex items-start gap-3 rounded-xl border p-3 transition-colors', dismissedBanners.has(m.id) ? 'border-border bg-muted/30 opacity-50' : 'border-border bg-card hover:bg-muted/50')}>
                <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-red-500/10">
                  {m.icon === 'gift' ? <Gift className="h-3.5 w-3.5 text-red-400" /> : m.icon === 'zap' ? <Zap className="h-3.5 w-3.5 text-amber-500" /> : m.icon === 'mic' ? <Mic className="h-3.5 w-3.5 text-red-400" /> : m.icon === 'star' ? <Star className="h-3.5 w-3.5 text-amber-400" /> : <Bell className="h-3.5 w-3.5 text-red-400" />}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm leading-relaxed">{m.text}</p>
                </div>
                {dismissedBanners.has(m.id) ? (
                  <button type="button" onClick={() => { const next = new Set(dismissedBanners); next.delete(m.id); setDismissedBanners(next); localStorage.setItem('dismissedBanners', JSON.stringify([...next])) }} className="shrink-0 text-[10px] text-muted-foreground hover:text-foreground">Tampilkan</button>
                ) : (
                  <button type="button" onClick={() => { const next = new Set(dismissedBanners); next.add(m.id); setDismissedBanners(next); localStorage.setItem('dismissedBanners', JSON.stringify([...next])) }} className="shrink-0 text-[10px] text-muted-foreground hover:text-foreground">Sembunyikan</button>
                )}
              </div>
            ))}
            {bannerMessages.length === 0 && (
              <div className="py-8 text-center text-sm text-muted-foreground">Belum ada update terbaru.</div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function AdminLayout({ children, title = 'Admin console', nav }: { children: ReactNode; title?: string; nav?: ReactNode }) {
  const { logout } = useAuth()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const linkGroups = [
    { label: 'Overview', items: [
      { to: '/admin/dashboard', label: 'Dashboard', icon: ChartNoAxesCombined },
    ]},
    { label: 'Pool', items: [
      { to: '/admin/signup', label: 'Signup', icon: UserPlus },
      { to: '/admin/keys', label: 'Keys', icon: KeyRound },
    ]},
    { label: 'Users', items: [
      { to: '/admin/users', label: 'Users', icon: Users },
    ]},
    { label: 'Content', items: [
      { to: '/admin/gallery', label: 'Gallery', icon: Images },
      { to: '/admin/references', label: 'References', icon: Image },
    ]},
    { label: 'Finance', items: [
      { to: '/admin/payments', label: 'Payments', icon: CircleDollarSign },
      { to: '/admin/plans', label: 'Plans', icon: Tag },
      { to: '/admin/vouchers', label: 'Vouchers', icon: Ticket },
    ]},
    { label: 'System', items: [
      { to: '/admin/queue', label: 'Queue', icon: ListTodo },
      { to: '/admin/settings', label: 'Settings', icon: Settings },
      { to: '/admin/audit', label: 'Audit', icon: ClipboardList },
      { to: '/admin/backups', label: 'Backups', icon: Archive },
    ]},
  ]

  useEffect(() => { setOpen(false) }, [location.pathname])

  const navigation = (
    <>
      {linkGroups.map((group) => (
        <div key={group.label} className="space-y-1">
          <p className="px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">{group.label}</p>
          {group.items.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => cn('flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground', isActive && 'bg-primary/15 text-primary')}>
              <span className="grid h-7 w-7 place-items-center rounded-md"><Icon className="h-3.5 w-3.5" /></span>
              {label}
            </NavLink>
          ))}
        </div>
      ))}
    </>
  )

  return (
    <div className="min-h-screen overflow-x-hidden bg-background lg:pl-64">
      {/* Desktop Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-50 hidden w-64 flex-col border-r bg-card p-4 lg:flex">
        <div className="flex items-center gap-3 px-2 py-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-muted">
            <Sparkles className="h-5 w-5 text-foreground" />
          </div>
          <div>
            <p className="text-sm font-semibold leading-none">Piksel</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{title}</p>
          </div>
        </div>
        <nav className="mt-6 flex flex-1 flex-col gap-1 min-h-0 overflow-y-auto">{navigation}</nav>
        <div className="space-y-2 border-t pt-4">
          <Button variant="ghost" onClick={logout} className="w-full justify-start text-muted-foreground hover:text-foreground">
            <LogOut className="h-4 w-4" /> Logout
          </Button>
        </div>
      </aside>
      
      {/* Mobile Sidebar Overlay */}
      {open && <button aria-label="Close menu overlay" onClick={() => setOpen(false)} className="fixed inset-0 z-[60] border-0 bg-black/65 backdrop-blur-sm lg:hidden" />}
      
      {/* Mobile Sidebar */}
      <aside className={cn('fixed inset-y-0 left-0 z-[70] flex w-[18rem] max-w-[86vw] flex-col border-r bg-card p-4 shadow-lg transition-transform duration-300 lg:hidden', open ? 'translate-x-0' : '-translate-x-full')}>
        <div className="flex items-center justify-between px-2 py-3">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-muted">
              <Sparkles className="h-5 w-5 text-foreground" />
            </div>
            <div>
              <p className="text-sm font-semibold">Piksel</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{title}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close menu"><X className="h-5 w-5" /></Button>
        </div>
        <nav className="mt-5 flex flex-1 flex-col gap-1 min-h-0 overflow-y-auto">{navigation}</nav>
        <div className="space-y-2 border-t pt-4">
          <Button variant="ghost" onClick={logout} className="w-full justify-start text-muted-foreground hover:text-foreground">
            <LogOut className="h-4 w-4" /> Logout
          </Button>
        </div>
      </aside>
      
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-xl lg:ml-0">
        <div className="flex items-center justify-between gap-3 px-3 py-3 sm:px-5 lg:px-8">
          {/* Left: Mobile menu button only */}
          <div className="flex shrink-0 items-center gap-3">
            <Button variant="outline" size="icon" onClick={() => setOpen(true)} className="lg:hidden" aria-label="Open admin menu">
              <Menu className="h-5 w-5" />
            </Button>
            <div className="lg:hidden">
              <p className="text-sm font-semibold leading-none">Piksel</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{title}</p>
            </div>
            {/* Desktop: Show current page title */}
            <div className="hidden lg:block">
              <p className="text-sm font-medium text-muted-foreground">{title}</p>
            </div>
          </div>
          
          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            {nav}
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={logout} className="text-muted-foreground hover:text-foreground hidden sm:flex">
              <LogOut className="h-4 w-4" />
              <span className="ml-2 hidden lg:inline">Logout</span>
            </Button>
          </div>
        </div>
      </header>
      
      <main className="mx-auto max-w-7xl px-3 py-6 sm:px-5 sm:py-8 lg:px-8">
        {children}
      </main>
    </div>
  )
}
