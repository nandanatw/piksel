import { useEffect } from "react"
import { createPortal } from "react-dom"
import { X, Copy, RotateCcw, Lock, Globe2, Download, ExternalLink, User } from "lucide-react"
import { Button } from "./ui/button"

interface ImageDetailProps {
  open: boolean
  url: string
  prompt: string
  model?: string
  ratio?: string
  resolution?: string
  isPublic?: boolean
  isAdmin?: boolean
  ownerEmail?: string
  taskId?: string
  blur?: boolean
  metadata?: { label: string; value: string }[]
  referenceImages?: { url: string; thumbnailUrl?: string; name?: string; mimeType?: string; byteSize?: number }[]
  onClose: () => void
  onCopyPrompt?: () => void
  onRecreate?: () => void
  onToggleVisibility?: () => void
}

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`
  if (b < 1073741824) return `${(b / 1048576).toFixed(1)} MB`
  return `${(b / 1073741824).toFixed(1)} GB`
}

export default function ImageDetailModal(props: ImageDetailProps) {
  const { open, url, prompt, model, ratio, resolution, isPublic, isAdmin, ownerEmail, taskId, blur, metadata, referenceImages, onClose, onCopyPrompt, onRecreate, onToggleVisibility } = props

  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  function download() {
    const a = document.createElement('a')
    a.href = url
    a.download = `${taskId || 'image'}.png`
    a.click()
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-background flex flex-col" onKeyDown={e => { if (e.key === 'Backspace' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) { e.preventDefault() } }}>
      <div className="flex-shrink-0 border-b bg-card px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold truncate">Detail Gambar</h2>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
            {isAdmin && ownerEmail && <><User className="h-3.5 w-3.5 flex-shrink-0" /><span className="truncate">{ownerEmail}</span></>}
            {model && <span>{model}</span>}
            {ratio && <span>| {ratio}</span>}
            {resolution && <span>| {resolution}</span>}
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg" onClick={onClose}><X className="h-5 w-5" /></Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col lg:flex-row h-full">
          <div className="flex-1 flex items-center justify-center bg-black/90 p-4 min-h-[40vh]">
            <img src={url} className={`max-h-full max-w-full object-contain ${blur ? "blur-xl" : ""}`} />
          </div>
          <div className="w-full lg:w-80 shrink-0 border-l border-border p-5 space-y-4">
            {prompt && (
              <div>
                <h3 className="text-sm font-semibold mb-2">Prompt</h3>
                <p className={`text-sm whitespace-pre-wrap break-words max-h-48 overflow-y-auto ${blur ? "blur-sm" : ""}`}>{prompt}</p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              {model && <div className="rounded-lg border p-2.5"><p className="text-[10px] text-muted-foreground">Model</p><p className="text-xs font-medium">{model}</p></div>}
              {ratio && <div className="rounded-lg border p-2.5"><p className="text-[10px] text-muted-foreground">Rasio</p><p className="text-xs font-medium">{ratio}</p></div>}
              {resolution && <div className="rounded-lg border p-2.5"><p className="text-[10px] text-muted-foreground">Resolusi</p><p className="text-xs font-medium">{resolution}</p></div>}
              <div className="rounded-lg border p-2.5"><p className="text-[10px] text-muted-foreground">Status</p><p className="text-xs font-medium">{isPublic ? 'Publik' : 'Privat'}</p></div>
            </div>

            {metadata && metadata.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {metadata.map((m, i) => (
                  <div key={i} className="rounded-lg border p-2.5"><p className="text-[10px] text-muted-foreground">{m.label}</p><p className="text-xs font-medium">{m.value}</p></div>
                ))}
              </div>
            )}

            {referenceImages && referenceImages.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-2">Referensi ({referenceImages.length})</h3>
                <div className="grid grid-cols-2 gap-2">
                  {referenceImages.map((ref, i) => (
                    <div key={i} className="space-y-1">
                      <div className="rounded-lg border overflow-hidden bg-muted">
                        <img src={ref.thumbnailUrl || ref.url} alt={ref.name || 'Referensi'} className={`aspect-square w-full object-cover ${blur ? "blur-xl" : ""}`} />
                      </div>
                      <p className="text-[10px] font-medium truncate">{ref.name || 'Referensi'}</p>
                      {ref.byteSize && <p className="text-[10px] text-muted-foreground">{formatBytes(ref.byteSize)}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-shrink-0 border-t bg-card p-4 flex gap-2">
        {isAdmin ? (
          <>
            <Button variant="outline" onClick={() => window.open(url, "_blank")} className="flex-1 min-h-[44px]"><ExternalLink className="h-4 w-4" />Buka original</Button>
            <Button variant="default" onClick={download} className="flex-1 min-h-[44px]"><Download className="h-4 w-4" />Unduh</Button>
          </>
        ) : (
          <>
            {onCopyPrompt && <Button onClick={onCopyPrompt} className="flex-1 min-h-[44px]"><Copy className="h-4 w-4" />Salin prompt</Button>}
            {onRecreate && <Button variant="outline" onClick={onRecreate} className="flex-1 min-h-[44px]"><RotateCcw className="h-4 w-4" />Gunakan</Button>}
            {onToggleVisibility && <Button variant={isPublic ? "outline" : "default"} onClick={onToggleVisibility} className="min-h-[44px]">{isPublic ? <><Lock className="h-4 w-4" />Privat</> : <><Globe2 className="h-4 w-4" />Publik</>}</Button>}
          </>
        )}
      </div>
    </div>,
    document.body
  )
}