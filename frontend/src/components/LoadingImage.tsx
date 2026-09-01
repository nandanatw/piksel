import { useEffect, useRef, useState, type ImgHTMLAttributes } from 'react'
import { ImageOff, LoaderCircle } from 'lucide-react'
import { cn } from '../lib/utils'

interface LoadingImageProps extends ImgHTMLAttributes<HTMLImageElement> {
  fallbackSrc?: string
  loaderClassName?: string
}

export function LoadingImage({ src, fallbackSrc, className, loaderClassName, alt = '', ...props }: LoadingImageProps) {
  const [displaySrc, setDisplaySrc] = useState(src)
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading')
  const previousSrc = useRef(src)

  useEffect(() => {
    // Do not reset the initial load: cached images can fire onLoad before this
    // effect runs, which would otherwise leave the loader visible forever.
    if (previousSrc.current === src) return
    previousSrc.current = src
    setDisplaySrc(src)
    setStatus('loading')
  }, [src])

  return <>
    {status !== 'loaded' && <span className={cn('pointer-events-none absolute inset-0 z-[1] grid place-items-center bg-muted/90 text-muted-foreground', loaderClassName)} role="status" aria-label={status === 'error' ? 'Gambar tidak dapat dimuat' : 'Memuat gambar'}>
      {status === 'error' ? <ImageOff className="h-5 w-5" /> : <LoaderCircle className="h-5 w-5 animate-spin text-primary" />}
    </span>}
    <img
      {...props}
      src={displaySrc}
      alt={alt}
      className={cn('transition-opacity duration-200', status === 'loaded' ? 'opacity-100' : 'opacity-0', className)}
      onLoad={() => setStatus('loaded')}
      onError={() => {
        if (fallbackSrc && displaySrc !== fallbackSrc) {
          setDisplaySrc(fallbackSrc)
          setStatus('loading')
          return
        }
        setStatus('error')
      }}
    />
  </>
}
