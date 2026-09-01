import { useState, useEffect, type FormEvent } from 'react'
import { Edit2, Plus, Save, Trash2, Eye, EyeOff, Clock, Coins } from 'lucide-react'
import { AdminLayout } from '../components/Layout'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Badge } from '../components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { Label } from '../components/ui/label'
import { Textarea } from '../components/ui/textarea'

interface Plan {
  id: number
  slug: string
  name: string
  duration_days: number
  price_idr: number
  compare_at_idr: number | null
  badge: string | null
  description: string
  features: string[]
  sort_order: number
  is_active: boolean
}

const formatMoney = (v: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(v)
const defaultForm = { slug: '', name: '', durationDays: 1, priceIdr: 0, compareAtIdr: '', badge: '', description: '', features: '', sortOrder: 0, isActive: true }

export default function AdminPlans() {
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [dialog, setDialog] = useState<'create' | 'edit' | 'delete' | null>(null)
  const [form, setForm] = useState(defaultForm)
  const [editingSlug, setEditingSlug] = useState('')
  const [deleteSlug, setDeleteSlug] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const r = await fetch('/api/admin/plans', { credentials: 'include' })
      setPlans(await r.json())
    } catch (_) {}
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  function openCreate() {
    setForm(defaultForm)
    setDialog('create')
  }

  function openEdit(plan: Plan) {
    setEditingSlug(plan.slug)
    setForm({
      slug: plan.slug,
      name: plan.name,
      durationDays: plan.duration_days,
      priceIdr: plan.price_idr,
      compareAtIdr: plan.compare_at_idr ? String(plan.compare_at_idr) : '',
      badge: plan.badge || '',
      description: plan.description,
      features: plan.features.join('\n'),
      sortOrder: plan.sort_order,
      isActive: plan.is_active,
    })
    setDialog('edit')
  }

  function openDelete(slug: string) {
    setDeleteSlug(slug)
    setDialog('delete')
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    const body = {
      ...form,
      durationDays: Number(form.durationDays),
      priceIdr: Number(form.priceIdr),
      compareAtIdr: form.compareAtIdr ? Number(form.compareAtIdr) : null,
      sortOrder: Number(form.sortOrder),
      features: form.features.split('\n').filter(Boolean),
    }
    try {
      const url = dialog === 'create' ? '/api/admin/plans' : `/api/admin/plans/${editingSlug}`
      const method = dialog === 'create' ? 'POST' : 'PUT'
      const r = await fetch(url, { method, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      if (!r.ok) throw new Error((await r.json()).error || 'Failed')
      setDialog(null)
      load()
    } catch (err: any) {
      alert(err.message)
    }
    setBusy(false)
  }

  async function remove() {
    setBusy(true)
    await fetch(`/api/admin/plans/${deleteSlug}`, { method: 'DELETE', credentials: 'include' })
    setDialog(null)
    load()
    setBusy(false)
  }

  return (
    <AdminLayout title="Plans">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Daftar Paket</h2>
          <p className="text-sm text-muted-foreground">{plans.length} paket</p>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4" />Tambah Paket</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nama</TableHead>
                <TableHead>Durasi</TableHead>
                <TableHead>Harga</TableHead>
                <TableHead>Coret</TableHead>
                <TableHead>Badge</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-20">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Memuat...</TableCell></TableRow>
              ) : plans.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="py-8 text-center text-muted-foreground">Belum ada paket</TableCell></TableRow>
              ) : (
                plans.map((plan) => (
                  <TableRow key={plan.id}>
                    <TableCell>
                      <div className="font-medium">{plan.name}</div>
                      <div className="text-xs text-muted-foreground">{plan.slug}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1"><Clock className="h-3.5 w-3.5 text-muted-foreground" />{plan.duration_days} hari</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1"><Coins className="h-3.5 w-3.5 text-muted-foreground" />{formatMoney(plan.price_idr)}</div>
                    </TableCell>
                    <TableCell>
                      {plan.compare_at_idr ? <span className="text-muted-foreground line-through">{formatMoney(plan.compare_at_idr)}</span> : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      {plan.badge ? <Badge variant="outline">{plan.badge}</Badge> : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      {plan.is_active ? <Badge variant="default" className="gap-1"><Eye className="h-3 w-3" />Aktif</Badge> : <Badge variant="secondary" className="gap-1"><EyeOff className="h-3 w-3" />Nonaktif</Badge>}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(plan)}><Edit2 className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => openDelete(plan.slug)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialog === 'create' || dialog === 'edit'} onOpenChange={() => setDialog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{dialog === 'create' ? 'Tambah Paket' : 'Edit Paket'}</DialogTitle>
            <DialogDescription>{dialog === 'create' ? 'Buat paket unlimited baru.' : `Edit paket ${editingSlug}.`}</DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4">
            {dialog === 'create' && (
              <div className="space-y-2">
                <Label htmlFor="slug">Slug</Label>
                <Input id="slug" required placeholder="unlimited_1d" value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })} />
              </div>
            )}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label htmlFor="name">Nama</Label>
                <Input id="name" required placeholder="Unlimited 1 hari" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="durationDays">Durasi (hari)</Label>
                <Input id="durationDays" type="number" required min={1} value={form.durationDays} onChange={e => setForm({ ...form, durationDays: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sortOrder">Urutan</Label>
                <Input id="sortOrder" type="number" value={form.sortOrder} onChange={e => setForm({ ...form, sortOrder: Number(e.target.value) })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="priceIdr">Harga (IDR)</Label>
                <Input id="priceIdr" type="number" required min={0} value={form.priceIdr} onChange={e => setForm({ ...form, priceIdr: Number(e.target.value) })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="compareAtIdr">Harga Coret (IDR)</Label>
                <Input id="compareAtIdr" type="number" min={0} placeholder="Kosongkan jika tidak ada" value={form.compareAtIdr} onChange={e => setForm({ ...form, compareAtIdr: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="badge">Badge</Label>
              <Input id="badge" placeholder="Best value, Image offer, dst" value={form.badge} onChange={e => setForm({ ...form, badge: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Deskripsi</Label>
              <Textarea id="description" rows={2} placeholder="Deskripsi singkat paket" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="features">Fitur (satu per baris)</Label>
              <Textarea id="features" rows={3} placeholder="Akses semua model\nQRIS terverifikasi otomatis" value={form.features} onChange={e => setForm({ ...form, features: e.target.value })} />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="isActive" checked={form.isActive} onChange={e => setForm({ ...form, isActive: e.target.checked })} className="h-4 w-4 rounded border-border" />
              <Label htmlFor="isActive">Aktif</Label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialog(null)}>Batal</Button>
              <Button type="submit" disabled={busy}>{busy ? 'Menyimpan...' : <><Save className="h-4 w-4" />Simpan</>}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'delete'} onOpenChange={() => setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hapus Paket</DialogTitle>
            <DialogDescription>Yakin hapus paket <strong>{deleteSlug}</strong>? Data pembayaran lama tetap aman.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>Batal</Button>
            <Button variant="destructive" onClick={remove} disabled={busy}>{busy ? 'Menghapus...' : 'Hapus'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  )
}