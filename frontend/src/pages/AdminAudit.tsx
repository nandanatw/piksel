import { useEffect, useState } from 'react'
import { FileClock, Filter, RefreshCw, ShieldCheck, Users } from 'lucide-react'
import { AdminLayout } from '../components/Layout'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'

interface AuditItem { id: string; actor?: string; email?: string; action: string; targetType?: string | null; targetId?: string | null; metadata: unknown; ip?: string; userAgent?: string; createdAt: string }

export default function AdminAudit() {
  const [tab, setTab] = useState<'admin' | 'user'>('admin')
  const [items, setItems] = useState<AuditItem[]>([])
  const [filter, setFilter] = useState('')
  const [appliedFilter, setAppliedFilter] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const limit = 50

  useEffect(() => {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) })
    if (appliedFilter) params.set(tab === 'admin' ? 'action' : 'email', appliedFilter)
    const url = tab === 'admin' ? `/api/admin/audit?${params}` : `/api/admin/user-activity?${params}`
    fetch(url, { credentials: 'include' }).then(r => r.ok ? r.json() : { items: [], total: 0 }).then(d => { setItems(d.items || []); setTotal(d.total || 0) })
  }, [page, appliedFilter, tab])

  function changeTab(next: 'admin' | 'user') { setTab(next); setPage(1); setFilter(''); setAppliedFilter('') }
  function applyFilter() { setPage(1); setAppliedFilter(filter.trim()) }
  const pages = Math.max(1, Math.ceil(total / limit))

  return <AdminLayout><div className="space-y-6">
    <div><p className="text-sm font-medium text-primary">Accountability</p><h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Activity & audit logs</h1><p className="mt-2 text-sm text-muted-foreground">Review administrative changes and each user's product activity.</p></div>
    <div className="flex flex-wrap gap-2"><Button className="min-h-11 flex-1 sm:flex-none" variant={tab === 'admin' ? 'default' : 'outline'} onClick={() => changeTab('admin')}><ShieldCheck className="h-4 w-4" /> Admin actions</Button><Button className="min-h-11 flex-1 sm:flex-none" variant={tab === 'user' ? 'default' : 'outline'} onClick={() => changeTab('user')}><Users className="h-4 w-4" /> User activity</Button></div>
    <Card><CardContent className="flex flex-col gap-2 p-3 sm:flex-row sm:p-4"><Input className="min-h-11" value={filter} onChange={e => setFilter(e.target.value)} onKeyDown={e => e.key === 'Enter' && applyFilter()} placeholder={tab === 'admin' ? 'Exact action, e.g. user.suspension' : 'Search user email'} /><div className="grid grid-cols-2 gap-2 sm:flex"><Button className="min-h-11" onClick={applyFilter}><Filter className="h-4 w-4" /> Filter</Button><Button className="min-h-11" variant="outline" onClick={() => { setFilter(''); setAppliedFilter(''); setPage(1) }}><RefreshCw className="h-4 w-4" /> Clear</Button></div></CardContent></Card>
    <Card><CardContent className="p-0"><div className="hidden overflow-x-auto md:block"><Table><TableHeader><TableRow><TableHead>Time</TableHead><TableHead>Action</TableHead><TableHead>{tab === 'admin' ? 'Actor / IP' : 'User / IP'}</TableHead><TableHead>{tab === 'admin' ? 'Target' : 'Device'}</TableHead><TableHead>Metadata</TableHead></TableRow></TableHeader><TableBody>{!items.length && <TableRow><TableCell colSpan={5} className="h-28 text-center text-muted-foreground"><FileClock className="mx-auto mb-2 h-6 w-6" />No entries found.</TableCell></TableRow>}{items.map(item => <TableRow key={`${tab}-${item.id}`}><TableCell className="whitespace-nowrap text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</TableCell><TableCell><Badge variant="outline">{item.action}</Badge></TableCell><TableCell><div className="max-w-56 truncate text-sm">{item.actor || item.email || '-'}</div><div className="text-xs text-muted-foreground">{item.ip || '-'}</div></TableCell><TableCell>{tab === 'admin' ? <><div className="text-xs">{item.targetType || '-'}</div><div className="max-w-48 truncate font-mono text-xs text-muted-foreground">{item.targetId || '-'}</div></> : <div className="max-w-52 truncate text-xs text-muted-foreground" title={item.userAgent}>{item.userAgent || '-'}</div>}</TableCell><TableCell><code className="block max-w-72 truncate text-xs text-muted-foreground" title={JSON.stringify(item.metadata)}>{item.metadata ? JSON.stringify(item.metadata) : '-'}</code></TableCell></TableRow>)}</TableBody></Table></div><div className="space-y-2 p-3 md:hidden">{!items.length && <div className="py-10 text-center text-sm text-muted-foreground"><FileClock className="mx-auto mb-2 h-6 w-6" />No entries found.</div>}{items.map(item => <article key={`mobile-${tab}-${item.id}`} className="rounded-xl border border-border bg-muted/20 p-3"><div className="flex items-start justify-between gap-3"><Badge variant="outline" className="max-w-[68%] truncate">{item.action}</Badge><time className="shrink-0 text-[10px] text-muted-foreground">{new Date(item.createdAt).toLocaleDateString()}</time></div><div className="mt-3 grid gap-2 text-xs"><div><span className="text-muted-foreground">{tab === 'admin' ? 'Actor' : 'User'}:</span> <span className="break-words font-medium">{item.actor || item.email || '-'}</span></div><div><span className="text-muted-foreground">IP:</span> {item.ip || '-'}</div><div><span className="text-muted-foreground">{tab === 'admin' ? 'Target' : 'Device'}:</span> <span className="break-words">{tab === 'admin' ? `${item.targetType || '-'} · ${item.targetId || '-'}` : item.userAgent || '-'}</span></div><code className="max-h-16 overflow-hidden break-all text-[10px] text-muted-foreground">{item.metadata ? JSON.stringify(item.metadata) : '-'}</code></div></article>)}</div></CardContent></Card>
    <div className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between"><span>{total.toLocaleString()} entries</span><div className="flex items-center justify-between gap-2 sm:justify-end"><Button variant="outline" size="sm" className="min-h-10" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button><span>{page} / {pages}</span><Button variant="outline" size="sm" className="min-h-10" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next</Button></div></div>
  </div></AdminLayout>
}
