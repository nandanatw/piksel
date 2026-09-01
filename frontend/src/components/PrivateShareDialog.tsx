import { useEffect, useState } from 'react'
import { Check, Copy, Eye, Link2, ShieldCheck, Trash2 } from 'lucide-react'
import { Button } from './ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog'
import { Select } from './ui/select'

interface ShareItem {
  id: string
  expiresAt: string
  allowDownload: boolean
  viewCount: number
  lastViewedAt?: string | null
  revokedAt?: string | null
  createdAt: string
  active: boolean
}

export function PrivateShareDialog({ taskId, imageUrl, open, onOpenChange }: { taskId?: string; imageUrl?: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [expiresInDays, setExpiresInDays] = useState('7')
  const [allowDownload, setAllowDownload] = useState(false)
  const [items, setItems] = useState<ShareItem[]>([])
  const [shareUrl, setShareUrl] = useState('')
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || !taskId) return
    setError(''); setShareUrl(''); setCopied(false)
    fetch(`/api/results/${encodeURIComponent(taskId)}/shares`, { credentials: 'include' })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Unable to load links'); return data })
      .then(data => setItems(data.items || []))
      .catch(cause => setError(cause instanceof Error ? cause.message : 'Unable to load links'))
  }, [open, taskId])

  async function createLink() {
    if (!taskId || loading) return
    setLoading(true); setError(''); setShareUrl('')
    const response = await fetch(`/api/results/${encodeURIComponent(taskId)}/shares`, {
      method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresInDays: Number(expiresInDays), allowDownload }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) setError(data.error || 'Unable to create link')
    else {
      setShareUrl(data.shareUrl)
      setItems(previous => [{ ...data, active: true, viewCount: 0 }, ...previous])
    }
    setLoading(false)
  }

  async function copyLink() {
    if (!shareUrl) return
    await navigator.clipboard.writeText(shareUrl)
    setCopied(true); window.setTimeout(() => setCopied(false), 1800)
  }

  async function revokeLink(id: string) {
    if (!window.confirm('Cabut akses link ini sekarang?')) return
    const response = await fetch(`/api/shares/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'include' })
    if (!response.ok) { setError('Link tidak dapat dicabut'); return }
    setItems(previous => previous.map(item => item.id === id ? { ...item, active: false, revokedAt: new Date().toISOString() } : item))
  }

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogHeader>
      <DialogTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" />Private Share</DialogTitle>
      <DialogDescription>Link hanya membuka gambar ini. Gambar lain di Gallery tetap private.</DialogDescription>
      <DialogClose onClose={() => onOpenChange(false)} />
    </DialogHeader>
    <DialogContent className="space-y-4">
      {imageUrl && <img src={imageUrl} className="max-h-44 w-full rounded-xl bg-muted object-contain" />}
      <div className="grid gap-3 sm:grid-cols-2">
        <div><label htmlFor="share-expiry" className="text-sm font-medium">Link berlaku</label><Select id="share-expiry" value={expiresInDays} onChange={event => setExpiresInDays(event.target.value)} className="mt-1.5"><option value="1">1 hari</option><option value="7">7 hari</option><option value="30">30 hari</option></Select></div>
        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border p-3 text-sm"><input type="checkbox" checked={allowDownload} onChange={event => setAllowDownload(event.target.checked)} className="h-4 w-4 accent-[var(--primary)]" /><span><span className="block font-medium">Izinkan download</span><span className="text-xs text-muted-foreground">Tampilkan tombol download</span></span></label>
      </div>
      <Button className="w-full" onClick={createLink} disabled={loading}><Link2 className="h-4 w-4" />{loading ? 'Membuat link...' : 'Buat link private'}</Button>
      {shareUrl && <div className="rounded-xl border border-primary/30 bg-primary/10 p-3"><p className="mb-2 text-xs text-muted-foreground">Link baru—salin sekarang karena token tidak ditampilkan lagi setelah dialog ditutup.</p><div className="flex gap-2"><code className="min-w-0 flex-1 truncate rounded-lg bg-background px-3 py-2 text-xs">{shareUrl}</code><Button size="icon" onClick={copyLink} title="Copy link">{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</Button></div></div>}
      {error && <p className="rounded-xl border border-destructive bg-destructive/10 p-3 text-sm text-destructive-foreground">{error}</p>}
      <div className="border-t border-border pt-4"><h3 className="text-sm font-medium">Riwayat link</h3>{items.length === 0 ? <p className="mt-2 text-xs text-muted-foreground">Belum ada link untuk gambar ini.</p> : <div className="mt-2 max-h-48 space-y-2 overflow-y-auto">{items.map(item => <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-border p-3"><div className="min-w-0"><p className="flex items-center gap-1.5 text-xs font-medium"><span className={`h-2 w-2 rounded-full ${item.active ? 'bg-primary' : 'bg-muted-foreground'}`} />{item.active ? 'Aktif' : item.revokedAt ? 'Dicabut' : 'Kedaluwarsa'}</p><p className="mt-1 text-[11px] text-muted-foreground">Berakhir {new Date(item.expiresAt).toLocaleString('id-ID')} · <Eye className="inline h-3 w-3" /> {item.viewCount || 0} view{item.allowDownload ? ' · download aktif' : ''}</p></div>{item.active && <Button variant="ghost" size="icon" onClick={() => revokeLink(item.id)} title="Revoke link" className="shrink-0 text-destructive"><Trash2 className="h-4 w-4" /></Button>}</div>)}</div>}</div>
    </DialogContent>
  </Dialog>
}
