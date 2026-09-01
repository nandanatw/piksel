import { useEffect, useState, createContext, useContext, type ReactNode } from 'react'
import { Check, AlertTriangle, Info } from 'lucide-react'
import { cn } from '../lib/utils'

interface ToastItem {
  id: string
  message: string
  type: 'success' | 'error' | 'warning' | 'info'
  duration?: number
}

const ToastContext = createContext<{ toast: (msg: string, type?: ToastItem['type']) => void }>({ toast: () => {} })

export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  function toast(message: string, type: ToastItem['type'] = 'info') {
    const id = Date.now() + Math.random().toString(36)
    setToasts(prev => [...prev.slice(-4), { id, message, type, duration: type === 'error' ? 5000 : 3000 }])
  }

  useEffect(() => {
    if (!toasts.length) return
    const timer = window.setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== toasts[0].id))
    }, toasts[0].duration)
    return () => window.clearTimeout(timer)
  }, [toasts])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-20 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className={cn(
            'pointer-events-auto flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium shadow-lg animate-in slide-in-from-right',
            t.type === 'success' && 'bg-emerald-600 text-white',
            t.type === 'error' && 'bg-destructive text-white',
            t.type === 'warning' && 'bg-amber-500 text-white',
            t.type === 'info' && 'bg-card border text-foreground',
          )}>
            {t.type === 'success' && <Check className="h-4 w-4" />}
            {t.type === 'error' && <AlertTriangle className="h-4 w-4" />}
            {t.type === 'info' && <Info className="h-4 w-4" />}
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}