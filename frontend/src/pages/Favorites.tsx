import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Star, Copy, RotateCcw, Trash2, Globe2, Lock } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { brokenImg } from '../lib/utils'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Layout } from '../components/Layout'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog'

interface Result { url: string; thumbnailUrl?: string; prompt: string; model: string; ratio: string; resolution?: string; estimatedCredit: number; taskId: string; timestamp: string; isPublic?: boolean; isFavorite?: boolean }

export default function Favorites() {
  const { user } = useAuth()
  const userLabel = user?.telegramUsername ? `@${user.telegramUsername.replace(/^@/, '')}` : user?.displayName || user?.email
  const navigate = useNavigate()
  const [results, setResults] = useState<Result[]>([])
  const [detail, setDetail] = useState<Result | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    fetch('/api/results/favorites', { credentials: 'include', signal: controller.signal })
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Failed to load favorites')))
      .then(data => setResults(data.items || []))
      .catch(err => { if (!controller.signal.aborted) setError(err.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [])

  async function toggleFavorite(taskId: string) {
    const item = results.find(r => r.taskId === taskId)
    if (!item) return
    
    const next = !item.isFavorite
    setResults(prev => prev.map(r => r.taskId === taskId ? { ...r, isFavorite: next } : r))
    
    const res = await fetch(`/api/results/${taskId}/favorite`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isFavorite: next }),
    })
    
    if (!res.ok) {
      setResults(prev => prev.map(r => r.taskId === taskId ? { ...r, isFavorite: !next } : r))
    }
    
    // Remove from list if unfavorited
    if (!next) {
      setResults(prev => prev.filter(r => r.taskId !== taskId))
    }
  }

  async function copyPrompt(text: string) {
    await navigator.clipboard.writeText(text)
  }

  function recreate(item: Result) {
    sessionStorage.setItem('generationDraft', JSON.stringify({ prompt: item.prompt, model: item.model, ratio: item.ratio, resolution: item.resolution, taskId: item.taskId }))
    navigate('/generate')
  }

  async function deleteResult(taskId: string) {
    if (!confirm('Delete this image?')) return
    await fetch('/api/results/' + taskId, { method: 'DELETE', credentials: 'include' })
    setResults(prev => prev.filter(r => r.taskId !== taskId))
  }

  return (
    <Layout title="Favorites" subtitle="Your starred creations">
      <header className="mb-4 sm:mb-6">
        <Badge variant="outline" className="mb-2 border-border text-primary sm:mb-3">
          <Star className="mr-1.5 h-3.5 w-3.5 fill-current" />
          Favorites
        </Badge>
        <h1 className="text-xl font-semibold sm:text-2xl lg:text-3xl">Your favorite creations</h1>
        <p className="mt-1.5 text-xs text-muted-foreground sm:mt-2 sm:text-sm">
          {results.length} starred images for {userLabel}
        </p>
      </header>

      {error && <p className="mb-4 rounded-xl border border-destructive bg-destructive/10 p-3 text-sm text-destructive-foreground">{error}</p>}

      {loading ? (
        <div className="grid min-h-64 place-items-center">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : results.length === 0 ? (
        <Card className="border-dashed bg-card py-16 text-center">
          <CardContent>
            <Star className="mx-auto h-8 w-8 text-primary" />
            <p className="mt-4 font-semibold">No favorites yet</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Star your best images to find them easily here
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="columns-1 gap-3 sm:columns-2 sm:gap-4 lg:columns-3 xl:columns-4">
          {results.map(item => (
            <Card key={item.taskId} className="mb-3 break-inside-avoid overflow-hidden border-border bg-card sm:mb-4">
              <div className="relative cursor-pointer overflow-hidden bg-muted" onClick={() => setDetail(item)}>
                <img 
                  src={item.thumbnailUrl || item.url} 
                  loading="lazy" 
                  className="aspect-square w-full object-cover transition hover:scale-105" 
                  onError={e => (e.target as HTMLImageElement).src = brokenImg()} 
                />
                <button
                  type="button"
                  aria-label="Unfavorite"
                  onClick={event => { event.stopPropagation(); toggleFavorite(item.taskId) }}
                  className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground"
                >
                  <Star className="h-4 w-4 fill-current" />
                </button>
                <Badge 
                  variant={item.isPublic ? 'success' : 'outline'} 
                  className={`absolute left-3 top-3 backdrop-blur ${item.isPublic ? 'border-success/60 bg-success/15 text-success' : 'border-border bg-card/90 text-foreground'}`}
                >
                  {item.isPublic ? <Globe2 className="mr-1 h-3 w-3" /> : <Lock className="mr-1 h-3 w-3" />}
                  {item.isPublic ? 'Public' : 'Private'}
                </Badge>
              </div>
              <CardContent className="space-y-3 p-4">
                <p className="line-clamp-3 text-sm text-muted-foreground">{item.prompt}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {item.model} | {item.ratio} | {item.estimatedCredit}cr
                </p>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="flex-1 min-h-[44px]" 
                    onClick={() => copyPrompt(item.prompt)}
                  >
                    <Copy className="h-3.5 w-3.5" /> Copy
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="flex-1 min-h-[44px]" 
                    onClick={() => recreate(item)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Use
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={Boolean(detail)} onOpenChange={open => !open && setDetail(null)}>
        <DialogHeader>
          <DialogTitle>Favorite Creation</DialogTitle>
          <DialogDescription>
            {detail?.model} | {detail?.ratio}{detail?.resolution ? ` | ${detail.resolution}` : ''}
          </DialogDescription>
          <DialogClose onClose={() => setDetail(null)} />
        </DialogHeader>
        {detail && (
          <DialogContent className="space-y-4">
            <img 
              src={detail.url} 
              className="max-h-[60vh] w-full rounded-2xl object-contain bg-muted sm:max-h-[55vh]" 
              onError={e => (e.target as HTMLImageElement).src = brokenImg()} 
            />
            <p className="text-sm">{detail.prompt}</p>
            <div className="flex gap-2">
              <Button onClick={() => copyPrompt(detail.prompt)} className="flex-1 min-h-[44px]">
                <Copy className="h-4 w-4" /> Copy prompt
              </Button>
              <Button variant="outline" onClick={() => recreate(detail)} className="flex-1 min-h-[44px]">
                <RotateCcw className="h-4 w-4" /> Recreate
              </Button>
              <Button 
                variant="outline" 
                onClick={() => { deleteResult(detail.taskId); setDetail(null) }} 
                className="min-h-[44px] border-destructive text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </Layout>
  )
}
