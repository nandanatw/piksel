import { useEffect, useState } from 'react'
import { ExternalLink, HelpCircle, MessageCircle, Radio } from 'lucide-react'
import { Layout } from '../components/Layout'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'

interface HelpData { developerNumber: string; developerUrl: string; channelUrl: string }

export default function Help() {
  const [data, setData] = useState<HelpData>({ developerNumber: '', developerUrl: '', channelUrl: '' })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/help', { credentials: 'include' })
      .then(response => response.ok ? response.json() : Promise.reject(new Error('Unable to load help')))
      .then(setData)
      .catch(() => undefined)
      .finally(() => setLoading(false))
  }, [])

  const displayNumber = data.developerNumber
    ? `+${data.developerNumber}`
    : 'Belum tersedia'

  return <Layout title="Help" subtitle="Support & guidance">
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <Badge variant="outline" className="mb-3 border-border text-primary"><HelpCircle className="mr-1.5 h-3.5 w-3.5" />Bantuan</Badge>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Butuh bantuan?</h1>
        <p className="mt-2 text-sm text-muted-foreground">Hubungi tim Kreasya melalui WhatsApp untuk pertanyaan, kendala, atau informasi terbaru.</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><MessageCircle className="h-5 w-5 text-primary" />Developer</CardTitle>
            <CardDescription>Kontak langsung untuk bantuan penggunaan dan kendala akun.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm font-medium">{loading ? 'Memuat...' : displayNumber}</p>
            {data.developerUrl ? <Button asChild className="w-full"><a href={data.developerUrl} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" />Chat WhatsApp</a></Button> : <p className="text-sm text-muted-foreground">Kontak belum diatur oleh admin.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Radio className="h-5 w-5 text-primary" />Saluran WhatsApp</CardTitle>
            <CardDescription>Ikuti kabar, pengumuman, dan pembaruan dari Kreasya.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.channelUrl ? <Button variant="outline" asChild className="w-full"><a href={data.channelUrl} target="_blank" rel="noreferrer"><Radio className="h-4 w-4" />Buka saluran WhatsApp<ExternalLink className="h-4 w-4" /></a></Button> : <p className="text-sm text-muted-foreground">Saluran belum diatur oleh admin.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  </Layout>
}
