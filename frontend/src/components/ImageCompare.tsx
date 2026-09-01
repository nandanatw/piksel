import { useState } from 'react'
import { X, Columns2 } from 'lucide-react'
import { Button } from './ui/button'

interface CompareImage {
  url: string
  label: string
}

export default function ImageCompare({ images, onClose }: { images: CompareImage[]; onClose: () => void }) {
  const [left, setLeft] = useState(0)
  const [right, setRight] = useState(Math.min(1, images.length - 1))

  if (images.length < 2) return null

  return (
    <div className="fixed inset-0 z-[9999] bg-black/95 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <Columns2 className="h-5 w-5 text-white" />
          <span className="text-sm font-medium text-white">Bandingkan Gambar</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-1">
            {images.map((_, i) => (
              <button key={i} onClick={() => { setLeft(i); setRight(Math.min(i + 1, images.length - 1)) }} className="h-1.5 rounded-full transition-all w-5 bg-white/30 hover:bg-white/60" />
            ))}
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-white/80 hover:text-white" onClick={onClose}><X className="h-5 w-5" /></Button>
        </div>
      </div>
      <div className="flex-1 flex gap-0.5">
        <div className="flex-1 flex flex-col items-center justify-center p-2">
          <img src={images[left]?.url} className="max-h-full max-w-full object-contain" />
          <span className="mt-2 text-xs text-white/60">{images[left]?.label || `Hasil ${left + 1}`}</span>
        </div>
        <div className="w-0.5 bg-white/20" />
        <div className="flex-1 flex flex-col items-center justify-center p-2">
          <img src={images[right]?.url} className="max-h-full max-w-full object-contain" />
          <span className="mt-2 text-xs text-white/60">{images[right]?.label || `Hasil ${right + 1}`}</span>
        </div>
      </div>
    </div>
  )
}