import { useCallback, useEffect, useState } from 'react'
import { Activity, CircleDollarSign, HardDrive, KeyRound, RefreshCw, Users } from 'lucide-react'
import { AdminLayout } from '../components/Layout'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { cn } from '../lib/utils'

interface DashboardData {
  users: { total: number; suspended: number; credits: number }
  tasks: { queued: number; running: number; done: number; failed: number; cancelled: number }
  payments: { total: number; completed: number; revenue: number | string }
  keys: { total: number; healthy: number; unhealthy: number }
  gallery: { results: number }
  queue: { queued: Array<{ taskId: string }>; active: number; maxConcurrent: number; maxQueued: number }
  disk: { total: number; used: number; available: number; usedPercent: number; imagesSize: number; imagesCount: number; refsSize: number; refsCount: number }
}

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

const formatNumber = (value: number | string | undefined) => Number(value || 0).toLocaleString()

export default function AdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/dashboard', { credentials: 'include' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'Unable to load dashboard')
      setData(body)
      setUpdatedAt(new Date())
      setError('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load dashboard')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const timer = window.setInterval(refresh, 10000) // Reduced from 30s to 10s
    return () => window.clearInterval(timer)
  }, [refresh])

  const metrics = [
    { label: 'Users', value: data?.users.total, prefix: '', detail: `${formatNumber(data?.users.credits)} credits`, icon: Users },
    { label: 'Active tasks', value: (data?.tasks.running || 0) + (data?.tasks.queued || 0), prefix: '', detail: `${formatNumber(data?.tasks.done)} completed`, icon: Activity },
    { label: 'Revenue', value: data?.payments.revenue, prefix: 'Rp ', detail: `${formatNumber(data?.payments.completed)} paid orders`, icon: CircleDollarSign },
    { label: 'Stored results', value: data?.gallery.results, prefix: '', detail: 'Gallery records', icon: HardDrive },
  ]

  return <AdminLayout>
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div><p className="text-sm font-medium text-primary">Control center</p><h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Admin dashboard</h1><p className="mt-2 text-sm text-muted-foreground">Live health, capacity, storage, and commercial signals.</p></div>
        <div className="flex items-center gap-3"><span className="text-xs text-muted-foreground">{updatedAt ? `Updated ${updatedAt.toLocaleTimeString()}` : 'Not updated'}</span><Button variant="outline" size="sm" onClick={refresh} disabled={loading}><RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} /> Refresh</Button></div>
      </div>
      {error && <div className="rounded-xl border border-destructive bg-destructive/10 p-3 text-sm text-destructive-foreground">{error}</div>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(({ label, value, prefix, detail, icon: Icon }) => <Card key={label} className="overflow-hidden"><CardContent className="flex items-center justify-between p-5"><div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold text-foreground">{loading && !data ? '...' : `${prefix}${formatNumber(value)}`}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div><div className="grid h-11 w-11 place-items-center rounded-lg bg-muted"><Icon className="h-5 w-5" /></div></CardContent></Card>)}</div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><Activity className="h-4 w-4 text-foreground" /> Task & queue health</CardTitle><CardDescription>Runtime pressure and persisted outcomes.</CardDescription></CardHeader><CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-5">{[['Queued', data?.tasks.queued], ['Running', data?.tasks.running], ['Done', data?.tasks.done], ['Failed', data?.tasks.failed], ['Cancelled', data?.tasks.cancelled]].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-muted/50 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold">{formatNumber(value as number)}</p></div>)}<div className="col-span-2 rounded-xl border border-border bg-muted/50 p-3 text-sm sm:col-span-5">Workers: <strong>{formatNumber(data?.queue.active)}</strong> / {formatNumber(data?.queue.maxConcurrent)} active. Queue: <strong>{formatNumber(data?.queue.queued?.length)}</strong> / {formatNumber(data?.queue.maxQueued)} slots.</div></CardContent></Card>
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-foreground" /> Key health</CardTitle><CardDescription>Provider credential readiness.</CardDescription></CardHeader><CardContent className="space-y-3"><div className="flex items-center justify-between rounded-xl bg-muted/50 p-4"><span>Total keys</span><strong>{formatNumber(data?.keys.total)}</strong></div><div className="flex items-center justify-between rounded-xl bg-muted/50 p-4"><span>Healthy</span><Badge variant="success">{formatNumber(data?.keys.healthy)}</Badge></div><div className="flex items-center justify-between rounded-xl bg-muted/50 p-4"><span>Unhealthy</span><Badge variant={data?.keys.unhealthy ? 'error' : 'success'}>{formatNumber(data?.keys.unhealthy)}</Badge></div></CardContent></Card>
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><CircleDollarSign className="h-4 w-4 text-foreground" /> Payments</CardTitle></CardHeader><CardContent className="grid grid-cols-3 gap-3"><div className="rounded-xl bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Orders</p><p className="mt-1 text-xl font-semibold">{formatNumber(data?.payments.total)}</p></div><div className="rounded-xl bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Completed</p><p className="mt-1 text-xl font-semibold">{formatNumber(data?.payments.completed)}</p></div><div className="rounded-xl bg-muted/50 p-3"><p className="text-xs text-muted-foreground">Revenue</p><p className="mt-1 truncate text-lg font-semibold">Rp {formatNumber(data?.payments.revenue)}</p></div></CardContent></Card>
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><HardDrive className="h-4 w-4 text-foreground" /> Storage & disk</CardTitle></CardHeader><CardContent className="space-y-2">
            {data?.disk ? <>
              <div className="rounded-xl bg-muted/50 p-3">
                <div className="flex items-center justify-between text-xs mb-1"><span className="text-muted-foreground">Disk VPS</span><span className="font-medium">{data.disk.usedPercent}%</span></div>
                <div className="h-2 rounded-full bg-muted overflow-hidden"><div className={cn('h-full rounded-full transition-all', data.disk.usedPercent > 85 ? 'bg-destructive' : data.disk.usedPercent > 65 ? 'bg-warning' : 'bg-primary')} style={{ width: `${Math.min(100, data.disk.usedPercent)}%` }} /></div>
                <div className="flex justify-between mt-1 text-[10px] text-muted-foreground"><span>{formatBytes(data.disk.used)} terpakai</span><span>{formatBytes(data.disk.total)} total</span></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-muted/50 p-2.5"><p className="text-[10px] text-muted-foreground">Generated images</p><p className="text-xs font-medium">{formatBytes(data.disk.imagesSize)} · {formatNumber(data.disk.imagesCount)} files</p></div>
                <div className="rounded-xl bg-muted/50 p-2.5"><p className="text-[10px] text-muted-foreground">References</p><p className="text-xs font-medium">{formatBytes(data.disk.refsSize)} · {formatNumber(data.disk.refsCount)} files</p></div>
              </div>
            </> : <div className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">Disk stats unavailable</div>}
            <div className="flex items-center justify-between rounded-xl bg-muted/50 p-3"><span>Image results</span><strong>{formatNumber(data?.gallery.results)}</strong></div>
            <div className="flex items-center justify-between rounded-xl bg-muted/50 p-3"><span>Suspended users</span><Badge variant={data?.users.suspended ? 'warning' : 'success'}>{formatNumber(data?.users.suspended)}</Badge></div>
          </CardContent></Card>
      </div>
    </div>
  </AdminLayout>
}
