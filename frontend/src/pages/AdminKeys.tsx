import { useState, useEffect } from 'react'
import { cn } from '../lib/utils'
import { Activity, Coins, KeyRound, Loader2, RefreshCw, Trash2, CheckCircle2, ShieldAlert, Download, Upload, Edit2, Save, X, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { AdminLayout } from '../components/Layout'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Badge } from '../components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { Textarea } from '../components/ui/textarea'
import { Label } from '../components/ui/label'

export default function AdminKeys() {
  const [keys, setKeys] = useState<any[]>([])
  const [stats, setStats] = useState<any>(null)
  const [, setTotalCredits] = useState(0)
  const [email, setEmail] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [adding, setAdding] = useState(false)
  const [checking, setChecking] = useState<string | null>(null)
  const [bulkChecking, setBulkChecking] = useState(false)
  const [removing, setRemoving] = useState(false)
  
  // Filters & Search
  const [search, setSearch] = useState('')
  const [healthFilter, setHealthFilter] = useState('all')
  const [sortBy, setSortBy] = useState('created_at')
  const [page, setPage] = useState(1)
  const [limit] = useState(50)
  const [total, setTotal] = useState(0)
  
  // Selection
  const [selectedKeys, setSelectedKeys] = useState<Set<number>>(new Set())
  
  // Edit dialog
  const [editingKey, setEditingKey] = useState<any>(null)
  const [editForm, setEditForm] = useState({ email: '', balance: 0, notes: '', tags: '' })
  
  // Import dialog
  const [showImport, setShowImport] = useState(false)
  const [importText, setImportText] = useState('')
  const [importing, setImporting] = useState(false)
  
  // Auto-refresh
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [refreshInterval] = useState(30)

  useEffect(() => { refresh() }, [search, healthFilter, sortBy, page])
  
  useEffect(() => {
    if (!autoRefresh) return
    const timer = setInterval(refresh, refreshInterval * 1000)
    return () => clearInterval(timer)
  }, [autoRefresh, refreshInterval, search, healthFilter, sortBy, page])

  async function refresh() {
    const params = new URLSearchParams({
      search,
      health: healthFilter,
      sort: sortBy,
      page: String(page),
      limit: String(limit)
    })
    
    const [keysRes, statsRes, creditRes] = await Promise.all([
      fetch(`/api/admin/keys/health?${params}`, { credentials: 'include' }),
      fetch('/api/admin/keys/stats', { credentials: 'include' }),
      fetch('/api/admin/credits', { credentials: 'include' }),
    ])
    
    if (keysRes.ok) {
      const data = await keysRes.json()
      setKeys(data.keys)
      setTotal(data.total)
    }
    if (statsRes.ok) setStats(await statsRes.json())
    if (creditRes.ok) {
      const cd = await creditRes.json()
      setTotalCredits(cd.total)
    }
  }

  async function checkKey(id: number) {
    setChecking(String(id))
    const res = await fetch(`/api/admin/keys/${id}/check`, { method: 'POST', credentials: 'include' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) alert(data.error || 'Key check failed')
    setChecking(null)
    refresh()
  }

  async function refreshCredits() {
    await fetch('/api/pool/refresh-credits', { method: 'POST', credentials: 'include' })
    refresh()
  }

  async function clearPool() {
    if (!confirm('Delete all keys?')) return
    await fetch('/api/pool/clear', { method: 'POST', credentials: 'include' })
    setSelectedKeys(new Set())
    refresh()
  }

  async function addKey() {
    if (!apiKey.trim()) return
    setAdding(true)
    const res = await fetch('/api/pool/keys', { 
      method: 'POST', 
      credentials: 'include', 
      headers: { 'Content-Type': 'application/json' }, 
      body: JSON.stringify({ email: email.trim(), api_key: apiKey.trim() }) 
    })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) alert(d.error || 'Failed to add key')
    else { 
      setEmail('')
      setApiKey('')
      refresh() 
    }
    setAdding(false)
  }

  async function bulkHealthCheck() {
    if (!confirm('Check health of all keys? This may take a while.')) return
    setBulkChecking(true)
    const res = await fetch('/api/pool/health-check-all', { method: 'POST', credentials: 'include' })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) alert(d.error || 'Bulk health check failed')
    else alert(`Checked ${d.checked} keys: ${d.healthy} healthy, ${d.unhealthy} unhealthy`)
    setBulkChecking(false)
    refresh()
  }

  async function removeUnhealthy() {
    if (!confirm('Remove all unhealthy keys (auth/degraded) not checked in 7 days?')) return
    setRemoving(true)
    const res = await fetch('/api/pool/remove-unhealthy', { method: 'POST', credentials: 'include' })
    const d = await res.json().catch(() => ({}))
    if (!res.ok) alert(d.error || 'Failed to remove unhealthy keys')
    else alert(`Removed ${d.removed} unhealthy keys`)
    setRemoving(false)
    refresh()
  }
  
  async function bulkDelete() {
    if (selectedKeys.size === 0) return
    if (!confirm(`Delete ${selectedKeys.size} selected keys?`)) return
    
    const res = await fetch('/api/admin/keys/bulk-delete', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: Array.from(selectedKeys) })
    })
    
    const d = await res.json().catch(() => ({}))
    if (!res.ok) alert(d.error || 'Failed to delete keys')
    else {
      alert(`Deleted ${d.deleted} keys`)
      setSelectedKeys(new Set())
      refresh()
    }
  }
  
  async function exportKeys() {
    window.location.href = '/api/admin/keys/export'
  }
  
  async function importKeys() {
    if (!importText.trim()) return
    setImporting(true)
    
    try {
      const lines = importText.trim().split('\n')
      const keys = []
      
      for (const line of lines) {
        const parts = line.split(',').map(p => p.trim())
        if (parts.length >= 2) {
          keys.push({
            email: parts[0],
            api_key: parts[1],
            notes: parts[2] || '',
            tags: parts[3] ? parts[3].split(';').filter(Boolean) : []
          })
        }
      }
      
      const res = await fetch('/api/admin/keys/import', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys })
      })
      
      const d = await res.json().catch(() => ({}))
      if (!res.ok) alert(d.error || 'Import failed')
      else {
        alert(`Import complete: ${d.success} success, ${d.failed} failed`)
        setShowImport(false)
        setImportText('')
        refresh()
      }
    } catch (e: any) {
      alert('Import failed: ' + e.message)
    }
    
    setImporting(false)
  }
  
  function openEditDialog(key: any) {
    setEditingKey(key)
    setEditForm({
      email: key.email || '',
      balance: key.balance || 0,
      notes: key.notes || '',
      tags: (key.tags || []).join(', ')
    })
  }
  
  async function saveEdit() {
    if (!editingKey) return
    
    const res = await fetch(`/api/admin/keys/${editingKey.id}`, {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: editForm.email,
        balance: parseInt(String(editForm.balance)),
        notes: editForm.notes,
        tags: editForm.tags.split(',').map(t => t.trim()).filter(Boolean)
      })
    })
    
    const d = await res.json().catch(() => ({}))
    if (!res.ok) alert(d.error || 'Update failed')
    else {
      setEditingKey(null)
      refresh()
    }
  }
  
  async function deleteKey(id: number) {
    if (!confirm('Delete this key?')) return
    
    const res = await fetch(`/api/admin/keys/${id}`, {
      method: 'DELETE',
      credentials: 'include'
    })
    
    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      alert(d.error || 'Delete failed')
    } else {
      refresh()
    }
  }
  
  function toggleSelect(id: number) {
    const newSet = new Set(selectedKeys)
    if (newSet.has(id)) newSet.delete(id)
    else newSet.add(id)
    setSelectedKeys(newSet)
  }
  
  function toggleSelectAll() {
    if (selectedKeys.size === keys.length) setSelectedKeys(new Set())
    else setSelectedKeys(new Set(keys.map(k => k.id)))
  }

  const totalPages = Math.ceil(total / limit)

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <p className="text-sm font-medium text-primary">Infrastructure</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Key pool</h1>
          <p className="mt-2 text-sm text-muted-foreground">Manage provider credentials and monitor available generation capacity.</p>
        </div>
        
        {/* Statistics Cards */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="flex items-center gap-4 p-5">
              <KeyRound className="h-8 w-8 text-primary" />
              <div>
                <div className="text-2xl font-semibold">{stats?.total_keys || 0}</div>
                <div className="text-xs text-muted-foreground">Total Keys</div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="flex items-center gap-4 p-5">
              <Coins className="h-8 w-8 text-primary" />
              <div>
                <div className="text-2xl font-semibold">{stats?.total_balance || 0}</div>
                <div className="text-xs text-muted-foreground">Total Balance</div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="flex items-center gap-4 p-5">
              <CheckCircle2 className="h-8 w-8 text-success" />
              <div>
                <div className="text-2xl font-semibold">{stats?.healthy_keys || 0}</div>
                <div className="text-xs text-muted-foreground">Healthy Keys</div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="flex items-center gap-4 p-5">
              <Activity className="h-8 w-8 text-primary" />
              <div>
                <div className="text-2xl font-semibold">{stats?.total_usage || 0}</div>
                <div className="text-xs text-muted-foreground">Total Usage</div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <CardTitle>Key Pool</CardTitle>
                <CardDescription>Add credentials or refresh balances across the pool.</CardDescription>
              </div>
              <div className="flex gap-2 shrink-0 flex-wrap">
                <Button variant="outline" size="icon" onClick={refresh} title="Refresh">
                  <RefreshCw className="w-3.5 h-3.5" />
                </Button>
                <Button variant="outline" size="sm" onClick={refreshCredits}>
                  <Coins className="h-3.5 w-3.5" /> Refresh
                </Button>
                <Button variant="outline" size="sm" onClick={bulkHealthCheck} disabled={bulkChecking}>
                  {bulkChecking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Check All
                </Button>
                <Button variant="outline" size="sm" onClick={removeUnhealthy} disabled={removing} className="text-destructive">
                  {removing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldAlert className="h-3.5 w-3.5" />}
                  Remove Bad
                </Button>
                <Button variant="outline" size="sm" onClick={exportKeys}>
                  <Download className="h-3.5 w-3.5" /> Export
                </Button>
                <Button variant="outline" size="sm" onClick={() => setShowImport(true)}>
                  <Upload className="h-3.5 w-3.5" /> Import
                </Button>
                {selectedKeys.size > 0 && (
                  <Button variant="destructive" size="sm" onClick={bulkDelete}>
                    <Trash2 className="w-3.5 h-3.5" /> Delete ({selectedKeys.size})
                  </Button>
                )}
                <Button variant="outline" size="icon" onClick={clearPool} className="text-destructive hover:bg-destructive/10" title="Clear all">
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </CardHeader>
          
          <CardContent className="space-y-4">
            {/* Add Key Form */}
            <div className="flex flex-col sm:flex-row gap-2">
              <Input 
                type="email" 
                value={email} 
                onChange={e => setEmail(e.target.value)} 
                placeholder="Account email (optional)" 
                className="flex-1"
              />
              <Input 
                type="text" 
                value={apiKey} 
                onChange={e => setApiKey(e.target.value)} 
                placeholder="fk_... API key" 
                className="flex-1 font-mono"
              />
              <Button onClick={addKey} disabled={adding || !apiKey.trim()} className="shrink-0">
                {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Add
              </Button>
            </div>
            
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search by email or ID..."
                  className="pl-9"
                />
              </div>
              
              <select 
                value={healthFilter} 
                onChange={e => setHealthFilter(e.target.value)}
                className="px-3 py-2 rounded-md border border-input bg-background text-sm"
              >
                <option value="all">All Health</option>
                <option value="healthy">Healthy</option>
                <option value="unknown">Unchecked</option>
                <option value="auth">Auth Error</option>
                <option value="degraded">Degraded</option>
              </select>
              
              <select 
                value={sortBy} 
                onChange={e => setSortBy(e.target.value)}
                className="px-3 py-2 rounded-md border border-input bg-background text-sm"
              >
                <option value="created_at">Newest</option>
                <option value="balance_desc">Balance (High)</option>
                <option value="balance_asc">Balance (Low)</option>
                <option value="health">Health Status</option>
                <option value="usage">Usage Count</option>
              </select>
              
              <label className="flex items-center gap-2 px-3 py-2 border rounded-md">
                <input 
                  type="checkbox" 
                  checked={autoRefresh} 
                  onChange={e => setAutoRefresh(e.target.checked)}
                  className="w-4 h-4"
                />
                <span className="text-sm">Auto-refresh</span>
              </label>
            </div>
            
            {/* Table */}
            <div className="overflow-x-auto -mx-6 sm:mx-0">
              <div className="min-w-[800px] px-6 sm:px-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">
                        <input 
                          type="checkbox" 
                          checked={keys.length > 0 && selectedKeys.size === keys.length}
                          onChange={toggleSelectAll}
                          className="w-4 h-4"
                        />
                      </TableHead>
                      <TableHead className="w-8">#</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Key</TableHead>
                      <TableHead>Health</TableHead>
                      <TableHead>Balance</TableHead>
                      <TableHead>Usage</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!keys.length && (
                      <TableRow>
                        <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                          No keys found.
                        </TableCell>
                      </TableRow>
                    )}
                    {keys.map((k, i) => (
                      <TableRow key={k.id} className={cn(k.exhausted && "opacity-40")}>
                        <TableCell>
                          <input 
                            type="checkbox" 
                            checked={selectedKeys.has(k.id)}
                            onChange={() => toggleSelect(k.id)}
                            className="w-4 h-4"
                          />
                        </TableCell>
                        <TableCell>{(page - 1) * limit + i + 1}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          <div>{k.email || 'unknown'}</div>
                          {k.tags && k.tags.length > 0 && (
                            <div className="flex gap-1 mt-1">
                              {k.tags.map((tag: string, idx: number) => (
                                <Badge key={idx} variant="outline" className="text-xs">{tag}</Badge>
                              ))}
                            </div>
                          )}
                          {k.exhausted && <Badge variant="destructive" className="ml-2">EXHAUSTED</Badge>}
                        </TableCell>
                        <TableCell className="font-mono text-xs">ID {k.id}</TableCell>
                        <TableCell>
                          <Badge variant={
                            k.health_status === 'healthy' ? 'default' : 
                            k.health_status === 'unknown' ? 'secondary' : 
                            'destructive'
                          }>
                            {k.health_status || 'unchecked'}
                          </Badge>
                          <div className="mt-1 max-w-48 truncate text-xs text-muted-foreground" title={k.health_message || ''}>
                            {k.health_message || (k.last_checked_at ? new Date(k.last_checked_at).toLocaleString() : 'Never')}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={(k.balance ?? 0) <= 0 ? 'destructive' : k.balance <= 3 ? 'secondary' : 'default'}
                            className="whitespace-nowrap"
                          >
                            {k.balance ?? 0}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{k.usage_count || 0} total</div>
                          <div className="text-xs text-muted-foreground">
                            ✓ {k.success_count || 0} / ✗ {k.error_count || 0}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="max-w-32 truncate text-xs text-muted-foreground" title={k.notes || ''}>
                            {k.notes || '-'}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => checkKey(k.id)} 
                              disabled={checking === String(k.id)}
                            >
                              {checking === String(k.id) ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Activity className="h-3.5 w-3.5" />
                              )}
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => openEditDialog(k)}
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </Button>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => deleteKey(k.id)}
                              className="text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
            
            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  Showing {(page - 1) * limit + 1}-{Math.min(page * limit, total)} of {total}
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <div className="flex items-center px-3 text-sm">
                    Page {page} of {totalPages}
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      
      {/* Edit Dialog */}
      {editingKey && (
        <Dialog open={!!editingKey} onOpenChange={() => setEditingKey(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Key #{editingKey.id}</DialogTitle>
              <DialogDescription>Update key information and metadata.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input 
                  value={editForm.email} 
                  onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                  placeholder="email@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label>Balance</Label>
                <Input 
                  type="number" 
                  value={editForm.balance} 
                  onChange={e => setEditForm({ ...editForm, balance: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea 
                  value={editForm.notes} 
                  onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                  placeholder="Internal notes..."
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label>Tags (comma separated)</Label>
                <Input 
                  value={editForm.tags} 
                  onChange={e => setEditForm({ ...editForm, tags: e.target.value })}
                  placeholder="production, backup, testing"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditingKey(null)}>
                <X className="h-4 w-4 mr-1" /> Cancel
              </Button>
              <Button onClick={saveEdit}>
                <Save className="h-4 w-4 mr-1" /> Save
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
      
      {/* Import Dialog */}
      {showImport && (
        <Dialog open={showImport} onOpenChange={setShowImport}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Import Keys</DialogTitle>
              <DialogDescription>
                Paste keys in CSV format: email,api_key,notes,tags (one per line)
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <Textarea 
                value={importText} 
                onChange={e => setImportText(e.target.value)}
                placeholder="user@example.com,fk_xxx,Production key,prod;main"
                rows={10}
                className="font-mono text-xs"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowImport(false)} disabled={importing}>
                Cancel
              </Button>
              <Button onClick={importKeys} disabled={importing || !importText.trim()}>
                {importing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />}
                Import
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </AdminLayout>
  )
}
