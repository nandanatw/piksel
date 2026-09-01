import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, Eye, EyeOff, Images, Pencil, Search, Star, Trash2, WandSparkles, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Layout } from '../components/Layout'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { Input } from '../components/ui/input'
import { Select } from '../components/ui/select'
import { LoadingImage } from '../components/LoadingImage'
import { cn } from '../lib/utils'

interface Reference {
  id: string; name: string; originalName?: string; mimeType?: string; byteSize: number; createdAt: string
  lastUsedAt?: string; usageCount?: number; isFavorite?: boolean; thumbnailUrl: string; url: string
}

function formatBytes(bytes = 0) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function References() {
  const navigate = useNavigate()
  const [items, setItems] = useState<Reference[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('newest')
  const [preview, setPreview] = useState<Reference | null>(null)
  const [renameTarget, setRenameTarget] = useState<Reference | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [blur, setBlur] = useState(() => localStorage.getItem('refBlur') === 'true')
  const [bannerDismissed, setBannerDismissed] = useState(() => sessionStorage.getItem('refBannerDismissed') === 'true')

  useEffect(() => {
    fetch('/api/references?sort=newest', { credentials: 'include' }).then(async response => {
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Referensi tidak bisa dimuat')
      setItems(data.items || [])
    }).catch(cause => setError(cause instanceof Error ? cause.message : 'Referensi tidak bisa dimuat')).finally(() => setLoading(false))
  }, [])

  const visibleItems = useMemo(() => {
    const term = query.trim().toLowerCase()
    const filtered = term ? items.filter(item => `${item.name} ${item.originalName || ''}`.toLowerCase().includes(term)) : [...items]
    return filtered.sort((a, b) => {
      if (sort === 'oldest') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      if (sort === 'used') return new Date(b.lastUsedAt || 0).getTime() - new Date(a.lastUsedAt || 0).getTime()
      if (sort === 'favorites') return Number(Boolean(b.isFavorite)) - Number(Boolean(a.isFavorite)) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      if (sort === 'name') return a.name.localeCompare(b.name, 'id')
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
  }, [items, query, sort])

  function toggleSelected(id: string) {
    setError('')
    setSelected(previous => {
      if (previous.includes(id)) return previous.filter(itemId => itemId !== id)
      if (previous.length >= 10) { setError('Maksimal 10 referensi dalam satu generate.'); return previous }
      return [...previous, id]
    })
  }

  async function useSelected() {
    if (!selected.length) return
    await fetch('/api/references/use', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ ids: selected }) }).catch(() => null)
    sessionStorage.setItem('referenceDraft', JSON.stringify({ ids: selected }))
    navigate('/generate')
  }

  async function updateReference(id: string, changes: { name?: string; isFavorite?: boolean }) {
    const response = await fetch(`/api/references/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(changes) })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || 'Referensi tidak bisa diperbarui')
    setItems(previous => previous.map(item => item.id === id ? { ...item, ...data.item } : item))
    setPreview(previous => previous?.id === id ? { ...previous, ...data.item } : previous)
  }

  async function toggleFavorite(item: Reference) {
    try { await updateReference(item.id, { isFavorite: !item.isFavorite }) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Favorite tidak bisa diperbarui') }
  }

  function openRename(item: Reference) { setRenameTarget(item); setRenameValue(item.name) }
  async function saveRename() {
    if (!renameTarget || !renameValue.trim()) return
    setSaving(true)
    try { await updateReference(renameTarget.id, { name: renameValue.trim() }); setRenameTarget(null) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Nama referensi tidak bisa diperbarui') }
    finally { setSaving(false) }
  }

  async function remove(id: string) {
    const response = await fetch(`/api/references/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include' })
    if (response.ok) { setItems(previous => previous.filter(item => item.id !== id)); setSelected(previous => previous.filter(item => item !== id)); setPreview(previous => previous?.id === id ? null : previous) }
    else setError('Referensi tidak bisa dihapus')
  }

  return <Layout title="References" subtitle="Reference library">
    <div className={cn('space-y-5 sm:space-y-6', selected.length && 'pb-20 sm:pb-0')}>
      {!bannerDismissed && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <div className="flex-1 space-y-1">
            <p className="font-medium text-amber-200">Beberapa referensi tidak tersedia</p>
            <p className="text-amber-300/80">Gambar referensi yang kamu upload sebelum 27 Agustus 2026 tidak dapat dimuat karena kendala teknis server. Silakan <strong>upload ulang</strong> dari perangkat kamu. Hasil generate tetap aman.</p>
          </div>
          <button onClick={() => { setBannerDismissed(true); sessionStorage.setItem('refBannerDismissed', 'true') }} className="shrink-0 rounded-lg p-1 text-amber-400 hover:bg-amber-500/20 hover:text-amber-200" aria-label="Tutup"><X className="h-4 w-4" /></button>
        </div>
      )}
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><Badge variant="outline" className="mb-3 border-border text-primary"><Images className="mr-1.5 h-3.5 w-3.5" />Asset picker</Badge><h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Referensi tersimpan</h1><p className="mt-2 text-sm text-muted-foreground">Temukan dan pilih bahan visual untuk generate berikutnya.</p></div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => { const next = !blur; setBlur(next); localStorage.setItem('refBlur', String(next)) }} className="h-9 w-9 rounded-full" title={blur ? 'Tampilkan semua' : 'Sembunyikan NSFW'} aria-label={blur ? 'Tampilkan semua' : 'Sembunyikan NSFW'}>{blur ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button>
          <Button onClick={useSelected} disabled={!selected.length} className="hidden sm:inline-flex"><WandSparkles className="h-4 w-4" />Gunakan {selected.length || ''} referensi</Button>
        </div>
      </header>
      <div className="grid gap-2 rounded-2xl border border-border bg-card/60 p-2.5 sm:grid-cols-[minmax(0,1fr)_13rem] sm:p-3">
        <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={event => setQuery(event.target.value)} placeholder="Cari nama referensi..." className="h-10 pl-9" /></div>
        <Select value={sort} onChange={event => setSort(event.target.value)} className="h-10" aria-label="Urutkan referensi"><option value="newest">Terbaru</option><option value="oldest">Terlama</option><option value="used">Terakhir digunakan</option><option value="favorites">Favorit lebih dulu</option><option value="name">Nama A–Z</option></Select>
      </div>
      {error && <p className="rounded-xl border border-destructive bg-destructive/10 p-3 text-sm text-destructive-foreground">{error}</p>}
      {loading ? <div className="grid min-h-48 place-items-center"><div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" /></div> : !items.length ? <Card className="border-dashed py-16 text-center"><CardContent><Images className="mx-auto h-8 w-8 text-primary" /><p className="mt-4 font-semibold">Belum ada referensi</p><p className="mt-2 text-sm text-muted-foreground">Upload gambar referensi pertama dari halaman Generate.</p></CardContent></Card> : !visibleItems.length ? <Card className="border-dashed py-12 text-center"><CardContent><Search className="mx-auto h-6 w-6 text-muted-foreground" /><p className="mt-3 font-semibold">Referensi tidak ditemukan</p></CardContent></Card> : <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{visibleItems.map(item => {
        const selectedIndex = selected.indexOf(item.id), isSelected = selectedIndex >= 0
        return <Card key={item.id} className={cn('group overflow-hidden', isSelected ? 'border-primary ring-2 ring-primary/20' : 'border-border')}>
          <div className="relative aspect-square overflow-hidden bg-muted">
            <button type="button" className="block h-full w-full cursor-zoom-in" onClick={() => setPreview(item)} aria-label={`Preview ${item.name}`}><LoadingImage src={item.thumbnailUrl} fallbackSrc={item.url} alt={item.name || 'Reference image'} className={cn('h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]', blur && 'blur-xl')} /></button>
            <button type="button" onClick={() => toggleSelected(item.id)} className={cn('absolute left-2 top-2 z-[3] grid h-8 min-w-8 place-items-center rounded-full border px-1.5 text-xs font-semibold shadow-sm backdrop-blur', isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-white/70 bg-black/55 text-white')} aria-label={isSelected ? `Batalkan pilihan ${selectedIndex + 1}` : `Pilih ${item.name}`}>{isSelected ? selectedIndex + 1 : <Check className="h-4 w-4" />}</button>
            <button type="button" onClick={() => toggleFavorite(item)} className={cn('absolute right-2 top-2 z-[3] grid h-8 w-8 place-items-center rounded-full border border-white/60 bg-black/55 text-white shadow-sm backdrop-blur', item.isFavorite && 'border-amber-300 bg-amber-400 text-black')} aria-label={item.isFavorite ? 'Hapus dari favorite' : 'Tambahkan ke favorite'}><Star className={cn('h-4 w-4', item.isFavorite && 'fill-current')} /></button>
          </div>
          <CardContent className="space-y-2 p-3"><div><p className="truncate text-xs font-medium" title={item.name}>{item.name || 'Reference image'}</p><p className="mt-1 text-[10px] text-muted-foreground">{formatBytes(item.byteSize)} · dipakai {item.usageCount || 0}×</p></div><div className="flex items-center gap-1"><Button variant={isSelected ? 'default' : 'outline'} size="sm" className="h-8 min-w-0 flex-1 px-2 text-xs" onClick={() => toggleSelected(item.id)}>{isSelected ? `Pilihan ${selectedIndex + 1}` : 'Pilih'}</Button><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setPreview(item)} aria-label="Preview"><Eye className="h-3.5 w-3.5" /></Button><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openRename(item)} aria-label="Ubah nama"><Pencil className="h-3.5 w-3.5" /></Button><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => remove(item.id)} aria-label="Hapus"><Trash2 className="h-3.5 w-3.5" /></Button></div></CardContent>
        </Card>
      })}</div>}
    </div>
    {selected.length > 0 && <div className="fixed inset-x-3 bottom-[max(.75rem,env(safe-area-inset-bottom))] z-50 sm:hidden"><Button onClick={useSelected} className="min-h-12 w-full rounded-xl shadow-2xl"><WandSparkles className="h-4 w-4" />Gunakan {selected.length} referensi</Button></div>}
    <Dialog open={Boolean(preview)} onOpenChange={open => !open && setPreview(null)} className="max-sm:fixed max-sm:inset-0 max-sm:h-[100dvh] max-sm:max-h-none max-sm:max-w-none max-sm:rounded-none max-sm:border-0 sm:max-w-3xl">
      <DialogHeader><DialogTitle>{preview?.name || 'Preview referensi'}</DialogTitle><DialogDescription>{preview ? `${formatBytes(preview.byteSize)} · ${preview.mimeType || 'image'} · ${new Date(preview.createdAt).toLocaleDateString('id-ID')}` : ''}</DialogDescription><DialogClose onClose={() => setPreview(null)} /></DialogHeader>
      {preview && <DialogContent className="space-y-4"><div className="relative min-h-52 overflow-hidden rounded-2xl bg-muted"><LoadingImage src={preview.url} fallbackSrc={preview.thumbnailUrl} alt={preview.name} className={cn('max-h-[65vh] w-full object-contain', blur && 'blur-xl')} /></div><div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span>Dipakai {preview.usageCount || 0} kali{preview.lastUsedAt ? ` · terakhir ${new Date(preview.lastUsedAt).toLocaleDateString('id-ID')}` : ''}</span><div className="flex gap-2"><Button variant={preview.isFavorite ? 'default' : 'outline'} size="sm" onClick={() => toggleFavorite(preview)}><Star className={cn('h-4 w-4', preview.isFavorite && 'fill-current')} />Favorite</Button><Button variant="outline" size="sm" onClick={() => openRename(preview)}><Pencil className="h-4 w-4" />Ubah nama</Button></div></div></DialogContent>}
    </Dialog>
    <Dialog open={Boolean(renameTarget)} onOpenChange={open => !open && setRenameTarget(null)}>
      <DialogHeader><DialogTitle>Ubah nama referensi</DialogTitle><DialogDescription>Nama ini hanya dipakai di library kamu dan tidak dikirim ke provider.</DialogDescription><DialogClose onClose={() => setRenameTarget(null)} /></DialogHeader>
      <DialogContent className="space-y-3"><Input value={renameValue} onChange={event => setRenameValue(event.target.value.slice(0, 120))} onKeyDown={event => event.key === 'Enter' && saveRename()} autoFocus /><div className="flex gap-2"><Button variant="ghost" className="flex-1" onClick={() => setRenameTarget(null)}>Batal</Button><Button className="flex-1" onClick={saveRename} disabled={saving || !renameValue.trim()}>{saving ? 'Menyimpan...' : 'Simpan nama'}</Button></div></DialogContent>
    </Dialog>
  </Layout>
}
