import { useState, useEffect, useCallback } from 'react'
import { Search, Trash2, AlertTriangle, RefreshCw, ChevronLeft, ChevronRight, Check, X, Eye, EyeOff } from 'lucide-react'
import { AdminLayout } from '../components/Layout'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Badge } from '../components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { Select } from '../components/ui/select'
import { LoadingImage } from '../components/LoadingImage'
import { cn, brokenImg } from '../lib/utils'

interface RefItem {
  id: string
  ownerEmail: string
  name: string
  originalName: string
  mimeType: string
  byteSize: number
  usageCount: number
  lastUsedAt: string | null
  createdAt: string
  deletedAt: string | null
  deletedBy: string | null
  batchId: string | null
  isFavorite: boolean
  url: string
  thumbnailUrl: string
}

interface Stats {
  total: number
  active: number
  deleted: number
  orphan: number
  totalBytes: number
}

const formatBytes = (b: number) => {
  if (b < 1024) return `${b} B`
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`
  if (b < 1073741824) return `${(b / 1048576).toFixed(1)} MB`
  return `${(b / 1073741824).toFixed(1)} GB`
}

export default function AdminReferences() {
  const [items, setItems] = useState<RefItem[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [deleted, setDeleted] = useState('active')
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<Stats | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [blur, setBlur] = useState(() => localStorage.getItem('adminRefBlur') === 'true')
  const [preview, setPreview] = useState<RefItem | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<{ permanent: boolean } | null>(null)
  const [busy, setBusy] = useState(false)
  const limit = 50

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page), limit: String(limit), q: query, deleted })
    const [refRes, statsRes] = await Promise.all([
      fetch(`/api/admin/references?${params}`, { credentials: 'include' }),
      fetch('/api/admin/references/stats', { credentials: 'include' }),
    ])
    if (refRes.ok) {
      const data = await refRes.json()
      setItems(data.items)
      setTotal(data.total)
    }
    if (statsRes.ok) setStats(await statsRes.json())
    setLoading(false)
  }, [page, query, deleted])

  useEffect(() => { load() }, [load])

  function toggle(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  function toggleAll() {
    if (selected.size === items.length) setSelected(new Set())
    else setSelected(new Set(items.map(i => i.id)))
  }

  async function bulkDelete(permanent: boolean) {
    setBusy(true)
    await fetch('/api/admin/references/bulk-delete', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [...selected], permanent }),
    })
    setSelected(new Set())
    setConfirmDelete(null)
    load()
    setBusy(false)
  }

  async function cleanup(type: string) {
    if (!confirm(`Yakin hapus referensi ${type === 'orphan' ? 'orphan (user tidak ada)' : 'tidak terpakai > 30 hari'}? Ini permanen.`)) return
    setBusy(true)
    await fetch('/api/admin/references/cleanup', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type }),
    })
    load()
    setBusy(false)
  }

  return (
    <AdminLayout title="References">
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
        {stats && (
          <>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total</p><p className="text-xl font-bold">{stats.total}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Aktif</p><p className="text-xl font-bold">{stats.active}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Storage</p><p className="text-xl font-bold">{formatBytes(stats.totalBytes)}</p></CardContent></Card>
            <Card className={stats.orphan > 0 ? 'border-destructive/50' : ''}><CardContent className="p-4"><p className="text-xs text-muted-foreground">Orphan</p><p className={cn("text-xl font-bold", stats.orphan > 0 && 'text-destructive')}>{stats.orphan}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Deleted</p><p className="text-xl font-bold">{stats.deleted}</p></CardContent></Card>
          </>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <form onSubmit={e => { e.preventDefault(); setPage(1); setQuery(search) }} className="flex gap-2">
          <Input placeholder="Cari email atau nama..." value={search} onChange={e => setSearch(e.target.value)} className="w-64" />
          <Button type="submit" variant="outline" size="icon"><Search className="h-4 w-4" /></Button>
        </form>
        <Select value={deleted} onChange={e => { setPage(1); setDeleted(e.target.value) }}>
          <option value="active">Aktif</option>
          <option value="only">Dihapus</option>
          <option value="all">Semua</option>
        </Select>
        <div className="flex-1" />
        {selected.size > 0 && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setConfirmDelete({ permanent: false })} disabled={busy}><Trash2 className="h-3.5 w-3.5" />Soft Delete ({selected.size})</Button>
            <Button variant="destructive" size="sm" onClick={() => setConfirmDelete({ permanent: true })} disabled={busy}><Trash2 className="h-3.5 w-3.5" />Hapus Permanen ({selected.size})</Button>
          </div>
        )}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => cleanup('orphan')} disabled={busy || !stats?.orphan}><AlertTriangle className="h-3.5 w-3.5" />Bersihkan Orphan</Button>
          <Button variant="outline" size="sm" onClick={() => cleanup('unused')} disabled={busy}><RefreshCw className="h-3.5 w-3.5" />Bersihkan Unused 30d</Button>
          <Button variant="ghost" size="sm" onClick={() => { const next = !blur; setBlur(next); localStorage.setItem('adminRefBlur', String(next)) }} title={blur ? 'Tampilkan gambar' : 'Blur gambar'}>{blur ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}{blur ? ' Unblur' : ' Blur'}</Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"><input type="checkbox" checked={selected.size === items.length && items.length > 0} onChange={toggleAll} className="h-4 w-4" /></TableHead>
                <TableHead className="w-14">Preview</TableHead>
                <TableHead>Nama</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Ukuran</TableHead>
                <TableHead>Digunakan</TableHead>
                <TableHead>Tanggal</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Memuat...</TableCell></TableRow>
              ) : items.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="py-8 text-center text-muted-foreground">Tidak ada referensi</TableCell></TableRow>
              ) : items.map(item => (
                <TableRow key={item.id} className={item.deletedAt ? 'opacity-60' : ''}>
                  <TableCell><input type="checkbox" checked={selected.has(item.id)} onChange={() => toggle(item.id)} className="h-4 w-4" /></TableCell>
                  <TableCell>
                    <button type="button" onClick={() => setPreview(item)} className="h-10 w-10 overflow-hidden rounded border">
                      <LoadingImage src={item.thumbnailUrl} fallbackSrc={brokenImg()} alt={item.name} className={cn('h-full w-full object-cover', blur && 'blur-xl')} />
                    </button>
                  </TableCell>
                  <TableCell>
                    <div className="max-w-48 truncate font-medium text-sm">{item.name}</div>
                    <div className="max-w-48 truncate text-[11px] text-muted-foreground">{item.originalName}</div>
                  </TableCell>
                  <TableCell className="text-sm">{item.ownerEmail}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{formatBytes(item.byteSize)}</TableCell>
                  <TableCell className="text-sm">{item.usageCount}×</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{new Date(item.createdAt).toLocaleDateString('id')}</TableCell>
                  <TableCell>
                    {item.deletedAt ? (
                      <Badge variant="secondary" className="gap-1"><X className="h-3 w-3" />Dihapus</Badge>
                    ) : item.isFavorite ? (
                      <Badge variant="default" className="gap-1"><Check className="h-3 w-3" />Favorite</Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1"><Check className="h-3 w-3" />Aktif</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {total > limit && (
        <div className="mt-4 flex items-center justify-center gap-4">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="text-sm text-muted-foreground">Hal {page} dari {Math.ceil(total / limit)}</span>
          <Button variant="outline" size="sm" disabled={page >= Math.ceil(total / limit)} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      )}

      <Dialog open={!!preview} onOpenChange={() => setPreview(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{preview?.name}</DialogTitle>
            <DialogDescription>{preview?.ownerEmail} · {preview && formatBytes(preview.byteSize)} · {preview?.mimeType}</DialogDescription>
          </DialogHeader>
          <div className="flex justify-center">
            <img src={preview?.url} alt={preview?.name} className={cn('max-h-[70vh] rounded-lg object-contain', blur && 'blur-xl')} />
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmDelete} onOpenChange={() => setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmDelete?.permanent ? 'Hapus Permanen' : 'Soft Delete'}</DialogTitle>
            <DialogDescription>
              {confirmDelete?.permanent
                ? `Yakin hapus permanen ${selected.size} referensi? File akan dihapus dari disk.`
                : `Soft delete ${selected.size} referensi? Bisa direstore manual dari DB.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Batal</Button>
            <Button variant={confirmDelete?.permanent ? 'destructive' : 'default'} onClick={() => bulkDelete(confirmDelete?.permanent ?? false)} disabled={busy}>{busy ? 'Menghapus...' : 'Hapus'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  )
}