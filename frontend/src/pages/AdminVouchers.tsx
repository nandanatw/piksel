import { useEffect, useState } from 'react'
import { AdminLayout } from '../components/Layout'
import { Card, CardContent } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Select } from '../components/ui/select'
import { Badge } from '../components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { Plus, Trash2 } from 'lucide-react'

interface Voucher {
  id: number
  code: string
  plan_slug: string
  duration_days: number
  max_uses: number
  used_count: number
  is_active: boolean
  created_at: string
}

interface Plan { slug: string; name: string; duration_days: number }

export default function AdminVouchers() {
  const [vouchers, setVouchers] = useState<Voucher[]>([])
  const [plans, setPlans] = useState<Plan[]>([])
  const [code, setCode] = useState('')
  const [planSlug, setPlanSlug] = useState('')
  const [durationDays, setDurationDays] = useState(30)
  const [maxUses, setMaxUses] = useState(1)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    const [v, p] = await Promise.all([
      fetch('/api/admin/vouchers', { credentials: 'include' }).then(r => r.json()),
      fetch('/api/plans', { credentials: 'include' }).then(r => r.json()),
    ])
    setVouchers(v)
    setPlans(p)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function create() {
    if (!code || !planSlug) return
    await fetch('/api/admin/vouchers', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code.toUpperCase(), planSlug, durationDays, maxUses }),
    })
    setCode(''); setPlanSlug(''); setDurationDays(30); setMaxUses(1)
    load()
  }

  async function remove(id: number) {
    await fetch(`/api/admin/vouchers/${id}`, { method: 'DELETE', credentials: 'include' })
    load()
  }

  return (
    <AdminLayout title="Vouchers">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Daftar Voucher</h2>
          <p className="text-sm text-muted-foreground">{vouchers.length} voucher</p>
        </div>
      </div>

      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <label className="text-xs font-medium">Kode</label>
              <Input placeholder="SHOPEE30" value={code} onChange={e => setCode(e.target.value.toUpperCase())} className="w-32" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Plan</label>
              <Select value={planSlug} onChange={e => setPlanSlug(e.target.value)} className="w-40">
                <option value="">Pilih plan</option>
                {plans.map(p => <option key={p.slug} value={p.slug}>{p.name}</option>)}
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Hari</label>
              <Input type="number" value={durationDays} onChange={e => setDurationDays(Number(e.target.value))} className="w-20" />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Max pakai</label>
              <Input type="number" value={maxUses} onChange={e => setMaxUses(Number(e.target.value))} className="w-20" />
            </div>
            <Button onClick={create}><Plus className="h-4 w-4" />Buat</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kode</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Durasi</TableHead>
                <TableHead>Terpakai</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-16">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Memuat...</TableCell></TableRow>
              ) : vouchers.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Belum ada voucher</TableCell></TableRow>
              ) : vouchers.map(v => (
                <TableRow key={v.id}>
                  <TableCell><code className="text-sm font-mono bg-muted px-1.5 py-0.5 rounded">{v.code}</code></TableCell>
                  <TableCell className="text-sm">{v.plan_slug.replace(/_/g, ' ')}</TableCell>
                  <TableCell className="text-sm">{v.duration_days} hari</TableCell>
                  <TableCell className="text-sm">{v.used_count}/{v.max_uses}</TableCell>
                  <TableCell>{v.used_count >= v.max_uses ? <Badge variant="secondary">Habis</Badge> : v.is_active ? <Badge variant="default">Aktif</Badge> : <Badge variant="outline">Nonaktif</Badge>}</TableCell>
                  <TableCell><Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => remove(v.id)}><Trash2 className="h-3.5 w-3.5" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </AdminLayout>
  )
}