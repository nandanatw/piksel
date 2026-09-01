import { useEffect, useState } from 'react'
import { Layout } from '../components/Layout'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { BarChart3, Sparkles, Check, X, Activity } from 'lucide-react'

interface Stats {
  totalGenerated: number
  last7Days: number
  last30Days: number
  successCount: number
  failedCount: number
  cancelledCount: number
  successRate: number
  byModel: { model: string; total: number }[]
  daily: { date: string; generations: number }[]
}

export default function Usage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/user/stats', { credentials: 'include' })
      .then(r => r.json())
      .then(data => { setStats(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <Layout title="Statistik"><div className="p-8 text-center text-muted-foreground">Memuat...</div></Layout>
  if (!stats) return <Layout title="Statistik"><div className="p-8 text-center text-muted-foreground">Gagal memuat data</div></Layout>

  const maxDaily = Math.max(1, ...stats.daily.map(d => d.generations))

  return (
    <Layout title="Statistik">
      <div className="space-y-6 p-4 sm:p-6 max-w-4xl mx-auto">
        <div>
          <h2 className="text-lg font-semibold">Statistik Generasi</h2>
          <p className="text-sm text-muted-foreground">Ringkasan aktivitas generate kamu</p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total</p><p className="text-2xl font-bold">{stats.totalGenerated}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">7 hari</p><p className="text-2xl font-bold">{stats.last7Days}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">30 hari</p><p className="text-2xl font-bold">{stats.last30Days}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Sukses rate</p><p className="text-2xl font-bold">{stats.successRate}%</p></CardContent></Card>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Card className="border-emerald-400/30"><CardContent className="p-4 flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-500/10"><Check className="h-5 w-5 text-emerald-500" /></div><div><p className="text-xs text-muted-foreground">Sukses</p><p className="text-xl font-bold">{stats.successCount}</p></div></CardContent></Card>
          <Card className="border-destructive/30"><CardContent className="p-4 flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-destructive/10"><X className="h-5 w-5 text-destructive" /></div><div><p className="text-xs text-muted-foreground">Gagal</p><p className="text-xl font-bold">{stats.failedCount}</p></div></CardContent></Card>
          <Card><CardContent className="p-4 flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-muted"><Activity className="h-5 w-5 text-muted-foreground" /></div><div><p className="text-xs text-muted-foreground">Batal</p><p className="text-xl font-bold">{stats.cancelledCount}</p></div></CardContent></Card>
        </div>

        {stats.daily.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="h-4 w-4" />14 Hari Terakhir</CardTitle></CardHeader>
            <CardContent>
              <div className="flex items-end gap-1 h-32">
                {stats.daily.map(d => (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[10px] text-muted-foreground">{d.generations || ''}</span>
                    <div className="w-full rounded-t bg-primary/60 hover:bg-primary transition" style={{ height: `${Math.max(4, (d.generations / maxDaily) * 100)}%` }} title={`${d.date}: ${d.generations} generasi`} />
                    <span className="text-[10px] text-muted-foreground">{new Date(d.date).getDate()}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {stats.byModel.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Sparkles className="h-4 w-4" />Model Terpakai</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {stats.byModel.map(m => (
                  <div key={m.model} className="flex items-center gap-3">
                    <span className="text-sm flex-1">{m.model}</span>
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full bg-primary" style={{ width: `${(m.total / Math.max(1, stats.byModel[0].total)) * 100}%` }} />
                    </div>
                    <span className="text-xs text-muted-foreground w-8 text-right">{m.total}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  )
}