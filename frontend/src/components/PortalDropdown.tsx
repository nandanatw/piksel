import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface PortalDropdownProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  className?: string
  align?: 'left' | 'right'
}

export function PortalDropdown({ open, onClose, children, className = '', align = 'right' }: PortalDropdownProps) {
  const triggerRef = useRef<HTMLSpanElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    if (!open || !triggerRef.current) {
      setPos(null)
      return
    }
    const rect = triggerRef.current.getBoundingClientRect()
    setPos({
      top: rect.bottom + 4,
      left: align === 'right' ? rect.right : rect.left,
    })
  }, [open, align])

  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => {
      const target = e.target as Element | null
      if (!target?.closest('[data-portal-dropdown]')) onClose()
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open, onClose])

  return <>
    <span ref={triggerRef} className="inline-flex" />
    {open && pos && createPortal(
      <div
        data-portal-dropdown
        className={`fixed z-[90] rounded-lg border border-border bg-card text-card-foreground shadow-xl ${className}`}
        style={{
          top: pos.top,
          left: align === 'right' ? pos.left : pos.left,
          transform: align === 'right' ? 'translateX(-100%)' : 'none',
        }}
      >
        {children}
      </div>,
      document.body
    )}
  </>
}