import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function brokenImg() {
  return 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect fill="%23161822" width="400" height="400" rx="12"/><g transform="translate(140,140)"><rect x="12" y="0" width="96" height="72" rx="8" fill="none" stroke="%23374151" stroke-width="2.5"/><circle cx="38" cy="24" r="16" fill="none" stroke="%23374151" stroke-width="2.5"/><path d="M12 56 L44 36 L72 52 L108 20 L108 72 L12 72 Z" fill="%23374151" opacity="0.5"/></g><text fill="%236b7280" font-size="13" font-family="system-ui,sans-serif" text-anchor="middle" x="200" y="280">Gambar tidak tersedia</text></svg>'
  )
}