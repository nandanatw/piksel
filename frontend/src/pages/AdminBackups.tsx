import { useCallback, useEffect, useState } from 'react'
import { Archive, DatabaseBackup, Loader2, RefreshCw } from 'lucide-react'
import { AdminLayout } from '../components/Layout'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'

interface Backup { id: string; status: string; archivePath: string | null; byteSize: number | string | null; error: string | null; createdBy: string | null; createdAt: string; finishedAt: string | null }
const size = (value: Backup['byteSize']) => value == null ? '-' : `${(Number(value) / 1024 / 1024).toFixed(2)} MB`

export default function AdminBackups() {
  const [items, setItems] = useState<Backup[]>([])
  const [creating, setCreating] = useState(false)
  const [message, setMessage] = useState('')
  const refresh = useCallback(() => fetch('/api/admin/backups', { credentials: 'include' }).then(r => r.ok ? r.json() : []).then(setItems), [])
  useEffect(() => { refresh(); const timer = window.setInterval(refresh, 15000); return () => window.clearInterval(timer) }, [refresh])
  async function create() { setCreating(true); const res = await fetch('/api/admin/backups', { method: 'POST', credentials: 'include' }); const d = await res.json().catch(() => ({})); setMessage(res.ok ? `Backup ${d.id} started.` : d.error || 'Unable to start backup'); setCreating(false); refresh() }
  return <AdminLayout><div className="space-y-6">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="text-sm font-medium text-primary">Data protection</p><h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Backups</h1><p className="mt-2 text-sm text-muted-foreground">Create and inspect storage archives. Restore operations are intentionally not available here.</p></div><div className="flex gap-2"><Button variant="outline" size="icon" onClick={refresh}><RefreshCw className="h-4 w-4" /></Button><Button onClick={create} disabled={creating}>{creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <DatabaseBackup className="h-4 w-4" />} Create backup</Button></div></div>
    {message && <div className="rounded-xl border border-border bg-primary/10 p-3 text-sm text-muted-foreground">{message}</div>}
    <Card><CardContent className="p-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Status</TableHead><TableHead>Backup</TableHead><TableHead>Size</TableHead><TableHead>Created</TableHead><TableHead>Finished</TableHead><TableHead>Error</TableHead></TableRow></TableHeader><TableBody>{!items.length && <TableRow><TableCell colSpan={6} className="h-28 text-center text-muted-foreground"><Archive className="mx-auto mb-2 h-6 w-6" />No backup runs.</TableCell></TableRow>}{items.map(item => <TableRow key={item.id}><TableCell><Badge variant={item.status === 'completed' ? 'success' : item.status === 'failed' ? 'error' : 'warning'}>{item.status}</Badge></TableCell><TableCell><div className="font-mono text-xs">{item.id}</div><div className="max-w-72 truncate text-xs text-muted-foreground" title={item.archivePath || ''}>{item.archivePath || '-'}</div></TableCell><TableCell>{size(item.byteSize)}</TableCell><TableCell className="whitespace-nowrap text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</TableCell><TableCell className="whitespace-nowrap text-xs text-muted-foreground">{item.finishedAt ? new Date(item.finishedAt).toLocaleString() : '-'}</TableCell><TableCell className="max-w-60 truncate text-xs text-muted-foreground" title={item.error || ''}>{item.error || '-'}</TableCell></TableRow>)}</TableBody></Table></div></CardContent></Card>
  </div></AdminLayout>
}
