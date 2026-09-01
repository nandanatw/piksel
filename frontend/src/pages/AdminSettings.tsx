import { useEffect, useState } from 'react'
import { CheckCircle2, FlaskConical, Loader2, Save, Settings as SettingsIcon, Download, Upload, History, Search, AlertCircle, XCircle, Clock } from 'lucide-react'
import { AdminLayout } from '../components/Layout'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Badge } from '../components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog'
import { ScrollArea } from '../components/ui/scroll-area'
import { Alert, AlertDescription } from '../components/ui/alert'

const groups = [
  { title: 'Database & Auth', keys: ['DATABASE_URL', 'DATABASE_SSL', 'DB_POOL_MAX', 'JWT_SECRET', 'ADMIN_PASSWORD', 'TOTP_SECRET', 'BASE_URL', 'TRUST_PROXY'] },
  { title: 'Telegram Login', keys: ['TELEGRAM_BOT_USERNAME', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CLIENT_ID', 'TELEGRAM_CLIENT_SECRET', 'TELEGRAM_REDIRECT_URI', 'TELEGRAM_AUTH_MAX_AGE_SECONDS'] },
  { title: 'Email & Payments', keys: ['GMAIL_USER', 'GMAIL_APP_PASSWORD', 'EMAIL_PREFIX', 'BREVO_API_KEY', 'BREVO_SENDER', 'PAKASIR_API_KEY', 'PAKASIR_PROJECT', 'PAKASIR_WEBHOOK_SECRET'] },
  { title: 'Help & WhatsApp', keys: ['WHATSAPP_DEVELOPER_NUMBER', 'WHATSAPP_CHANNEL_URL'] },
  { title: 'Access Control', keys: ['ALLOWED_EMAIL_DOMAINS'] },
  { title: 'Security & Abuse', keys: ['TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY'] },
  { title: 'Capacity & Limits', keys: ['MAX_CONCURRENT_GENERATIONS', 'MAX_QUEUED_GENERATIONS', 'MAX_USER_GENERATIONS', 'MAX_DAILY_GENERATIONS', 'MAX_PAID_DAILY_GENERATIONS', 'API_RATE_LIMIT_PER_MINUTE', 'AUTH_RATE_LIMIT_PER_15_MINUTES', 'GENERATION_RATE_LIMIT_PER_MINUTE', 'MAX_UPLOAD_BYTES', 'JSON_BODY_LIMIT', 'CREDIT_REFRESH_INTERVAL_MS', 'MAX_FREE_ACCOUNTS_PER_IP'] },
]

type ToastType = 'success' | 'error' | 'info'

export default function AdminSettings() {
  const [meta, setMeta] = useState<Record<string, { configured: boolean; secret: boolean; maskedValue?: string }>>({})
  const [metadata, setMetadata] = useState<Record<string, { lastModified: string; lastAction: string }>>({})
  const [values, setValues] = useState<Record<string, string>>({})
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null)
  const [testing, setTesting] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [history, setHistory] = useState<any[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  useEffect(() => { 
    fetch('/api/admin/settings', { credentials: 'include' })
      .then(r => r.json())
      .then(data => {
        setMeta(data.settings || data)
        setMetadata(data.metadata || {})
      })
    loadHistory()
  }, [])

  useEffect(() => {
    setHasUnsavedChanges(Object.keys(values).some(k => values[k]?.trim()))
  }, [values])

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasUnsavedChanges])

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [toast])

  const showToast = (message: string, type: ToastType = 'info') => {
    setToast({ message, type })
  }

  async function loadHistory() {
    const res = await fetch('/api/admin/settings/history?limit=50', { credentials: 'include' })
    const data = await res.json()
    setHistory(data.history || [])
  }

  async function save() {
    const data = Object.fromEntries(Object.entries(values).filter(([, value]) => value.trim()))
    const res = await fetch('/api/admin/settings', { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    const result = await res.json()
    
    if (result.error) {
      showToast(result.error, 'error')
    } else {
      showToast('Settings saved successfully', 'success')
      if (result.settings) setMeta(result.settings)
      if (result.metadata) setMetadata(result.metadata)
    }
    
    setValues({})
    setHasUnsavedChanges(false)
    loadHistory()
  }

  async function test(feature: string) {
    setTesting(feature)
    showToast('Testing ' + feature + '...', 'info')
    const res = await fetch('/api/admin/settings/test', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ feature }) })
    const result = await res.json()
    
    if (result.ok) {
      showToast(`✓ ${feature}: ${result.results?.map((item: { message: string }) => item.message).join(', ')}`, 'success')
    } else {
      showToast(`✗ ${feature}: ${result.error}`, 'error')
    }
    setTesting('')
  }

  async function exportSettings() {
    const res = await fetch('/api/admin/settings/export', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' } })
    const result = await res.json()
    if (result.ok) {
      const blob = new Blob([JSON.stringify(result.settings, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `settings-${new Date().toISOString().split('T')[0]}.json`
      a.click()
      URL.revokeObjectURL(url)
      showToast('Settings exported successfully', 'success')
    } else {
      showToast('Export failed: ' + result.error, 'error')
    }
  }

  async function importSettings(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const imported = JSON.parse(text)
      const res = await fetch('/api/admin/settings/import', { 
        method: 'POST', 
        credentials: 'include', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ settings: imported }) 
      })
      const result = await res.json()
      if (result.ok) {
        showToast(`Import successful: ${result.changes?.length || 0} settings updated`, 'success')
        if (result.settings) setMeta(result.settings)
        if (result.metadata) setMetadata(result.metadata)
        loadHistory()
      } else {
        showToast('Import failed: ' + result.error, 'error')
      }
    } catch (err) {
      showToast('Import failed: Invalid JSON file', 'error')
    }
    e.target.value = ''
  }

  const getLastModified = (groupKeys: string[]) => {
    const dates = groupKeys.map(key => metadata[key]?.lastModified).filter(Boolean)
    if (dates.length === 0) return null
    return new Date(Math.max(...dates.map(d => new Date(d).getTime())))
  }

  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)
    
    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  const featureForGroup: Record<string, string | undefined> = { 'Database & Auth': 'database', 'Telegram Login': 'telegram', 'Email & Payments': 'email', 'Security & Abuse': 'turnstile', 'Capacity & Limits': 'capacity' }

  const filteredGroups = groups.map(group => ({
    ...group,
    keys: group.keys.filter(key => 
      !searchQuery || key.toLowerCase().includes(searchQuery.toLowerCase())
    )
  })).filter(group => group.keys.length > 0)

  return (
    <AdminLayout>
      <div className="mx-auto max-w-4xl space-y-6 p-6">
        <div className="flex items-start gap-4">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/15 ring-1 ring-primary/25">
            <SettingsIcon className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-primary">Configuration</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">System settings</h1>
            <p className="mt-2 text-sm text-muted-foreground">Update runtime configuration and validate connected services.</p>
          </div>
        </div>

        {hasUnsavedChanges && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>You have unsaved changes</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search settings..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
              data-lpignore="true"
              data-form-type="other"
              data-1p-ignore="true"
            />
          </div>
          <div className="flex gap-2">
            <Dialog open={showHistory} onOpenChange={setShowHistory}>
              <DialogTrigger onClick={() => setShowHistory(true)}>
                <Button variant="outline" size="sm">
                  <History className="h-4 w-4" />
                  History
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Settings History</DialogTitle>
                  <DialogDescription>Recent configuration changes</DialogDescription>
                </DialogHeader>
                <ScrollArea className="h-96">
                  {history.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-4">No history available</p>
                  ) : (
                    <div className="space-y-3 pr-4">
                      {history.map((entry, idx) => (
                        <Card key={idx}>
                          <CardHeader className="p-3">
                            <div className="flex items-center justify-between">
                              <CardTitle className="text-xs text-muted-foreground">
                                {new Date(entry.timestamp).toLocaleString()}
                              </CardTitle>
                              <Badge variant="outline" className="text-xs">
                                {entry.changes?.length || 0} changes
                              </Badge>
                            </div>
                          </CardHeader>
                          <CardContent className="p-3 pt-0">
                            <div className="space-y-1">
                              {entry.changes?.map((change: any, i: number) => (
                                <div key={i} className="text-xs">
                                  <span className="font-mono">{change.key}</span>
                                  <Badge variant={change.action === 'deleted' ? 'destructive' : 'default'} className="ml-2 text-[10px]">
                                    {change.action}
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </DialogContent>
            </Dialog>

            <Button variant="outline" size="sm" onClick={exportSettings}>
              <Download className="h-4 w-4" />
              Export
            </Button>

            <label>
              <Button variant="outline" size="sm" asChild>
                <span>
                  <Upload className="h-4 w-4" />
                  Import
                </span>
              </Button>
              <input
                type="file"
                accept=".json"
                className="hidden"
                onChange={importSettings}
              />
            </label>
          </div>
        </div>

        {filteredGroups.map(group => {
          const lastModified = getLastModified(group.keys)
          return (
          <Card key={group.title}>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-base">{group.title}</CardTitle>
                    {lastModified && (
                      <Badge variant="outline" className="text-[10px] gap-1">
                        <Clock className="h-3 w-3" />
                        {formatRelativeTime(lastModified.toISOString())}
                      </Badge>
                    )}
                  </div>
                   <CardDescription className="text-xs">{group.title === 'Database & Auth' ? 'Connection and authentication settings; these generally require a restart.' : group.title === 'Capacity & Limits' ? 'Numeric runtime limits, byte sizes, intervals, free credits, and per-credit pricing.' : `Configure ${group.title.toLowerCase()} settings; test connected services after saving.`}</CardDescription>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {featureForGroup[group.title] && (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => test(featureForGroup[group.title]!)} 
                      disabled={testing === featureForGroup[group.title]}
                    >
                      {testing === featureForGroup[group.title] ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Testing...</> : <><FlaskConical className="h-3.5 w-3.5" /> Test feature</>}
                    </Button>
                  )}
                  {group.title === 'Email & Payments' && (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => test('payments')} 
                      disabled={testing === 'payments'}
                    >
                      {testing === 'payments' ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Testing...</> : <><FlaskConical className="h-3.5 w-3.5" /> Test payments</>}
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {group.keys.map(name => (
                  <div key={name} className="space-y-2">
                    <Label className="text-xs text-muted-foreground flex items-center gap-2">
                      <span className="truncate">{name}</span>
                      {meta[name]?.configured && <Badge variant="success" className="shrink-0 text-[10px]">configured</Badge>}
                    </Label>
                    <Input
                      type={meta[name]?.secret ? 'password' : 'text'}
                      placeholder={meta[name]?.configured ? (meta[name]?.maskedValue || 'Leave blank to keep current') : 'Not configured'}
                      value={values[name] || ''}
                      onChange={e => setValues({ ...values, [name]: e.target.value })}
                      autoComplete="new-password"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck="false"
                      data-lpignore="true"
                      data-form-type="other"
                      data-1p-ignore="true"
                    />
                    {name === 'WHATSAPP_DEVELOPER_NUMBER' && <p className="text-[11px] text-muted-foreground">Contoh: 081234567890, +6281234567890, atau 6281234567890. Nomor harus aktif di WhatsApp.</p>}
                    {name === 'WHATSAPP_CHANNEL_URL' && <p className="text-[11px] text-muted-foreground">Masukkan link saluran WhatsApp, misalnya https://whatsapp.com/channel/...</p>}
                    {name === 'TURNSTILE_SITE_KEY' && <p className="text-[11px] text-muted-foreground">Cloudflare Dashboard → Turnstile → widget untuk domain Piksel. Boleh ditampilkan di browser.</p>}
                    {name === 'TURNSTILE_SECRET_KEY' && <p className="text-[11px] text-muted-foreground">Secret dienkripsi dan tidak pernah dikirim kembali ke browser.</p>}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )})}

        {/* Floating Toast */}
        {toast && (
          <div className="fixed right-4 top-20 z-50 animate-in slide-in-from-top-2 duration-300">
            <Alert className={`min-w-[300px] shadow-lg ${
              toast.type === 'success' ? 'border-success/50 bg-success/10' : 
              toast.type === 'error' ? 'border-error/50 bg-error/10' : 
              'border-primary/40 bg-primary/10'
            }`}>
              {toast.type === 'success' && <CheckCircle2 className="h-4 w-4 text-success" />}
              {toast.type === 'error' && <XCircle className="h-4 w-4 text-error" />}
              {toast.type === 'info' && <AlertCircle className="h-4 w-4 text-primary" />}
              <AlertDescription className={
                toast.type === 'success' ? 'text-success' : 
                toast.type === 'error' ? 'text-error' : 
                'text-foreground'
              }>
                {toast.message}
              </AlertDescription>
            </Alert>
          </div>
        )}

        <div className="flex flex-col gap-3">
          <Button onClick={save} className="w-full sm:w-auto" disabled={!hasUnsavedChanges}>
            <Save className="w-4 h-4" /> Save Settings
          </Button>
        </div>
      </div>
    </AdminLayout>
  )
}
