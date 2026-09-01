import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { Button } from './ui/button'
import { Checkbox } from './ui/checkbox'

export default function TosModal() {
  const { user, refresh, logout } = useAuth()
  const [agreed, setAgreed] = useState(false)
  const [busy, setBusy] = useState(false)

  if (!user || user.role === 'admin' || user.tosAccepted) return null

  const accept = async () => {
    if (!agreed || busy) return
    setBusy(true)
    try {
      const r = await fetch('/api/auth/accept-tos', { method: 'POST', credentials: 'include' })
      if (r.ok) await refresh()
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-foreground">Persetujuan Penggunaan Layanan</h2>
        <p className="mt-1 text-sm text-muted-foreground">Harap baca dan setujui ketentuan berikut sebelum menggunakan Piksel.</p>

        <div className="mt-4 space-y-3 rounded-xl border border-border bg-muted/30 p-4 text-sm text-foreground">
          <p>Dengan mengakses dan menggunakan Piksel, Anda menyetujui ketentuan berikut:</p>
          <ol className="ml-5 list-decimal space-y-2.5">
            <li>
              <strong>Kredit Awal.</strong> Setiap pengguna baru akan menerima kredit awal untuk mencoba layanan image generation. Kredit ini dapat berubah sewaktu-waktu tanpa pemberitahuan terlebih dahulu.
            </li>
            <li>
              <strong>Konten Buatan Pengguna.</strong> Seluruh konten gambar yang Anda hasilkan melalui platform ini adalah tanggung jawab penuh Anda. Piksel tidak bertanggung jawab atas konten yang melanggar hak cipta, melanggar hukum, atau menyinggung pihak mana pun.
            </li>
            <li>
              <strong>Pembatasan Tanggung Jawab.</strong> Piksel tidak bertanggung jawab atas kerugian langsung, tidak langsung, insidental, atau konsekuensial yang timbul dari penggunaan atau ketidakmampuan menggunakan layanan ini.
            </li>
            <li>
              <strong>Hak Penolakan Layanan.</strong> Piksel berhak menangguhkan atau menghentikan akses akun Anda apabila ditemukan pelanggaran terhadap ketentuan ini.
            </li>
          </ol>
        </div>

        <div className="mt-4 flex items-start gap-3">
          <Checkbox id="tos-agree" checked={agreed} onCheckedChange={v => setAgreed(Boolean(v))} className="mt-0.5" />
          <label htmlFor="tos-agree" className="text-sm text-muted-foreground cursor-pointer">
            Saya telah membaca dan menyetujui ketentuan di atas.
          </label>
        </div>

        <div className="mt-5 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={logout}>Tolak & Keluar</Button>
          <Button className="flex-1" disabled={!agreed || busy} onClick={accept}>
            {busy ? 'Menyimpan...' : 'Setuju & Lanjutkan'}
          </Button>
        </div>
      </div>
    </div>
  )
}