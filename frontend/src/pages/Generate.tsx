import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '../hooks/useAuth'
import { cn, brokenImg } from '../lib/utils'
import { ArrowDown, ArrowUp, ImagePlus, Plus, Wand2, Square, RefreshCw, Trash, Globe2, Lock, GalleryHorizontalEnd, Download, Star, Eye, Copy, Check, X, SlidersHorizontal, Search, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, MoreVertical, Flame, Share2, Moon, Sun, Pin, List, Mic, MicOff } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Textarea } from '../components/ui/textarea'
import { Select } from '../components/ui/select'
import { Layout } from '../components/Layout'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { PrivateShareDialog } from '../components/PrivateShareDialog'
import ImageDetailModal from '../components/ImageDetailModal'
import ImageCompare from '../components/ImageCompare'
import { LoadingImage } from '../components/LoadingImage'
import { useTheme } from '../hooks/useTheme'
import { useToast } from '../components/Toast'

interface Model { name: string; cost: number; ratios: string[]; resolutions: string[]; defaultRatio: string; defaultRes: string | null; supportsImageInput?: boolean; popular?: boolean; usageCount?: number }
interface ReferenceItem { id: string; name: string; originalName?: string; thumbnailUrl: string; url: string; createdAt?: string; lastUsedAt?: string; usageCount?: number; isFavorite?: boolean; byteSize?: number; mimeType?: string }
interface ChatTask { id: string; batchId?: string; batchPosition?: number; status: string; url?: string; thumbnailUrl?: string; taskId?: string; credit?: number; prompt?: string; model?: string; ratio?: string; resolution?: string; isPublic?: boolean; isFavorite?: boolean; error?: string; recoverable?: boolean; refUrls?: string[]; referenceCount?: number; collapsed?: boolean; createdAt?: string; startedAt?: string; cancelRequested?: boolean }

function taskTimestamp(task: ChatTask) {
  const timestamp = new Date(task.createdAt || task.startedAt || 0).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

function sortTasksChronologically(tasks: ChatTask[]) {
  return [...tasks].sort((a, b) => taskTimestamp(a) - taskTimestamp(b))
}

function ratioPreviewStyle(value: string) {
  const [width, height] = value.split(':').map(Number)
  if (!width || !height) return { width: 28, height: 28 }
  const scale = Math.min(34 / width, 34 / height)
  return { width: Math.max(16, Math.round(width * scale)), height: Math.max(16, Math.round(height * scale)) }
}

export default function Generate() {
  const { user, refresh } = useAuth()
  const { toast } = useToast()
  const { theme, toggle: toggleTheme } = useTheme()
  const [models, setModels] = useState<Record<string, Model>>({})
  const [model, setModel] = useState('seedream-5-0-pro')
  const [ratio, setRatio] = useState('1:1')
  const [ratioMenuOpen, setRatioMenuOpen] = useState(false)
  const [resolution, setResolution] = useState('')
  const [prompt, setPrompt] = useState('')
  const [negativePrompt, setNegativePrompt] = useState('')
  const [count, setCount] = useState(1)
  const [refs, setRefs] = useState<File[]>([])
  const [refThumbs, setRefThumbs] = useState<string[]>([])
  const [referenceMenuOpen, setReferenceMenuOpen] = useState(false)
  const [referenceLibraryOpen, setReferenceLibraryOpen] = useState(false)
  const [referenceLibrary, setReferenceLibrary] = useState<ReferenceItem[]>([])
  const [referenceLibraryLoading, setReferenceLibraryLoading] = useState(false)
  const [referenceLibrarySelected, setReferenceLibrarySelected] = useState<string[]>([])
  const [referenceLibraryQuery, setReferenceLibraryQuery] = useState('')
  const [referenceLibrarySort, setReferenceLibrarySort] = useState('newest')
  const [referencePreview, setReferencePreview] = useState<ReferenceItem | null>(null)
  const [referenceLoads, setReferenceLoads] = useState(0)
  const [tasks, setTasks] = useState<ChatTask[]>([])
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([])
  const [selectMode, setSelectMode] = useState(false)
  const [chatMenuOpen, setChatMenuOpen] = useState(false)
  const [noThumbnail, setNoThumbnail] = useState(() => localStorage.getItem('noThumbnail') === 'true')
  const [deleteTarget, setDeleteTarget] = useState<ChatTask | null>(null)
  const [clearChatOpen, setClearChatOpen] = useState(false)
  const [chatClearedAt, setChatClearedAt] = useState<number | null>(() => {
    const value = Number(localStorage.getItem('generateChatClearedAt'))
    return Number.isFinite(value) && value > 0 ? value : null
  })
  const [hiddenChatIds, setHiddenChatIds] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('generateHiddenChats') || '[]') } catch (_) { return [] }
  })
const [generating, setGenerating] = useState(false)
const [stopping, setStopping] = useState(false)
const [showSettings, setShowSettings] = useState(false)
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [error, setError] = useState('')
  const [tracking, setTracking] = useState(true)
  const [lightboxImage, setLightboxImage] = useState<ChatTask | null>(null)
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<any>(null)
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null)
  const [copiedTaskId, setCopiedTaskId] = useState<string | null>(null)
  const [pinnedTaskIds, setPinnedTaskIds] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('pinnedTasks') || '[]')) } catch { return new Set() }
  })
  const [activePinnedIndex, setActivePinnedIndex] = useState(0)
  const [showPinnedList, setShowPinnedList] = useState(false)
  const [highlightTarget, setHighlightTarget] = useState<string | null>(null)
  const [publishTarget, setPublishTarget] = useState<ChatTask | null>(null)
  const [compareImages, setCompareImages] = useState<{ url: string; label: string }[] | null>(null)
  const [publishCaption, setPublishCaption] = useState('')
  const [publishTags, setPublishTags] = useState('')
  const [publishCreatorName, setPublishCreatorName] = useState('')
  const [publishShowPrompt, setPublishShowPrompt] = useState(true)
  const [publishAllowCopy, setPublishAllowCopy] = useState(true)
  const [publishAllowRemix, setPublishAllowRemix] = useState(true)
  const [publishing, setPublishing] = useState(false)
  const [shareTarget, setShareTarget] = useState<ChatTask | null>(null)
  const [promptExpanded, setPromptExpanded] = useState(false)
  const [clockNow, setClockNow] = useState(Date.now())
  const [interruptionNotice, setInterruptionNotice] = useState<{ count: number; refundedCredits: number; lastInterruptedAt?: string } | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [showScrollShortcut, setShowScrollShortcut] = useState(false)
  const [composerHeight, setComposerHeight] = useState(0)
  const [batchSlideIndices, setBatchSlideIndices] = useState<Record<string, number>>({})
  const [remixParentTaskId, setRemixParentTaskId] = useState('')
  const [remixReferenceThumb, setRemixReferenceThumb] = useState('')
  const refInput = useRef<HTMLInputElement>(null)
  const composerRef = useRef<HTMLDivElement>(null)
  const referenceScrollY = useRef<number | null>(null)
  const tasksRef = useRef<ChatTask[]>([])
  const refThumbsRef = useRef<string[]>([])
  const chatEndRef = useRef<HTMLDivElement>(null)
  const notifiedTaskIdsRef = useRef<Set<string>>(new Set())
  const batchSliderRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const terminalTaskIdsRef = useRef<Set<string>>(new Set())
  const previousTaskCountRef = useRef(0)

  function notifyTaskFinished(taskId: string, promptText?: string) {
    if (notifiedTaskIdsRef.current.has(taskId) || localStorage.getItem('generationNotifications') !== 'true') return
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    notifiedTaskIdsRef.current.add(taskId)
    const notice = new Notification('Gambar Kreasya sudah selesai', {
      body: promptText ? promptText.slice(0, 120) : 'Hasil generate kamu sudah siap dilihat.',
      icon: '/favicon.svg',
      tag: `generation-${taskId}`,
    })
    notice.onclick = () => { window.focus(); notice.close() }
  }

  function mergeTasks(incoming: ChatTask[]) {
    setTasks(prev => {
      const merged = new Map<string, ChatTask>()
      for (const task of prev) merged.set(String(task.taskId || task.id), task)
      for (const task of incoming) {
        const key = String(task.taskId || task.id)
        const existing = merged.get(key)
        const next = { ...existing, ...task }
        if (!task.createdAt && existing?.createdAt) next.createdAt = existing.createdAt
        if (!task.startedAt && existing?.startedAt) next.startedAt = existing.startedAt
        merged.set(key, next)
      }
      return sortTasksChronologically([...merged.values()])
    })
  }

  useEffect(() => {
    fetch('/api/models').then(r => r.ok ? r.json() : Promise.reject()).then((data: Record<string, Model>) => {
      setModels(data)
      const autoDraft = sessionStorage.getItem('autoDraft')
      if (autoDraft && !sessionStorage.getItem('generationDraft')) {
        const ad = JSON.parse(autoDraft)
        if (ad.prompt) setPrompt(ad.prompt)
        if (ad.negativePrompt) setNegativePrompt(ad.negativePrompt)
        if (ad.model && data[ad.model]) setModel(ad.model)
        if (ad.ratio) setRatio(ad.ratio)
        if (ad.resolution) setResolution(ad.resolution)
        if (ad.count) setCount(ad.count)
      }
      const draft = sessionStorage.getItem('generationDraft')
      const parsed = draft ? JSON.parse(draft) : null
      const nextModel = parsed?.model && data[parsed.model] ? parsed.model : data['seedream-5-0-pro'] ? 'seedream-5-0-pro' : Object.keys(data)[0]
      if (nextModel) {
        setModel(nextModel)
        setRatio(parsed?.ratio && data[nextModel].ratios.includes(parsed.ratio) ? parsed.ratio : data[nextModel].defaultRatio)
        setResolution(parsed?.resolution && data[nextModel].resolutions.includes(parsed.resolution) ? parsed.resolution : data[nextModel].defaultRes || '')
      }
      if (parsed?.prompt) setPrompt(parsed.prompt)
      if (parsed?.negativePrompt) setNegativePrompt(parsed.negativePrompt)
      if (parsed?.referenceUrl) {
        setReferenceLoads(value => value + 1)
        fetch(parsed.referenceUrl, { credentials: 'include' })
          .then(response => response.blob())
          .then(blob => {
            const file = new File([blob], `remix-${parsed.remixParentTaskId || 'source'}.jpg`, { type: blob.type || 'image/jpeg' })
            const thumb = URL.createObjectURL(file)
            setRefs([file])
            setRefThumbs([thumb])
            setRemixReferenceThumb(thumb)
            setRemixParentTaskId(parsed.remixParentTaskId || '')
          })
          .catch(() => {})
          .finally(() => setReferenceLoads(value => Math.max(0, value - 1)))
      } else if (parsed?.taskId) {
        setReferenceLoads(value => value + 1)
        sessionStorage.removeItem('referenceDraft')
        fetch('/api/image/task/' + encodeURIComponent(parsed.taskId), { credentials: 'include' })
          .then(res => res.json().catch(() => ({})))
          .then(data => {
            if (data.refUrls && data.refUrls.length > 0) {
              return Promise.all(data.refUrls.map((refUrl: string) =>
                fetch(refUrl).then(r => r.blob()).then(blob => {
                  const filename = refUrl.split('/').pop() || 'reference.jpg'
                  return new File([blob], filename, { type: blob.type })
                }).catch(() => null)
              )).then(files => {
                const valid = files.filter(Boolean) as File[]
                if (valid.length > 0) {
                  setRefs(valid)
                  setRefThumbs(valid.map(f => URL.createObjectURL(f)))
                }
              })
            }
            return undefined
          }).catch(() => {}).finally(() => setReferenceLoads(value => Math.max(0, value - 1)))
      }
      const referenceDraft = sessionStorage.getItem('referenceDraft')
      const referenceIds: string[] = referenceDraft ? JSON.parse(referenceDraft).ids || [] : []
      if (referenceIds.length > 0) {
        setReferenceLoads(value => value + 1)
        Promise.all(referenceIds.map(id => fetch('/api/media/reference/' + encodeURIComponent(id), { credentials: 'include' }).then(async response => {
          if (!response.ok) return null
          const blob = await response.blob()
          return new File([blob], `reference-${id}.jpg`, { type: blob.type || 'image/jpeg' })
        }).catch(() => null))).then(files => {
          const valid = files.filter(Boolean) as File[]
          if (valid.length > 0) {
            setRefs(prev => [...prev, ...valid])
            setRefThumbs(prev => [...prev, ...valid.map(file => URL.createObjectURL(file))])
          }
        }).finally(() => setReferenceLoads(value => Math.max(0, value - 1)))
      }
      sessionStorage.removeItem('generationDraft')
      sessionStorage.removeItem('referenceDraft')
    }).catch(() => setError('Unable to load generation models.'))
  }, [])

  useEffect(() => {
    fetch('/api/image/tasks/interrupted', { credentials: 'include' })
      .then(response => response.ok ? response.json() : null)
      .then(data => {
        if (!data?.count || !data.lastInterruptedAt) return
        const noticeKey = `interruption_notice_${data.lastInterruptedAt}`
        if (sessionStorage.getItem(noticeKey)) return
        setInterruptionNotice(data)
      }).catch(() => {})
  }, [])

  useEffect(() => {
    let disposed = false
    const loadResults = () => fetch('/api/results', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then((results: any[]) => {
        if (disposed) return
        mergeTasks(results.map((r, i) => ({
          id: `history_${r.taskId || i}`,
          status: 'done',
          url: r.url,
          thumbnailUrl: r.thumbnailUrl,
          taskId: r.taskId,
          batchId: r.batchId,
          batchPosition: r.batchPosition,
          credit: r.estimatedCredit,
          prompt: r.prompt,
          model: r.model,
          ratio: r.ratio,
          resolution: r.resolution,
          isPublic: r.isPublic,
          isFavorite: r.isFavorite,
          createdAt: r.timestamp,
          collapsed: true,
        })).filter(task => {
          const createdAt = new Date(task.createdAt || 0).getTime()
          return !hiddenChatIds.includes(String(task.taskId)) && (!chatClearedAt || createdAt > chatClearedAt)
        }))
      }).catch(() => {})
    loadResults()
    const recoveryTimer = window.setTimeout(loadResults, 1500)
    return () => { disposed = true; window.clearTimeout(recoveryTimer) }
  }, [hiddenChatIds, chatClearedAt])

  useEffect(() => { tasksRef.current = tasks }, [tasks])
  useEffect(() => { refThumbsRef.current = refThumbs }, [refThumbs])

  useEffect(() => {
    let disposed = false
    const loadActive = async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const response = await fetch('/api/image/tasks/active', { credentials: 'include' })
          if (!response.ok) throw new Error('Active tasks unavailable')
          const active = await response.json()
          if (!disposed && active.length) {
            mergeTasks(active.map((task: any) => ({ id: task.taskId, taskId: task.taskId, batchId: task.batchId, batchPosition: task.batchPosition, status: task.status || 'queued', prompt: task.prompt, model: task.model, ratio: task.ratio, resolution: task.resolution, credit: task.cost, createdAt: task.createdAt, startedAt: task.startedAt || task.createdAt || new Date().toISOString(), collapsed: true })))
            return
          }
          if (attempt === 2) return
        } catch (_) {
          if (attempt === 2) return
        }
        await new Promise(resolve => window.setTimeout(resolve, 700 * (attempt + 1)))
      }
    }
    loadActive()
    return () => { disposed = true }
  }, [])

  const hasActiveTasks = tasks.some(task => task.status === 'queued' || task.status === 'running')
  const terminalTaskSignature = tasks
    .filter(task => task.status === 'done' || task.status === 'error' || task.status === 'cancelled')
    .map(task => `${task.taskId || task.id}:${task.status}`)
    .sort()
    .join('|')

  const scrollToLatest = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const marker = chatEndRef.current
    if (!marker) return
    const reservedBottom = (composerRef.current?.getBoundingClientRect().height || 0) + 16
    const visibleBottom = Math.max(80, window.innerHeight - reservedBottom)
    const targetTop = Math.max(0, window.scrollY + marker.getBoundingClientRect().bottom - visibleBottom)
    window.scrollTo({ top: targetTop, behavior })
    setShowScrollShortcut(false)
  }, [])

  const updateScrollShortcut = useCallback(() => {
    const marker = chatEndRef.current
    if (!marker) return
    const reservedBottom = (composerRef.current?.getBoundingClientRect().height || 0) + 16
    const visibleBottom = Math.max(80, window.innerHeight - reservedBottom)
    setShowScrollShortcut(marker.getBoundingClientRect().bottom - visibleBottom > 80)
  }, [])

  useEffect(() => {
    const terminalIds = new Set(terminalTaskSignature
      ? terminalTaskSignature.split('|').map(entry => entry.slice(0, entry.lastIndexOf(':')))
      : [])
    const hasNewTask = tasks.length > previousTaskCountRef.current
    const hasNewTerminalTask = [...terminalIds].some(taskId => !terminalTaskIdsRef.current.has(taskId))
    previousTaskCountRef.current = tasks.length
    terminalTaskIdsRef.current = terminalIds
    if (!tasks.length || (!hasNewTask && !hasNewTerminalTask)) {
      updateScrollShortcut()
      return
    }
    // Keep the latest result pinned while its image and controls settle in the DOM.
    const timers = [0, 120, 450, 900].map(delay => window.setTimeout(() => scrollToLatest('auto'), delay))
    return () => timers.forEach(timer => window.clearTimeout(timer))
  }, [tasks.length, terminalTaskSignature, scrollToLatest, updateScrollShortcut])

  useEffect(() => {
    let frame = 0
    const scheduleUpdate = () => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        updateScrollShortcut()
      })
    }
    scheduleUpdate()
    window.addEventListener('scroll', scheduleUpdate, { passive: true })
    window.addEventListener('resize', scheduleUpdate)
    return () => {
      if (frame) window.cancelAnimationFrame(frame)
      window.removeEventListener('scroll', scheduleUpdate)
      window.removeEventListener('resize', scheduleUpdate)
    }
  }, [updateScrollShortcut])

  useEffect(() => {
    if (!tracking || !hasActiveTasks) return
    let disposed = false
    const poll = async () => {
      const active = tasksRef.current.filter(task => task.status === 'queued' || task.status === 'running')
      await Promise.all(active.map(async task => {
        try {
          const response = await fetch('/api/image/task/' + encodeURIComponent(task.id), { credentials: 'include' })
          const data = await response.json().catch(() => ({}))
          if (!response.ok) {
            if (response.status >= 500) return // server error, retry next poll
            setTasks(prev => prev.map(item => item.id === task.id ? { ...item, status: 'error', error: data.error || 'Generation failed', recoverable: true } : item))
            return
          }
          if (disposed) return
          const resolvedTaskId = String(data.taskId || task.taskId || task.id)
          if (data.status === 'done' && (task.status === 'queued' || task.status === 'running')) notifyTaskFinished(resolvedTaskId, task.prompt)
          setTasks(prev => prev.map(item => item.id === task.id ? { ...item, batchId: data.batchId || item.batchId, batchPosition: data.batchPosition ?? item.batchPosition, status: data.status, url: data.url, thumbnailUrl: data.status === 'done' ? `/api/media/thumbnail/${encodeURIComponent(resolvedTaskId)}` : item.thumbnailUrl, taskId: resolvedTaskId, credit: data.estimatedCredit, error: data.error, recoverable: data.recoverable, refUrls: data.refUrls || item.refUrls, cancelRequested: Boolean(data.cancellationRequested) } : item))
        } catch (_) {
          // network error, retry on next poll — don't mark as error
        }
      }))
    }
    poll()
    const interval = window.setInterval(poll, 2000)
    return () => { disposed = true; window.clearInterval(interval) }
  }, [tracking, hasActiveTasks])

  useEffect(() => () => { refThumbsRef.current.forEach(URL.revokeObjectURL) }, [])

  useEffect(() => {
    if (!composerRef.current) return
    const updateHeight = () => setComposerHeight(composerRef.current?.getBoundingClientRect().height || 0)
    updateHeight()
    const observer = new ResizeObserver(updateHeight)
    observer.observe(composerRef.current)
    return () => observer.disconnect()
  }, [showSettings, promptExpanded, refThumbs.length])

  useEffect(() => {
    if (!composerHeight || (!showSettings && !promptExpanded)) return
    const timer = window.setTimeout(() => scrollToLatest('smooth'), 100)
    return () => window.clearTimeout(timer)
  }, [composerHeight, showSettings, promptExpanded, scrollToLatest])

  useEffect(() => {
    if (!hasActiveTasks) return
    setClockNow(Date.now())
    const interval = window.setInterval(() => setClockNow(Date.now()), 1000)
    return () => window.clearInterval(interval)
  }, [hasActiveTasks])

  useEffect(() => {
    const draft = () => {
      if (!prompt.trim() && !negativePrompt.trim()) return
      sessionStorage.setItem('autoDraft', JSON.stringify({ prompt, negativePrompt, model, ratio, resolution, count }))
    }
    const interval = window.setInterval(draft, 5000)
    return () => window.clearInterval(interval)
  }, [prompt, negativePrompt, model, ratio, resolution, count])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'Escape') {
        setModelMenuOpen(false); setShowSettings(false)
        setRatioMenuOpen(false); setReferenceMenuOpen(false); setPromptExpanded(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.target instanceof HTMLTextAreaElement)) return
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); generate() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [prompt, negativePrompt, model, ratio, resolution, count, refs, generating])

  const currentModel = models[model] || { ratios: ['1:1'], defaultRatio: '1:1', resolutions: ['1k'], defaultRes: '1k', cost: 6 }
  const supportsImageInput = currentModel.supportsImageInput === true

  function handleRefs(files: FileList | File[] | null) {
    if (!files) return
    const arr = Array.from(files).filter(f => f.type.startsWith('image/'))
    if (arr.length === 0) return
    setRefs(prev => [...prev, ...arr])
    setRefThumbs(prev => [...prev, ...arr.map(f => URL.createObjectURL(f))])
    requestAnimationFrame(() => {
      if (referenceScrollY.current !== null) window.scrollTo({ top: referenceScrollY.current, behavior: 'auto' })
      referenceScrollY.current = null
    })
  }

  function handlePromptPaste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    const fromItems = Array.from(event.clipboardData.items)
      .filter(item => item.kind === 'file')
      .map(item => item.getAsFile())
      .filter((file): file is File => Boolean(file))
      .map((file, i) => {
        // Pasted images get "image.png" by default in Chrome. Give them unique names.
        const ext = file.type === 'image/png' ? '.png' : file.type === 'image/webp' ? '.webp' : '.jpg'
        return new File([file], `pasted-${Date.now()}-${i}${ext}`, { type: file.type })
      })
    const candidates = fromItems.length > 0 ? fromItems : Array.from(event.clipboardData.files)
    const images = candidates.filter(file => /^image\/(jpeg|png|webp)$/i.test(file.type))
    if (images.length === 0) return

    event.preventDefault()
    if (!supportsImageInput) {
      setError('Model yang dipilih belum mendukung gambar reference.')
      return
    }

    const availableSlots = Math.max(0, 10 - refs.length)
    if (availableSlots === 0) {
      setError('Maksimal 10 gambar reference dalam satu generate.')
      return
    }

    handleRefs(images.slice(0, availableSlots))
    setError(images.length > availableSlots ? `Hanya ${availableSlots} gambar yang ditambahkan karena batas reference.` : '')
  }

  async function openReferenceLibrary() {
    setReferenceLibraryOpen(true)
    setReferenceLibraryLoading(true)
    setReferenceLibrarySelected([])
    setReferenceLibraryQuery('')
    const response = await fetch('/api/references', { credentials: 'include' })
    const data = await response.json().catch(() => ({}))
    if (response.ok) setReferenceLibrary(data.items || [])
    else setError(data.error || 'Library referensi tidak dapat dimuat.')
    setReferenceLibraryLoading(false)
    setReferenceMenuOpen(true)
  }

  function toggleLibraryReference(referenceId: string) {
    setReferenceLibrarySelected(previous => {
      if (previous.includes(referenceId)) return previous.filter(id => id !== referenceId)
      const availableSlots = Math.max(0, 10 - refs.length)
      if (previous.length >= availableSlots) { setError(`Maksimal ${availableSlots} referensi tambahan untuk generate ini.`); return previous }
      setError('')
      return [...previous, referenceId]
    })
  }

  async function toggleLibraryFavorite(reference: ReferenceItem) {
    try {
      const response = await fetch(`/api/references/${encodeURIComponent(reference.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ isFavorite: !reference.isFavorite }) })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Favorite tidak bisa diperbarui.')
      setReferenceLibrary(previous => previous.map(item => item.id === reference.id ? { ...item, ...data.item } : item))
      setReferencePreview(previous => previous?.id === reference.id ? { ...previous, ...data.item } : previous)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Favorite tidak bisa diperbarui.')
    }
  }

  async function addSelectedLibraryReferences() {
    const selectedReferences = referenceLibrarySelected.map(id => referenceLibrary.find(reference => reference.id === id)).filter(Boolean) as ReferenceItem[]
    if (!selectedReferences.length) return
    setReferenceLibraryLoading(true)
    setReferenceLoads(value => value + 1)
    try {
      const files = await Promise.all(selectedReferences.map(async reference => {
        const response = await fetch(reference.url || `/api/media/reference/${encodeURIComponent(reference.id)}`, { credentials: 'include' })
        if (!response.ok) return null
        const blob = await response.blob()
        return new File([blob], reference.name || `reference-${reference.id}.jpg`, { type: blob.type || 'image/jpeg' })
      }))
      const validFiles = files.filter(Boolean) as File[]
      if (!validFiles.length) throw new Error('Referensi tidak dapat digunakan saat ini.')
      setRefs(previous => [...previous, ...validFiles])
      setRefThumbs(previous => [...previous, ...validFiles.map(file => URL.createObjectURL(file))])
      fetch('/api/references/use', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ ids: selectedReferences.map(reference => reference.id) }) }).catch(() => null)
      if (validFiles.length < selectedReferences.length) setError(`${selectedReferences.length - validFiles.length} referensi tidak dapat dimuat.`)
      setReferenceMenuOpen(false)
      setReferenceLibraryOpen(false)
      setReferenceLibrarySelected([])
    } catch {
      setError('Referensi tidak dapat digunakan saat ini.')
    } finally {
      setReferenceLibraryLoading(false)
      setReferenceLoads(value => Math.max(0, value - 1))
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    if (!supportsImageInput) return
    if (e.dataTransfer.files.length > 0) handleRefs(e.dataTransfer.files)
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    if (supportsImageInput && e.dataTransfer.types.includes('Files')) setDragOver(true)
  }

  function removeRef(i: number) {
    if (refThumbs[i] === remixReferenceThumb) {
      setRemixParentTaskId('')
      setRemixReferenceThumb('')
    }
    URL.revokeObjectURL(refThumbs[i])
    setRefs(prev => prev.filter((_, idx) => idx !== i))
    setRefThumbs(prev => prev.filter((_, idx) => idx !== i))
  }

  async function generate() {
    if (generating || !prompt.trim()) return
    setShowSettings(false)
    setModelMenuOpen(false)
    setRatioMenuOpen(false)
    setReferenceMenuOpen(false)
    setReferenceLibraryOpen(false)
    setError('')
    setGenerating(true)

    const form = new FormData()
    form.append('prompt', prompt)
    if (negativePrompt.trim()) form.append('negativePrompt', negativePrompt)
    form.append('model', model)
    form.append('ratio', ratio)
    if (resolution) form.append('resolution', resolution)
    form.append('count', String(count))
    if (remixParentTaskId) form.append('remixParentTaskId', remixParentTaskId)
    refs.forEach(f => form.append('refs', f))

    const res = await fetch('/api/image/generate', { method: 'POST', body: form, credentials: 'include' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data.error) { setError(data.error || 'Generation request failed.'); setGenerating(false); return }

    const startedAt = new Date().toISOString()
    const newTasks = data.taskIds.map((id: string, batchPosition: number) => ({ id, taskId: id, batchId: data.batchId, batchPosition, status: 'running', prompt, model, ratio, resolution, referenceCount: refs.length, startedAt, createdAt: startedAt, collapsed: true }))
    setTasks(prev => sortTasksChronologically([...prev, ...newTasks]))
    setPrompt('')
    setPromptExpanded(false)
    setTracking(true)
    await refresh()
    setGenerating(false)
    refThumbs.forEach(URL.revokeObjectURL)
    setRefs([])
    setRefThumbs([])
    setRemixParentTaskId('')
    setRemixReferenceThumb('')
    
  }

  async function cancelActive() {
    if (stopping) return
    setStopping(true)
    setError('')
    const response = await fetch('/api/image/tasks/cancel-active', { method: 'POST', credentials: 'include' })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) {
      setError(data.error || 'Generation aktif tidak dapat dibatalkan.')
      setStopping(false)
      return
    }
    const outcomes = new Map<string, { status: string; cancellationRequested: boolean }>((data.tasks || []).map((task: { taskId: string; status: string; cancellationRequested: boolean }) => [String(task.taskId), task]))
    setTasks(previous => previous.map(task => {
      const outcome = outcomes.get(String(task.taskId || task.id))
      if (!outcome) return task
      return { ...task, status: outcome.status, cancelRequested: outcome.cancellationRequested, error: outcome.status === 'cancelled' ? 'Generation dibatalkan.' : task.error }
    }))
    await refresh()
    setStopping(false)
  }

  function removeChatFromView(task: ChatTask) {
    if (!task.taskId) return
    const next = [...new Set([...hiddenChatIds, task.taskId])]
    setHiddenChatIds(next)
    localStorage.setItem('generateHiddenChats', JSON.stringify(next))
    setTasks(prev => prev.filter(t => t.id !== task.id))
    setSelectedTaskIds(prev => prev.filter(id => id !== task.taskId))
  }

  async function deleteTaskAndMaybeResult(task: ChatTask) {
    if (!task.taskId) return
    const response = await fetch('/api/results/' + task.taskId, { method: 'DELETE', credentials: 'include' })
    if (!response.ok && response.status !== 404) { setError('Hasil tidak bisa dihapus.'); return }
    removeChatFromView(task)
    setDeleteTarget(null)
  }

  function requestDeleteChat(task: ChatTask) {
    if (task.taskId) setDeleteTarget(task)
  }

  async function deleteSelectedTasks() {
    if (!selectedTaskIds.length || !confirm(`Hapus ${selectedTaskIds.length} chat yang dipilih? Gambar hasilnya juga akan dihapus dari Gallery.`)) return
    const response = await fetch('/api/results/bulk', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskIds: selectedTaskIds, action: 'delete' }),
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) { setError(data.error || 'Selected results could not be deleted.'); return }
    setTasks(prev => prev.filter(task => !task.taskId || !selectedTaskIds.includes(String(task.taskId))))
    setSelectedTaskIds([])
    setSelectMode(false)
  }

  function selectAllChats() {
    setSelectedTaskIds(tasks.filter(task => task.status === 'done' && task.taskId).map(task => String(task.taskId)))
  }

  function toggleTaskSelection(task: ChatTask) {
    if (task.status !== 'done' || !task.taskId) return
    const selectionId = String(task.taskId)
    setSelectedTaskIds(previous => previous.includes(selectionId) ? previous.filter(id => id !== selectionId) : [...previous, selectionId])
  }

  async function clearAllChats() {
    const clearedAt = Date.now()
    const response = await fetch('/api/results/clear', { method: 'POST', credentials: 'include' })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) { setError(data.error || 'Hasil tidak bisa dihapus.'); return }
    setChatClearedAt(clearedAt)
    localStorage.setItem('generateChatClearedAt', String(clearedAt))
    setTasks(prev => prev.filter(task => task.status === 'queued' || task.status === 'running'))
    setSelectedTaskIds([])
    setClearChatOpen(false)
  }

  async function togglePublish(task: ChatTask) {
    if (!task.taskId) return
    if (!task.isPublic) {
      setPublishTarget(task)
      setPublishCaption('')
      setPublishTags('')
      setPublishCreatorName(user?.telegramUsername ? `@${user.telegramUsername.replace(/^@/, '')}` : user?.displayName || 'Kreator Kreasya')
      setPublishShowPrompt(true)
      setPublishAllowCopy(true)
      setPublishAllowRemix(true)
      return
    }
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, isPublic: false } : t))
    const res = await fetch('/api/results/' + task.taskId + '/public', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isPublic: false }),
    })
    if (!res.ok) setTasks(prev => prev.map(t => t.id === task.id ? { ...t, isPublic: task.isPublic } : t))
  }

  async function publishGlobal() {
    if (!publishTarget?.taskId || publishing) return
    setPublishing(true); setError('')
    const res = await fetch('/api/results/' + publishTarget.taskId + '/public', {
      method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        isPublic: true,
        caption: publishCaption,
        tags: publishTags.split(','),
        creatorName: publishCreatorName,
        showPrompt: publishShowPrompt,
        allowPromptCopy: publishShowPrompt && publishAllowCopy,
        allowRemix: publishShowPrompt && publishAllowRemix,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) setError(data.error || 'Post tidak dapat dipublikasikan.')
    else {
      setTasks(prev => prev.map(t => t.id === publishTarget.id ? { ...t, isPublic: true } : t))
      setPublishTarget(null); setPublishCaption(''); setPublishTags('')
    }
    setPublishing(false)
  }

  async function toggleFavorite(task: ChatTask) {
    if (!task.taskId) return
    const next = !task.isFavorite
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, isFavorite: next } : t))
    const res = await fetch('/api/results/' + task.taskId + '/favorite', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isFavorite: next }),
    })
    if (!res.ok) setTasks(prev => prev.map(t => t.id === task.id ? { ...t, isFavorite: task.isFavorite } : t))
  }

  async function recreateTask(task: ChatTask) {
    setReferenceLoads(value => value + 1)
    setPrompt(task.prompt || '')
    if (task.model && models[task.model]) setModel(task.model)
    if (task.ratio) setRatio(task.ratio)
    if (task.resolution) setResolution(task.resolution)

    // Put the generated image back into the composer as a reference so the
    // next generation can preserve its subject, styling, and composition.
    const nextRefFiles: File[] = []
    const nextRefUrls: string[] = []
    if (task.url) {
      try {
        const response = await fetch(task.url, { credentials: 'include' })
        if (response.ok) {
          const blob = await response.blob()
          nextRefFiles.push(new File([blob], `kreasya-generated-${task.taskId || 'image'}.jpg`, { type: blob.type || 'image/jpeg' }))
          nextRefUrls.push(URL.createObjectURL(blob))
        }
      } catch (e) {
        console.warn('Failed to load generated image as reference:', e)
      }
    }

    // Keep any original reference images attached to the task as well.
    if (task.taskId) {
      try {
        const res = await fetch('/api/image/task/' + encodeURIComponent(task.taskId), { credentials: 'include' })
        const data = await res.json().catch(() => ({}))
        if (data.refUrls && data.refUrls.length > 0) {
          for (const refUrl of data.refUrls) {
            try {
              const response = await fetch(refUrl)
              const blob = await response.blob()
              const filename = refUrl.split('/').pop() || 'reference.jpg'
              nextRefFiles.push(new File([blob], filename, { type: blob.type || 'image/jpeg' }))
              nextRefUrls.push(URL.createObjectURL(blob))
            } catch (e) {
              console.warn('Failed to load reference image:', e)
            }
          }
        }
      } catch (e) {
        console.warn('Failed to load task details:', e)
      }
    }

    if (nextRefFiles.length > 0) {
      refThumbs.forEach(URL.revokeObjectURL)
      setRefs(nextRefFiles)
      setRefThumbs(nextRefUrls)
    }
    setReferenceLoads(value => Math.max(0, value - 1))
    
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  
  function togglePromptCollapse(taskId: string) {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, collapsed: !t.collapsed } : t))
  }

  function toggleVoice() {
    if (listening) {
      recognitionRef.current?.stop()
      setListening(false)
      return
    }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) return
    const rec = new SpeechRecognition()
    rec.lang = 'id-ID'
    rec.interimResults = false
    rec.maxAlternatives = 1
    rec.onresult = (e: any) => {
      const text = e.results[0][0].transcript
      setPrompt(prev => prev ? prev + ' ' + text : text)
    }
    rec.onerror = () => setListening(false)
    rec.onend = () => setListening(false)
    recognitionRef.current = rec
    rec.start()
    setListening(true)
  }

  function insertRefLabel(i: number) {
    const label = refs[i]?.name || `Gambar ${i + 1}`
    const el = promptTextareaRef.current
    if (!el) { setPrompt(prev => prev ? prev + ' ' + label : label); return }
    const start = el.selectionStart ?? el.value.length
    const end = el.selectionEnd ?? start
    const next = el.value.slice(0, start) + label + el.value.slice(end)
    setPrompt(next)
    requestAnimationFrame(() => { el.focus(); el.selectionStart = el.selectionEnd = start + label.length })
  }

  async function copyDetailPrompt() {
    if (!lightboxImage?.prompt) return
    try { await navigator.clipboard.writeText(lightboxImage.prompt) } catch (_) {}
  }

  async function copyBubblePrompt(task: ChatTask) {
    if (!task.prompt) return
    try {
      await navigator.clipboard.writeText(task.prompt)
      setCopiedTaskId(task.id)
      window.setTimeout(() => setCopiedTaskId(current => current === task.id ? null : current), 1800)
    } catch (_) {
      setError('Prompt tidak bisa disalin')
    }
  }

  function togglePin(taskId: string) {
    const maxPins = user?.unlimited && !user?.freeTrial ? 10 : 2
    setPinnedTaskIds(prev => {
      const next = new Set(prev)
      if (next.has(taskId)) { next.delete(taskId) }
      else if (next.size < maxPins) { next.add(taskId) }
      else {
        if (user?.freeTrial) {
          toast('Slot sematan penuh (2/2). Upgrade ke plan berbayar untuk 10 slot.', 'warning')
        } else {
          toast('Slot sematan penuh (10/10). Hapus sematan lain untuk menambah baru.', 'warning')
        }
        return prev
      }
      localStorage.setItem('pinnedTasks', JSON.stringify([...next]))
      return next
    })
  }

  function cyclePinned() {
    const pinned = tasks.filter(t => pinnedTaskIds.has(String(t.taskId)) && t.status === 'done')
    if (!pinned.length) return
    const nextIndex = (activePinnedIndex + 1) % pinned.length
    setActivePinnedIndex(nextIndex)
    const target = pinned[nextIndex]
    const el = document.getElementById(`task-${target.taskId}`)
    if (el) {
      setTimeout(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        setHighlightTarget(String(target.taskId))
        setTimeout(() => setHighlightTarget(null), 1200)
      }, 50)
    } else {
      setHighlightTarget(String(target.taskId))
      setTimeout(() => setHighlightTarget(null), 1200)
    }
  }

  function chooseModel(nextModelId: string) {
    const next = models[nextModelId]
    if (!next) return
    setModel(nextModelId)
    setRatio(next.defaultRatio)
    setResolution(next.defaultRes || '')
    setModelMenuOpen(false)
    if (next.supportsImageInput !== true) {
      refThumbs.forEach(URL.revokeObjectURL)
      setRefs([])
      setRefThumbs([])
    }
  }

  function generationMessage(task: ChatTask) {
    if (task.cancelRequested) return 'Permintaan berhenti sedang diproses...'
    if (task.status === 'queued') return 'Menyiapkan permintaan Anda...'
    if (task.status !== 'running') return 'Sedang menyiapkan hasil...'
    const elapsed = Math.max(0, Math.floor((clockNow - new Date(task.startedAt || task.createdAt || clockNow).getTime()) / 1000))
    const time = elapsed < 60 ? `${elapsed} detik` : `${Math.floor(elapsed / 60)} menit ${elapsed % 60} detik`
    if (elapsed < 8) return `Sedang memahami prompt... · ${time}`
    if (elapsed < 20) return `Sedang membuat gambar... · ${time}`
    if (elapsed < 35) return `Menyempurnakan detail... · ${time}`
    return `Hampir selesai... · ${time}`
  }

  function taskStatusLabel(task: ChatTask) {
    if (task.status === 'done') return 'Gambar siap digunakan'
    if (task.status === 'queued') return 'Menunggu proses dimulai'
    if (task.status === 'running') return 'Sedang diproses'
    if (task.status === 'cancelled') return 'Generation dibatalkan'
    if (task.status === 'untracked') return 'Proses tetap berjalan di server'
    return 'Hasil belum dapat dibuat'
  }

  function resultActions(task: ChatTask, index: number) {
    return <>
      <Button variant="outline" size="icon" asChild aria-label={`Download hasil ${index + 1}`} title="Download" className="h-9 w-9"><a href={task.url} download={`kreasya-${task.taskId}.png`}><Download className="h-4 w-4" /></a></Button>
      <Button variant="outline" size="icon" onClick={() => togglePin(String(task.taskId))} title={pinnedTaskIds.has(String(task.taskId)) ? 'Lepas sematan' : 'Sematkan'} className={cn('h-9 w-9', pinnedTaskIds.has(String(task.taskId)) && 'text-amber-500 border-amber-500/50')}><Pin className={cn('h-4 w-4', pinnedTaskIds.has(String(task.taskId)) && 'fill-current')} /></Button>
      <Button variant={task.isFavorite ? 'default' : 'outline'} size="icon" onClick={() => toggleFavorite(task)} aria-label={task.isFavorite ? 'Remove from favorites' : 'Add to favorites'} title="Favorite" className="h-9 w-9"><Star className={cn('h-4 w-4', task.isFavorite && 'fill-current')} /></Button>
      <Button variant={task.isPublic ? 'default' : 'outline'} size="icon" onClick={() => togglePublish(task)} aria-label={task.isPublic ? 'Make image private' : 'Publish image'} title={task.isPublic ? 'Jadikan privat' : 'Publikasikan'} className="h-9 w-9">{task.isPublic ? <Globe2 className="h-4 w-4" /> : <Lock className="h-4 w-4" />}</Button>
      <Button variant="outline" size="icon" onClick={() => recreateTask(task)} aria-label="Recreate image" title="Re-create" className="h-9 w-9 text-primary"><RefreshCw className="h-4 w-4" /></Button>
      <Button variant="outline" size="icon" onClick={() => setShareTarget(task)} aria-label="Create private share link" title="Private share" className="h-9 w-9"><Share2 className="h-4 w-4" /></Button>
      <Button variant="outline" size="icon" onClick={() => requestDeleteChat(task)} aria-label={`Delete hasil ${index + 1}`} title="Delete result" className="h-9 w-9 border-destructive/30 text-destructive hover:bg-destructive/10"><Trash className="h-4 w-4" /></Button>
    </>
  }


  const activeCount = tasks.filter(task => task.status === 'queued' || task.status === 'running').length
const hasPrompt = !!prompt.trim()
  const showStopButton = activeCount > 0 && !hasPrompt
  const cancellationPending = tasks.some(task => (task.status === 'queued' || task.status === 'running') && task.cancelRequested)
  const hasCompletedChats = tasks.some(task => task.status === 'done')
  const normalizedReferenceQuery = referenceLibraryQuery.trim().toLowerCase()
  const visibleReferenceLibrary = [...referenceLibrary]
    .filter(item => !normalizedReferenceQuery || `${item.name} ${item.originalName || ''}`.toLowerCase().includes(normalizedReferenceQuery))
    .sort((a, b) => {
      if (referenceLibrarySort === 'oldest') return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
      if (referenceLibrarySort === 'used') return new Date(b.lastUsedAt || 0).getTime() - new Date(a.lastUsedAt || 0).getTime()
      if (referenceLibrarySort === 'favorites') return Number(Boolean(b.isFavorite)) - Number(Boolean(a.isFavorite)) || new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
      if (referenceLibrarySort === 'name') return a.name.localeCompare(b.name, 'id')
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    })
  const taskGroups = [...tasks.reduce((groups, task) => {
    const groupId = task.batchId || `legacy_${task.taskId || task.id}`
    const existing = groups.get(groupId)
    if (existing) existing.push(task)
    else groups.set(groupId, [task])
    return groups
  }, new Map<string, ChatTask[]>()).entries()].map(([id, items]) => ({
    id,
    items: [...items].sort((a, b) => (a.batchPosition ?? Number.MAX_SAFE_INTEGER) - (b.batchPosition ?? Number.MAX_SAFE_INTEGER)),
  }))

  function updateBatchSlide(groupId: string) {
    const slider = batchSliderRefs.current.get(groupId)
    if (!slider || slider.clientWidth === 0) return
    const index = Math.max(0, Math.min(slider.children.length - 1, Math.round(slider.scrollLeft / slider.clientWidth)))
    setBatchSlideIndices(previous => previous[groupId] === index ? previous : { ...previous, [groupId]: index })
  }

  function scrollBatch(groupId: string, direction: -1 | 1) {
    const slider = batchSliderRefs.current.get(groupId)
    if (!slider) return
    slider.scrollBy({ left: direction * slider.clientWidth, behavior: 'smooth' })
  }

  return (
    <Layout showCredits nav={<></>} floatingHeader headerContent={
      <div className="relative">
        <Button variant="ghost" size="icon" onClick={() => setChatMenuOpen(value => !value)} className="h-9 w-9 rounded-full" aria-label="Opsi chat" aria-expanded={chatMenuOpen} title="Opsi chat">
          <MoreVertical className="h-5 w-5" />
        </Button>
        {chatMenuOpen && <div className="absolute right-0 top-11 z-[80] w-52 rounded-xl border border-border bg-card p-1.5 text-left text-card-foreground opacity-100 shadow-xl">
          <button type="button" onClick={() => window.location.reload()} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted">
            <RefreshCw className="h-4 w-4 text-muted-foreground" /> Muat ulang hasil
          </button>
          <button type="button" onClick={() => window.location.assign('/gallery')} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted">
            <GalleryHorizontalEnd className="h-4 w-4 text-muted-foreground" /> Buka Gallery
          </button>
          <button type="button" onClick={() => { toggleTheme(); setChatMenuOpen(false) }} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted">
            {theme === 'dark' ? <Sun className="h-4 w-4 text-muted-foreground" /> : <Moon className="h-4 w-4 text-muted-foreground" />} {theme === 'dark' ? 'Mode terang' : 'Mode gelap'}
          </button>
          <button type="button" onClick={() => { const next = !noThumbnail; setNoThumbnail(next); localStorage.setItem('noThumbnail', String(next)); setChatMenuOpen(false) }} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted">
            <ImagePlus className="h-4 w-4 text-muted-foreground" /> {noThumbnail ? 'Tampilkan thumbnail' : 'Sembunyikan thumbnail'}
          </button>
          {hasCompletedChats && <>
            <div className="my-1 border-t border-border" />
            <button type="button" onClick={() => { setSelectMode(true); setChatMenuOpen(false) }} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted">
              <Check className="h-4 w-4 text-muted-foreground" /> Pilih chat
            </button>
            <button type="button" onClick={() => { setClearChatOpen(true); setChatMenuOpen(false) }} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-destructive transition-colors hover:bg-destructive/10">
              <Trash className="h-4 w-4" /> Hapus semua hasil
            </button>
          </>}
        </div>}
      </div>
    }>
      {(() => {
        const pinned = tasks.filter(t => pinnedTaskIds.has(String(t.taskId)) && t.status === 'done')
        if (!pinned.length) return null
        const current = pinned[activePinnedIndex % pinned.length]
        return (
          <div className="fixed top-14 inset-x-0 z-40 mx-auto w-full max-w-2xl px-3 py-1 pointer-events-auto">
            <div className="flex items-center gap-2.5 rounded-[20px] border border-border bg-card px-3 py-2 shadow-md">
              <div className="flex flex-col gap-0.5 shrink-0 h-8 justify-center">
                {pinned.map((t, i) => (
                  <div key={t.id} className={`w-0.5 rounded-full transition-all duration-150 ${i === activePinnedIndex % pinned.length ? 'h-4 bg-foreground' : 'h-2 bg-muted-foreground/30'}`} />
                ))}
              </div>
              <button onClick={cyclePinned} className="flex-1 min-w-0 text-left cursor-pointer hover:bg-foreground/5 -mx-1 px-1 rounded-lg transition-colors" aria-label={`Pinned message ${activePinnedIndex % pinned.length + 1} of ${pinned.length}. Activate to go to the next pinned message.`}>
                <p className="text-[11px] font-semibold text-foreground/80 truncate">Pinned message #{activePinnedIndex % pinned.length + 1}</p>
                <p className="text-[12px] text-muted-foreground truncate">{current?.prompt || 'Gambar tersemat'}</p>
              </button>
              <button onClick={(e) => { e.stopPropagation(); setShowPinnedList(true) }} className="shrink-0 grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-foreground/5 transition-colors" aria-label="View all pinned messages" title="Lihat semua sematan">
                <List className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )
      })()}
      <div className="grid min-w-0 gap-0 lg:grid-cols-1" style={{ paddingBottom: composerHeight ? composerHeight + 24 : undefined, paddingTop: tasks.some(t => pinnedTaskIds.has(String(t.taskId)) && t.status === 'done') ? 48 : undefined }}>
        {selectMode && <div className="fixed left-3 right-3 z-[70] mx-auto w-auto max-w-2xl rounded-2xl border border-primary/25 bg-card/95 p-3 text-card-foreground shadow-2xl backdrop-blur lg:left-[calc(16rem+1.5rem)] lg:right-8" style={{ bottom: composerHeight ? composerHeight + 12 : 120 }}>
          <div className="mb-2.5 flex items-center gap-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground"><Check className="h-4 w-4" /></span>
            <div className="min-w-0 flex-1"><p className="text-sm font-semibold">Mode pilih</p><p className="truncate text-xs text-muted-foreground">{selectedTaskIds.length ? `${selectedTaskIds.length} hasil dipilih` : 'Ketuk bubble untuk memilih hasil'}</p></div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Button variant="outline" size="sm" className="min-h-10 min-w-0 px-2 text-xs text-foreground" onClick={selectAllChats}><Check className="h-4 w-4 shrink-0" /><span className="truncate">Pilih semua</span></Button>
            <Button variant="outline" size="sm" className="min-h-10 min-w-0 px-2 text-xs text-destructive" onClick={deleteSelectedTasks} disabled={!selectedTaskIds.length}><Trash className="h-4 w-4 shrink-0" /><span className="truncate">Hapus</span></Button>
            <Button variant="outline" size="sm" className="min-h-10 min-w-0 px-2 text-xs text-foreground" onClick={() => { setSelectedTaskIds([]); setSelectMode(false) }}><X className="h-4 w-4 shrink-0" /><span className="truncate">Selesai</span></Button>
          </div>
        </div>}
        <section className="mx-auto w-full min-w-0 max-w-4xl space-y-3 sm:space-y-4" onDrop={handleDrop} onDragOver={handleDragOver}>
          {user?.freeTrial && user?.unlimited && (
            <div className="flex items-center gap-3 rounded-xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm">
              <span className="text-amber-500">&#9888;</span>
              <span className="flex-1">
                <strong>Free trial</strong>
                {user?.unlimitedUntil ? <> · sisa <strong>{Math.max(0, Math.ceil((new Date(user.unlimitedUntil).getTime() - Date.now()) / 86400000))} hari</strong> · sampai <strong>{new Date(user.unlimitedUntil).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</strong></> : ''}
                <span className="text-muted-foreground"> · hasil ber-watermark · max 50/hari · <a href="/payments" className="underline">upgrade ke plan</a></span>
              </span>
              <a href="/payments" className="shrink-0 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 transition-colors">Upgrade</a>
            </div>
          )}
          {user && !user.unlimited && (
            <div className="flex items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
              <span className="text-destructive">&#9888;</span>
              <span className="flex-1"><strong>Akses generate sudah habis</strong><span className="text-muted-foreground"> · beli plan unlimited untuk melanjutkan</span></span>
              <a href="/payments" className="shrink-0 rounded-lg bg-destructive px-3 py-1.5 text-xs font-semibold text-white hover:bg-destructive/90 transition-colors">Beli plan</a>
            </div>
          )}
          {tasks.length === 0 && (
            <Card className="relative isolate overflow-hidden border-dashed border-border bg-card py-10 text-center shadow-sm backdrop-blur sm:py-14">
              <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_0%,rgba(54,209,220,.16),transparent_52%)]" />
              <CardHeader className="items-center space-y-4">
                <div className="chat-intro-orb grid h-16 w-16 place-items-center rounded-3xl bg-primary/15 ring-1 ring-primary/30">
                  <Wand2 className="h-8 w-8 text-primary" />
                </div>
                <CardTitle className="chat-intro-title text-2xl sm:text-3xl">Ide kamu, siap jadi gambar.</CardTitle>
                <CardDescription className="max-w-md text-sm leading-6">
                  Tulis apa yang kamu bayangkan. Kreasya akan membantu mengubahnya menjadi visual yang siap digunakan.
                </CardDescription>
              </CardHeader>
            </Card>
          )}
          {taskGroups.map(group => {
            const primary = group.items[0]
            const completedCount = group.items.filter(item => item.status === 'done').length
            const currentSlide = Math.min(batchSlideIndices[group.id] || 0, group.items.length - 1)
            const mobileTask = group.items[currentSlide] || primary
            return (
              <article key={group.id} className="flex w-full min-w-0 max-w-full flex-col overflow-hidden rounded-2xl bg-card/80 shadow-sm backdrop-blur">
                <div
                  ref={element => { if (element) batchSliderRefs.current.set(group.id, element); else batchSliderRefs.current.delete(group.id) }}
                  onScroll={() => updateBatchSlide(group.id)}
                  className={cn(
                    'order-1 flex w-full min-w-0 max-w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
                    'sm:grid sm:overflow-visible',
                    group.items.length === 1 && 'sm:grid-cols-1',
                    group.items.length === 2 && 'sm:grid-cols-2',
                    group.items.length >= 3 && 'sm:grid-cols-3',
                  )}
                >
                  {group.items.map((t, index) => (
                    <div key={t.id} id={`task-${t.taskId}`} className={cn('relative w-full min-w-0 shrink-0 basis-full snap-center overflow-hidden transition-colors duration-300', group.items.length > 1 && 'sm:border-r sm:border-border last:sm:border-r-0', selectMode && selectedTaskIds.includes(String(t.taskId)) && 'ring-2 ring-inset ring-primary', highlightTarget === String(t.taskId) && 'pinned-target-highlight')}>
                      <span className="absolute right-2 top-2 z-10 rounded-full bg-black/60 px-2 py-1 text-[10px] font-medium text-white backdrop-blur sm:hidden">{index + 1}/{group.items.length}</span>
                      {(t.status === 'running' || t.status === 'queued') && (
                        <div className="relative min-h-64 overflow-hidden p-7 text-center sm:min-h-56 sm:p-8">
                          <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.03] via-primary/[0.06] to-transparent" />
                          <div className="relative mx-auto w-16 h-16">
                            <div className="absolute inset-0 rounded-2xl border-2 border-primary/20" />
                            <div className="absolute inset-0 rounded-2xl border-2 border-transparent border-t-primary animate-spin" />
                            <div className="absolute inset-2 rounded-xl bg-primary/10 animate-pulse" />
                            <Wand2 className="absolute inset-0 m-auto h-5 w-5 text-primary" />
                          </div>
                          <div className="relative mt-5 space-y-1.5">
                            <p className="text-sm font-medium text-foreground">{generationMessage(t)}</p>
                            <div className="mx-auto h-1 w-32 overflow-hidden rounded-full bg-muted">
                              <div className="h-full animate-shimmer rounded-full bg-gradient-to-r from-primary/40 via-primary to-primary/40 bg-[length:200%_100%]" />
                            </div>
                          </div>
                        </div>
                      )}
                      {t.status === 'done' && t.url && (
                        <div className={cn('relative overflow-hidden bg-muted', noThumbnail ? 'min-h-0 p-4' : 'min-h-64 sm:min-h-48', selectMode ? 'cursor-pointer' : 'cursor-zoom-in')} onClick={() => selectMode ? toggleTaskSelection(t) : setLightboxImage(t)}>
                          {noThumbnail ? (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <ImagePlus className="h-4 w-4 shrink-0" />
                              <span className="truncate">Thumbnail disembunyikan</span>
                            </div>
                          ) : (
                            <LoadingImage src={t.thumbnailUrl || `/api/media/thumbnail/${encodeURIComponent(String(t.taskId || t.id))}`} fallbackSrc={t.url || brokenImg()} loading="lazy" className="h-full max-h-[min(60vh,520px)] min-h-64 w-full bg-muted object-contain sm:min-h-48" />
                          )}
                          {selectMode && <label className={cn('absolute left-3 top-3 grid h-9 w-9 cursor-pointer place-items-center rounded-lg border shadow-sm backdrop-blur', selectedTaskIds.includes(String(t.taskId)) ? 'border-primary bg-primary text-primary-foreground' : 'border-white/70 bg-black/50 text-white')} onClick={event => event.stopPropagation()}>
                            <input type="checkbox" className="sr-only" checked={selectedTaskIds.includes(String(t.taskId))} onChange={() => toggleTaskSelection(t)} aria-label={`Pilih hasil ${index + 1}`} />
                            {selectedTaskIds.includes(String(t.taskId)) && <Check className="h-4 w-4" />}
                          </label>}
                        </div>
                      )}
                      {t.status === 'error' && <div className="min-h-64 space-y-3 p-5 sm:min-h-48"><p className="text-sm text-destructive-foreground">{t.error || 'Generation failed. Please try again.'}</p>{t.recoverable && <Button variant="outline" size="sm" onClick={() => recreateTask(t)} className="min-h-10"><RefreshCw className="h-4 w-4" />Generate lagi</Button>}</div>}
                      {t.status === 'cancelled' && <div className="flex min-h-64 items-center gap-2 p-5 text-sm text-muted-foreground sm:min-h-48"><Square className="h-4 w-4" />Generation dibatalkan.</div>}
                      {t.status === 'untracked' && <p className="min-h-64 p-5 text-sm text-muted-foreground sm:min-h-48">Tracking stopped in this browser. The server task may still be running.</p>}
                      <div className="hidden flex-col gap-2 border-t border-border px-3 py-2.5 text-xs text-muted-foreground sm:flex">
                        <span className="truncate">Hasil {index + 1} · {taskStatusLabel(t)}</span>
                        {t.status === 'done' && <div className="flex flex-wrap gap-1.5">{resultActions(t, index)}</div>}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="order-2 border-t border-border sm:hidden">
                  {group.items.length > 1 && <div className="flex items-center justify-between px-3 py-2">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => scrollBatch(group.id, -1)} disabled={currentSlide === 0} aria-label="Hasil sebelumnya"><ChevronLeft className="h-4 w-4" /></Button>
                    <div className="flex gap-1.5" aria-label={`Hasil ${currentSlide + 1} dari ${group.items.length}`}>{group.items.map((_, index) => <button key={index} type="button" onClick={() => { const slider = batchSliderRefs.current.get(group.id); slider?.scrollTo({ left: index * (slider.clientWidth || 0), behavior: 'smooth' }) }} className={cn('h-1.5 rounded-full transition-all', currentSlide === index ? 'w-5 bg-primary' : 'w-1.5 bg-muted-foreground/35')} aria-label={`Buka hasil ${index + 1}`} />)}</div>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => scrollBatch(group.id, 1)} disabled={currentSlide === group.items.length - 1} aria-label="Hasil berikutnya"><ChevronRight className="h-4 w-4" /></Button>
                  </div>}
                  <div className={cn('flex flex-col gap-2 px-2.5 py-2 text-xs text-muted-foreground', group.items.length > 1 && 'border-t border-border')}>
                    <span className="truncate">Hasil {currentSlide + 1} · {taskStatusLabel(mobileTask)}</span>
                    {mobileTask.status === 'done' && <div className="flex flex-wrap gap-1.5">{resultActions(mobileTask, currentSlide)}</div>}
                  </div>
                </div>
                {primary.prompt && <div className="order-3 min-w-0 px-3 py-2.5 text-sm leading-6 sm:px-4 sm:py-3">
                  <div className="flex items-start gap-2">
                    <div className={cn('break-words [overflow-wrap:anywhere] transition-all flex-1 min-w-0', primary.collapsed && primary.prompt.length > 150 && 'line-clamp-3')}>{primary.prompt}</div>
                    <Button variant="ghost" size="icon" onClick={() => copyBubblePrompt(primary)} className="h-7 w-7 shrink-0 mt-0.5 rounded-md text-primary hover:bg-primary/10" title="Salin prompt">{copiedTaskId === primary.id ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}</Button>
                  </div>
                  {primary.prompt.length > 150 && <button onClick={() => togglePromptCollapse(primary.id)} className="mt-2 flex items-center gap-1 text-xs text-primary hover:underline">{primary.collapsed ? <>Show more <ChevronDown className="h-3 w-3" /></> : <>Show less <ChevronUp className="h-3 w-3" /></>}</button>}
                  <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                    {primary.model && models[primary.model]?.name && <span>{models[primary.model].name}</span>}
                    {primary.ratio && <><span aria-hidden="true">·</span><span>{primary.ratio}</span></>}
                    <span aria-hidden="true">·</span><span>{group.items.length} hasil</span>
                    {(primary.referenceCount || primary.refUrls?.length || 0) > 0 && <><span aria-hidden="true">·</span><span>{primary.referenceCount || primary.refUrls?.length} referensi</span></>}
                    <span aria-hidden="true">·</span><span className="font-medium text-primary">{completedCount}/{group.items.length} selesai</span>
                    {group.items.filter(i => i.status === 'done').length >= 2 && <><span aria-hidden="true">·</span><button onClick={() => setCompareImages(group.items.filter(i => i.status === 'done' && i.url).map((i, idx) => ({ url: i.url!, label: `Hasil ${idx + 1}` })))} className="text-primary hover:underline">Bandingkan</button></>}
                  </div>
                </div>}
              </article>
            )
          })}
          <div ref={chatEndRef} className="h-px" aria-hidden="true" />
        </section>

        {showScrollShortcut && <Button
          variant="secondary"
          size="icon"
          onClick={() => scrollToLatest('smooth')}
          className={cn(
            'fixed right-4 z-[60] h-10 w-10 rounded-full border border-primary/30 bg-card shadow-lg',
            'lg:right-8'
          )}
          style={{ bottom: Math.max(16, composerHeight + 16) }}
          title="Scroll to latest result"
          aria-label="Scroll to latest result"
        >
          <ArrowDown className="h-4 w-4" />
        </Button>}

        {/* Compact Bottom Fixed Input Bar */}
        <div ref={composerRef} className="composer-dock fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur-xl">
          <div className="w-full p-2 sm:p-3">
            {error && <p className="mb-2 rounded-lg border border-destructive bg-destructive/10 px-3 py-2 text-xs text-destructive-foreground">{error}</p>}

            <div className="composer-shell rounded-2xl border border-primary/25 bg-card/95 p-2 shadow-2xl shadow-black/20 sm:p-3">
            <div className="flex flex-col">

            {modelMenuOpen && (
              <div className="composer-inline-panel composer-inline-panel--model relative order-0 mb-2">
                <span className="composer-panel-caret" aria-hidden="true" />
                <div className="max-h-[42vh] overflow-y-auto rounded-xl border border-border bg-background/95 p-3 text-card-foreground shadow-inner">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div><p className="text-sm font-semibold">Pilih model AI</p><p className="mt-0.5 text-xs text-muted-foreground">Sesuaikan model dengan gaya dan kebutuhan gambar.</p></div>
                  <Button type="button" variant="ghost" size="icon" onClick={() => setModelMenuOpen(false)} className="h-8 w-8 rounded-full" aria-label="Tutup daftar model"><X className="h-4 w-4" /></Button>
                </div>
                <div role="listbox" aria-label="Model AI" className="grid gap-1 sm:grid-cols-2">
                  {Object.entries(models).map(([id, m]) => <button key={id} type="button" role="option" aria-selected={model === id} onClick={() => chooseModel(id)} title={m.popular ? `Model paling banyak digunakan dalam 30 hari terakhir (${m.usageCount || 0} generate)` : undefined} className={cn('flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left text-sm transition hover:border-border hover:bg-muted', m.popular && 'model-popular-fire', model === id && 'border-primary/30 bg-primary/10 text-primary')}><span className="flex min-w-0 items-center gap-2"><span className="truncate font-medium">{m.name}</span>{m.popular && <span className="model-popular-badge inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"><Flame className="h-3 w-3" />Popular</span>}</span><span className="shrink-0 text-xs text-muted-foreground">{m.cost}cr</span></button>)}
                </div>
                </div>
              </div>
            )}
            
            {showSettings && (
              <div className="composer-inline-panel composer-inline-panel--options relative order-0 mb-2">
                <span className="composer-panel-caret" aria-hidden="true" />
                <div className="max-h-[45vh] overflow-visible rounded-xl border border-border bg-background/95 p-2.5 text-card-foreground shadow-inner sm:p-3">
                <div className="flex items-center justify-between gap-3 px-1 pb-2.5">
                  <div><p className="text-sm font-semibold">Options</p><p className="mt-0.5 text-[11px] text-muted-foreground">Output dan kontrol prompt.</p></div>
                  <Button type="button" variant="ghost" size="icon" onClick={() => { setShowSettings(false); setRatioMenuOpen(false) }} className="h-8 w-8 rounded-full" aria-label="Tutup options"><X className="h-4 w-4" /></Button>
                </div>

                <div className="grid grid-cols-2 gap-2 border-t border-border pt-2.5 sm:grid-cols-3">
                    <div className="space-y-1 text-xs font-medium text-muted-foreground">
                      <span>Rasio</span>
                      <div className="relative">
                        <button type="button" onClick={() => setRatioMenuOpen(value => !value)} aria-haspopup="listbox" aria-expanded={ratioMenuOpen} className="flex h-10 w-full items-center gap-2 rounded-lg border border-input bg-card px-3 text-sm font-medium text-foreground transition hover:border-primary/50">
                          <span className="flex h-5 w-5 items-center justify-center rounded-[2px] border-2 border-primary/70"><span className="block rounded-[1px] border border-primary" style={{ width: ratioPreviewStyle(ratio).width * 0.42, height: ratioPreviewStyle(ratio).height * 0.42 }} /></span>
                          <span className="hidden sm:inline">{ratio}</span><ChevronDown className={cn('ml-auto h-4 w-4 text-muted-foreground transition-transform sm:ml-0', ratioMenuOpen && 'rotate-180')} />
                        </button>
                        {ratioMenuOpen && <div role="listbox" aria-label="Pilihan rasio gambar" className="absolute bottom-full left-0 z-[110] mb-1 w-56 flex flex-col gap-0.5 rounded-xl border border-border bg-card p-1.5 text-card-foreground shadow-2xl sm:w-full sm:right-0">
                          {currentModel.ratios.map(r => { const selected = ratio === r; const size = ratioPreviewStyle(r); const label = r === '1:1' ? 'Square' : r === '16:9' ? 'Landscape' : r === '9:16' ? 'Portrait' : r === '4:3' ? 'Standard' : r === '3:4' ? 'Tall' : r === '3:2' ? 'Wide' : r === '2:3' ? 'Narrow' : r === '21:9' ? 'Ultrawide' : ''; return <button key={r} type="button" role="option" aria-selected={selected} onClick={() => { setRatio(r); setRatioMenuOpen(false) }} className={cn('flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition hover:bg-muted', selected && 'bg-primary/10 text-primary')}><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[3px] border-2 border-current"><span className="block rounded-[1px] bg-current" style={{ width: size.width * 0.35, height: size.height * 0.35 }} /></span><span className="font-medium">{r}</span><span className="ml-auto text-xs text-muted-foreground">{label}</span></button> })}
</div>}
                      </div>
                    </div>
                    {currentModel.resolutions.length > 0 && <label className="space-y-1 text-xs font-medium text-muted-foreground">Kualitas<Select value={resolution} onChange={e => setResolution(e.target.value)} className="h-10 w-full text-sm">{currentModel.resolutions.map(r => <option key={r} value={r}>{r.toUpperCase()}</option>)}</Select></label>}
                    <label className="space-y-1 text-xs font-medium text-muted-foreground">Jumlah<Input type="number" value={count} onChange={e => setCount(Math.min(3, Math.max(1, Number(e.target.value) || 1)))} min={1} max={3} className="h-10 w-full text-sm" /></label>
                </div>

                <div className="mt-2.5 space-y-2.5 border-t border-border pt-2.5">
                  <label className="block space-y-1.5 text-xs font-medium text-muted-foreground">Hindari (opsional)<Textarea id="negativePrompt" value={negativePrompt} onChange={e => setNegativePrompt(e.target.value)} placeholder="Contoh: blur, anatomi buruk..." className="h-16 w-full resize-none rounded-lg text-sm" /></label>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      { label: 'No blur', value: 'blur, blurry, out of focus, motion blur, depth of field blur' },
                      { label: 'Bad anatomy', value: 'bad anatomy, extra limbs, extra fingers, fused fingers, too many fingers, mutated hands, deformed hands, distorted face, bad proportions, disfigured, cloned face' },
                      { label: 'No text', value: 'text, watermark, signature, logo, letters, words, subtitles, caption' },
                      { label: 'Clean bg', value: 'cluttered background, messy, chaotic, busy background, random objects' },
                      { label: 'High quality', value: 'low quality, low resolution, jpeg artifacts, pixelated, grainy, ugly, worst quality, bad quality' },
                      { label: 'No nsfw', value: 'nsfw, nude, naked, topless, swimsuit, underwear, lingerie, revealing, suggestive, inappropriate, sexual' },
                    ].map(p => (
                      <button key={p.label} type="button" onClick={() => setNegativePrompt(prev => { const parts = prev ? prev.split(', ').filter(Boolean) : []; const vals = p.value.split(', '); for (const v of vals) if (!parts.includes(v)) parts.push(v); return parts.join(', ') })} className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground transition hover:border-primary/40 hover:text-foreground">{p.label}</button>
                    ))}
                  </div>
                </div>
                </div>
              </div>
            )}
            
            <div className="order-5 flex items-center gap-1.5 px-1 pt-1">
              <button type="button" aria-haspopup="listbox" aria-expanded={modelMenuOpen} onClick={() => { const next = !modelMenuOpen; setModelMenuOpen(next); if (next) { setShowSettings(false); setPromptExpanded(false); setReferenceMenuOpen(false); setReferenceLibraryOpen(false) } }} className={cn('flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold transition', modelMenuOpen ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/30')}>
                <span className="truncate max-w-[100px]">{currentModel.name || model}</span>
                <span className="text-[10px] text-muted-foreground">{currentModel.cost}cr</span>
                {modelMenuOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronUp className="h-3.5 w-3.5 shrink-0" />}
              </button>
              <button
                type="button"
                onClick={() => {
                  const newValue = !showSettings
                  if (newValue) { setPromptExpanded(false); setModelMenuOpen(false); setReferenceMenuOpen(false); setReferenceLibraryOpen(false) }
                  setShowSettings(newValue)
                }}
                className={cn("flex h-9 shrink-0 items-center gap-1 rounded-full border px-2.5 text-xs transition", showSettings ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary/30")}
              >
                <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" />
                <span>{ratio}</span>
                {resolution && <span className="text-muted-foreground">{resolution.toUpperCase()}</span>}
                <span className="text-muted-foreground">·</span>
                <span>{count}</span>
              </button>
              <div className="ml-auto flex items-center gap-1.5">
                <Button onClick={showStopButton ? cancelActive : (hasPrompt ? generate : toggleVoice)} disabled={showStopButton ? stopping || cancellationPending : generating || (hasPrompt && !user?.unlimited)} variant={showStopButton ? 'destructive' : 'default'} size="icon" className={cn('group relative h-9 w-9 shrink-0 rounded-full p-0 shadow-lg transition-colors', showStopButton ? 'shadow-destructive/30' : 'shadow-primary/20', !showStopButton && hasPrompt && !generating && 'generate-ready bg-primary shadow-primary/40')} title={showStopButton ? (cancellationPending ? 'Menunggu generation berhenti' : `Stop ${activeCount} generation aktif`) : hasPrompt ? (!user?.unlimited ? 'Beli plan unlimited untuk generate' : 'Generate image') : (listening ? 'Berhenti mendengarkan' : 'Voice to text')} aria-label={showStopButton ? 'Stop active generations' : hasPrompt ? 'Generate image' : (listening ? 'Berhenti mendengarkan' : 'Voice to text')}>
                  {generating || stopping ? <RefreshCw className="h-4 w-4 animate-spin" /> : showStopButton ? <Square className="h-4 w-4 fill-current" /> : hasPrompt ? <ArrowUp className="generate-ready-arrow h-5 w-5 transition-transform group-hover:-translate-y-0.5" /> : listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="order-2 mb-1 flex min-w-0 flex-wrap items-center gap-2 px-1 py-1">
                <div className="relative shrink-0">
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() => { const next = !referenceMenuOpen; setReferenceLibraryOpen(false); setReferenceMenuOpen(next); if (next) { setModelMenuOpen(false); setShowSettings(false); setPromptExpanded(false) } }}
                    disabled={!supportsImageInput}
                    className={cn('h-10 w-10 rounded-xl border-dashed p-0', referenceMenuOpen && 'border-primary bg-primary/10 text-primary')}
                    title={!supportsImageInput ? 'Referensi tidak didukung model ini' : 'Tambah gambar referensi'}
                    aria-label={!supportsImageInput ? 'Referensi tidak didukung model ini' : 'Tambah gambar referensi'}
                    aria-expanded={referenceMenuOpen}
                  >
                    <Plus className="h-5 w-5" />
                  </Button>
                </div>
                {referenceMenuOpen && !referenceLibraryOpen && <div className="absolute bottom-[calc(100%+0.75rem)] left-0 right-0 z-[100] max-h-[60vh] overflow-y-auto rounded-2xl border border-border bg-card p-3 text-card-foreground shadow-2xl">
                  <div className="mb-3 flex items-center justify-between gap-2 px-1">
                    <div><p className="text-sm font-semibold">Tambah gambar referensi</p><p className="mt-0.5 text-xs text-muted-foreground">Pilih sumber gambar yang ingin digunakan.</p></div>
                    <Button type="button" variant="ghost" size="icon" onClick={() => setReferenceMenuOpen(false)} className="h-8 w-8 rounded-full" aria-label="Tutup menu reference"><X className="h-4 w-4" /></Button>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button type="button" onClick={() => { referenceScrollY.current = window.scrollY; setReferenceMenuOpen(false); setReferenceLibraryOpen(false); refInput.current?.click() }} className="group flex min-h-20 w-full items-center gap-3 rounded-xl border border-border bg-background/60 p-3 text-left transition-colors hover:border-primary/50 hover:bg-muted">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><ImagePlus className="h-5 w-5" /></span>
                      <span className="min-w-0 flex-1"><span className="block text-sm font-medium">Unggah dari perangkat</span><span className="mt-0.5 block text-xs text-muted-foreground">Pilih gambar dari penyimpanan lokal.</span></span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </button>
                    <button type="button" onClick={openReferenceLibrary} className="group flex min-h-20 w-full items-center gap-3 rounded-xl border border-border bg-background/60 p-3 text-left transition-colors hover:border-primary/50 hover:bg-muted">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><GalleryHorizontalEnd className="h-5 w-5" /></span>
                      <span className="min-w-0 flex-1"><span className="block text-sm font-medium">Library Referensi</span><span className="mt-0.5 block text-xs text-muted-foreground">Gunakan kembali gambar yang tersimpan.</span></span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                    </button>
                  </div>
                </div>}
                {referenceLibraryLoading && <span className="text-xs text-muted-foreground">Memuat referensi...</span>}
                {referenceLibraryOpen && referenceMenuOpen && <div className="absolute bottom-[calc(100%+0.75rem)] left-0 right-0 z-[100] flex max-h-[65dvh] flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-2xl sm:left-auto sm:right-0 sm:w-[42rem] sm:max-w-[calc(100vw-2rem)]">
                  <div className="flex items-start justify-between gap-3 border-b border-border px-3 py-3 sm:px-4"><div><p className="text-sm font-semibold">Library Referensi</p><p className="mt-0.5 text-xs text-muted-foreground">Pilih sesuai urutan yang akan digunakan.</p></div><Button type="button" variant="ghost" size="icon" onClick={() => { setReferenceMenuOpen(false); setReferenceLibraryOpen(false); setReferenceLibrarySelected([]) }} className="h-8 w-8" aria-label="Tutup library"><X className="h-4 w-4" /></Button></div>
                  <div className="grid gap-2 border-b border-border p-3 sm:grid-cols-[minmax(0,1fr)_11rem] sm:px-4"><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={referenceLibraryQuery} onChange={event => setReferenceLibraryQuery(event.target.value)} placeholder="Cari referensi..." className="h-9 pl-9 text-xs" /></div><Select value={referenceLibrarySort} onChange={event => setReferenceLibrarySort(event.target.value)} className="h-9 text-xs"><option value="newest">Terbaru</option><option value="oldest">Terlama</option><option value="used">Terakhir dipakai</option><option value="favorites">Favorit</option><option value="name">Nama A–Z</option></Select></div>
                  <div className="min-h-0 flex-1 overflow-y-auto p-3">
                    {referenceLibraryLoading && !referenceLibrary.length ? <div className="grid min-h-32 place-items-center"><RefreshCw className="h-5 w-5 animate-spin text-primary" /></div> : visibleReferenceLibrary.length > 0 ? <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
                      {visibleReferenceLibrary.map(reference => { const selectedIndex = referenceLibrarySelected.indexOf(reference.id); const isSelected = selectedIndex >= 0; return <div key={reference.id} className={cn('group overflow-hidden rounded-xl border bg-background/50 transition-colors', isSelected ? 'border-primary ring-2 ring-primary/20' : 'border-border hover:border-primary/45')}>
                        <div className="relative aspect-square overflow-hidden bg-muted"><button type="button" onClick={() => toggleLibraryReference(reference.id)} className="block h-full w-full"><LoadingImage src={reference.thumbnailUrl} fallbackSrc={brokenImg()} alt={reference.name || 'Referensi tersimpan'} className="h-full w-full object-cover" /></button><span className={cn('pointer-events-none absolute left-1.5 top-1.5 z-[2] grid h-7 min-w-7 place-items-center rounded-full border px-1 text-[10px] font-semibold shadow-sm', isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-white/70 bg-black/55 text-white')}>{isSelected ? selectedIndex + 1 : <Check className="h-3.5 w-3.5" />}</span><button type="button" onClick={() => toggleLibraryFavorite(reference)} className={cn('absolute right-1.5 top-1.5 z-[3] grid h-7 w-7 place-items-center rounded-full border border-white/60 bg-black/55 text-white', reference.isFavorite && 'border-amber-300 bg-amber-400 text-black')} aria-label="Favorite"><Star className={cn('h-3.5 w-3.5', reference.isFavorite && 'fill-current')} /></button><button type="button" onClick={() => setReferencePreview(reference)} className="absolute bottom-1.5 right-1.5 z-[3] grid h-7 w-7 place-items-center rounded-full border border-white/60 bg-black/55 text-white" aria-label="Preview"><Eye className="h-3.5 w-3.5" /></button></div>
                        <button type="button" onClick={() => toggleLibraryReference(reference.id)} className="block w-full px-2 py-2 text-left"><span className="block truncate text-[10px] font-medium">{reference.name || 'Referensi'}</span><span className="mt-0.5 block text-[9px] text-muted-foreground">Dipakai {reference.usageCount || 0}×</span></button>
                      </div> })}
                    </div> : <div className="py-8 text-center"><ImagePlus className="mx-auto h-5 w-5 text-muted-foreground" /><p className="mt-2 text-xs text-muted-foreground">Referensi tidak ditemukan.</p></div>}
                  </div>
                  <div className="sticky bottom-0 border-t border-border bg-card p-3"><Button type="button" onClick={addSelectedLibraryReferences} disabled={!referenceLibrarySelected.length || referenceLibraryLoading} className="min-h-11 w-full">{referenceLibraryLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}Gunakan {referenceLibrarySelected.length || ''} referensi</Button></div>
                </div>}
                {refThumbs.map((url, i) => (
                  <div key={i} className="group relative flex flex-col items-center gap-0.5">
                    <div className="relative h-12 w-12 overflow-hidden rounded-lg border border-border sm:h-14 sm:w-14">
                      <button type="button" onClick={() => insertRefLabel(i)} className="block h-full w-full cursor-pointer" title={`Klik untuk sisipkan "${refs[i]?.name || `Gambar ${i + 1}`}" ke prompt`}>
                        <LoadingImage src={url} fallbackSrc={brokenImg()} alt={refs[i]?.name || `Gambar ${i + 1}`} className="h-full w-full object-cover" />
                      </button>
                      <Button
                        size="icon"
                        variant="destructive"
                        onClick={() => removeRef(i)}
                        className="absolute -right-1 -top-1 h-5 w-5 rounded-full text-xs"
                        aria-label={`Hapus ${refs[i]?.name || `Gambar ${i + 1}`}`}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                    <button type="button" onClick={() => insertRefLabel(i)} className="max-w-[56px] truncate text-center text-[9px] leading-tight text-muted-foreground hover:text-foreground transition-colors select-none" title={`Klik untuk sisipkan "${refs[i]?.name || `Gambar ${i + 1}`}" ke prompt`}>{refs[i]?.name || `Gambar ${i + 1}`}</button>
                  </div>
                ))}
                {referenceLoads > 0 && <div className="relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-muted sm:h-14 sm:w-14" role="status" aria-label="Memuat gambar referensi"><RefreshCw className="h-5 w-5 animate-spin text-primary" /></div>}
                <div className="ml-auto flex items-center gap-1">
                  <Button variant="ghost" size="icon" onClick={() => { const newValue = !promptExpanded; if (newValue) { setShowSettings(false); setRatioMenuOpen(false); setModelMenuOpen(false); setReferenceMenuOpen(false); setReferenceLibraryOpen(false) } setPromptExpanded(newValue) }} className="h-10 w-10 rounded-full" title={promptExpanded ? 'Kecilkan textbox' : 'Besarkan textbox'} aria-label={promptExpanded ? 'Kecilkan textbox' : 'Besarkan textbox'}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={cn('h-4 w-4 -rotate-45 transition-transform duration-200', promptExpanded && 'rotate-45')}>
                      <path d="M8 6 2 12l6 6" />
                      <path d="m16 6 6 6-6 6" />
                    </svg>
                  </Button>
                </div>
              </div>

            <div className="order-4 flex gap-2">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1" onDrop={handleDrop} onDragOver={handleDragOver} onDragEnter={() => setDragOver(true)} onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false) }}>
                    <Textarea 
                      ref={promptTextareaRef}
                      value={prompt} 
                      onChange={e => setPrompt(e.target.value)} 
                      onPaste={handlePromptPaste}
                      onFocus={() => {
                        setModelMenuOpen(false)
                        setShowSettings(false)
                        setRatioMenuOpen(false)
                      }}
                      placeholder="Ketik ide kamu di sini..."
                      aria-label="Image prompt"
                      className={cn('max-h-[60vh] resize-none border-0 bg-transparent px-2 py-3 text-base shadow-none focus-visible:outline-none focus-visible:ring-0', promptExpanded ? 'min-h-[45vh] overflow-y-auto pb-8 pr-16' : 'min-h-[76px] sm:min-h-[56px]')}
                    />
                    {promptExpanded && <span className="pointer-events-none absolute bottom-2 right-3 text-[11px] tabular-nums text-muted-foreground">{prompt.length}/2,000</span>}
                    {dragOver && (
                      <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-primary/10">
                        <div className="flex items-center gap-2 text-sm font-medium text-primary">
                          <ImagePlus className="h-5 w-5" />
                          Drop images to add as reference
                        </div>
                      </div>
                    )}
                    <input ref={refInput} type="file" accept="image/*" multiple className="hidden" onChange={e => handleRefs(e.target.files)} />
                  </div>
                </div>
                
              </div>
            </div>
            </div>
            </div>
          </div>
        </div>
      </div>
      <ImageDetailModal
        open={Boolean(lightboxImage)}
        url={lightboxImage?.url || ''}
        prompt={lightboxImage?.prompt || ''}
        model={lightboxImage?.model}
        ratio={lightboxImage?.ratio}
        resolution={lightboxImage?.resolution}
        isPublic={lightboxImage?.isPublic}
        onClose={() => setLightboxImage(null)}
        onCopyPrompt={copyDetailPrompt}
        onRecreate={() => { if (lightboxImage) { const task = lightboxImage; setLightboxImage(null); recreateTask(task) } }}
      />
      <PrivateShareDialog taskId={shareTarget?.taskId} imageUrl={shareTarget?.thumbnailUrl || shareTarget?.url} open={Boolean(shareTarget)} onOpenChange={open => !open && setShareTarget(null)} />
      <Dialog open={Boolean(deleteTarget)} onOpenChange={open => !open && setDeleteTarget(null)}>
        <DialogHeader>
          <DialogTitle>Hapus hasil ini?</DialogTitle>
          <DialogDescription>Hasil ini akan dihapus dari Chat dan Gallery. Tindakan ini tidak dapat dibatalkan.</DialogDescription>
          <DialogClose onClose={() => setDeleteTarget(null)} />
        </DialogHeader>
        <DialogContent className="space-y-3">
          <p className="line-clamp-3 rounded-xl border border-border bg-muted/40 p-3 text-sm text-muted-foreground">{deleteTarget?.prompt || 'Chat generate'}</p>
          <Button variant="destructive" className="w-full" onClick={() => deleteTarget && deleteTaskAndMaybeResult(deleteTarget)}><Trash className="h-4 w-4" />Hapus hasil</Button>
          <Button variant="ghost" className="w-full" onClick={() => setDeleteTarget(null)}>Batal</Button>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(publishTarget)} onOpenChange={open => !open && setPublishTarget(null)}>
        <DialogHeader>
          <DialogTitle>Post ke Explore</DialogTitle>
          <DialogDescription>Atur bagaimana komunitas dapat melihat dan menggunakan karya ini.</DialogDescription>
          <DialogClose onClose={() => setPublishTarget(null)} />
        </DialogHeader>
        <DialogContent className="space-y-4">
          {publishTarget?.thumbnailUrl && <div className="relative min-h-32 overflow-hidden rounded-xl bg-muted"><LoadingImage src={publishTarget.thumbnailUrl} fallbackSrc={publishTarget.url || brokenImg()} alt="Preview post" className="max-h-52 w-full rounded-xl object-contain" /></div>}
          <div><label className="text-sm font-medium" htmlFor="post-creator">Nama kreator</label><Input id="post-creator" value={publishCreatorName} onChange={e => setPublishCreatorName(e.target.value.slice(0, 50))} placeholder="Kreator Kreasya" className="mt-1.5" /></div>
          <div><label className="text-sm font-medium" htmlFor="post-caption">Caption <span className="font-normal text-muted-foreground">(opsional)</span></label><Textarea id="post-caption" value={publishCaption} onChange={e => setPublishCaption(e.target.value.slice(0, 500))} placeholder="Ceritakan sedikit tentang karya ini..." className="mt-1.5 min-h-24" /><p className="mt-1 text-right text-xs text-muted-foreground">{publishCaption.length}/500</p></div>
          <div><label className="text-sm font-medium" htmlFor="post-tags">Tags <span className="font-normal text-muted-foreground">(maks. 5)</span></label><Input id="post-tags" value={publishTags} onChange={e => setPublishTags(e.target.value)} placeholder="portrait, indonesia, cinematic" className="mt-1.5" /></div>
          <div className="space-y-2 rounded-xl border border-border bg-muted/25 p-3">
            <label className="flex cursor-pointer items-center justify-between gap-3 text-sm"><span><span className="block font-medium">Tampilkan prompt</span><span className="text-xs text-muted-foreground">Komunitas dapat mempelajari prompt karya.</span></span><input type="checkbox" checked={publishShowPrompt} onChange={e => { setPublishShowPrompt(e.target.checked); if (!e.target.checked) { setPublishAllowCopy(false); setPublishAllowRemix(false) } }} className="h-4 w-4 accent-primary" /></label>
            <label className="flex cursor-pointer items-center justify-between gap-3 border-t border-border pt-2 text-sm"><span><span className="block font-medium">Izinkan salin prompt</span><span className="text-xs text-muted-foreground">Menampilkan tombol Salin Prompt.</span></span><input type="checkbox" checked={publishShowPrompt && publishAllowCopy} disabled={!publishShowPrompt} onChange={e => setPublishAllowCopy(e.target.checked)} className="h-4 w-4 accent-primary" /></label>
            <label className="flex cursor-pointer items-center justify-between gap-3 border-t border-border pt-2 text-sm"><span><span className="block font-medium">Izinkan Remix Karya</span><span className="text-xs text-muted-foreground">Gambar dapat dipakai melalui reference existing.</span></span><input type="checkbox" checked={publishShowPrompt && publishAllowRemix} disabled={!publishShowPrompt} onChange={e => setPublishAllowRemix(e.target.checked)} className="h-4 w-4 accent-primary" /></label>
          </div>
          <Button className="w-full" onClick={publishGlobal} disabled={publishing}><Globe2 className="h-4 w-4" />{publishing ? 'Posting...' : 'Post Global'}</Button>
        </DialogContent>
      </Dialog>
      <Dialog open={clearChatOpen} onOpenChange={setClearChatOpen}>
        <DialogHeader>
          <DialogTitle>Hapus seluruh hasil?</DialogTitle>
          <DialogDescription>Semua hasil pada halaman Generate akan dihapus dari Chat dan Gallery. Tindakan ini tidak dapat dibatalkan.</DialogDescription>
          <DialogClose onClose={() => setClearChatOpen(false)} />
        </DialogHeader>
        <DialogContent className="space-y-3">
          <Button variant="destructive" className="w-full" onClick={() => clearAllChats()}><Trash className="h-4 w-4" />Hapus semua hasil</Button>
          <Button variant="ghost" className="w-full" onClick={() => setClearChatOpen(false)}>Batal</Button>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(interruptionNotice)} onOpenChange={open => {
        if (!open && interruptionNotice?.lastInterruptedAt) sessionStorage.setItem(`interruption_notice_${interruptionNotice.lastInterruptedAt}`, 'seen')
        if (!open) setInterruptionNotice(null)
      }}>
        <DialogHeader>
          <DialogTitle>Generation restarted safely</DialogTitle>
          <DialogDescription>Your active generation was stopped during a service update.</DialogDescription>
          <DialogClose onClose={() => {
            if (interruptionNotice?.lastInterruptedAt) sessionStorage.setItem(`interruption_notice_${interruptionNotice.lastInterruptedAt}`, 'seen')
            setInterruptionNotice(null)
          }} />
        </DialogHeader>
        <DialogContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{interruptionNotice?.count || 0} task{interruptionNotice?.count === 1 ? '' : 's'} interrupted. {user?.unlimited ? 'Your unlimited access is unchanged.' : `${interruptionNotice?.refundedCredits || 0} credits have been returned automatically.`}</p>
          <Button className="w-full" onClick={() => {
            if (interruptionNotice?.lastInterruptedAt) sessionStorage.setItem(`interruption_notice_${interruptionNotice.lastInterruptedAt}`, 'seen')
            setInterruptionNotice(null)
          }}>Continue</Button>
        </DialogContent>
      </Dialog>
      {compareImages && <ImageCompare images={compareImages} onClose={() => setCompareImages(null)} />}
      {showPinnedList && (() => {
        const pinned = tasks.filter(t => pinnedTaskIds.has(String(t.taskId)) && t.status === 'done')
        return (
          <div className="fixed inset-0 z-[9999] bg-background/80 flex items-start justify-center pt-20" onClick={() => setShowPinnedList(false)}>
            <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div className="flex items-center gap-2">
                  <Pin className="h-4 w-4 text-amber-500 fill-current" />
                  <span className="text-sm font-semibold">Pinned Messages</span>
                  <span className="text-xs text-muted-foreground">{pinned.length}</span>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowPinnedList(false)}><X className="h-4 w-4" /></Button>
              </div>
              <div className="max-h-[60vh] overflow-y-auto p-2 space-y-1">
                {pinned.map((t, i) => (
                  <button key={t.id} onClick={() => { setShowPinnedList(false); setActivePinnedIndex(i); setTimeout(() => cyclePinned(), 100) }} className="flex items-center gap-3 w-full rounded-lg p-2 hover:bg-muted transition text-left">
                    {t.thumbnailUrl && <img src={t.thumbnailUrl} className="h-10 w-10 rounded object-cover shrink-0" />}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-muted-foreground">#{i + 1}</p>
                      <p className="text-sm truncate">{t.prompt || 'Gambar'}</p>
                    </div>
                  </button>
                ))}
                {pinned.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Belum ada pesan tersemat</p>}
              </div>
            </div>
          </div>
        )
      })()}
      {referencePreview && (
        <div className="fixed inset-0 z-[9999] bg-black/70 flex items-center justify-center p-4" onClick={() => setReferencePreview(null)}>
          <div className="relative max-h-[90vh] max-w-[90vw] rounded-2xl overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
            <img src={referencePreview.url} alt={referencePreview.name || 'Preview referensi'} className="max-h-[85vh] max-w-[85vw] object-contain" />
            <div className="absolute bottom-3 left-0 right-0 flex items-center justify-center gap-2">
              <span className="rounded-full bg-black/60 px-3 py-1.5 text-xs text-white">{referencePreview.name || 'Referensi'}</span>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full bg-black/60 text-white hover:bg-black/80" onClick={() => setReferencePreview(null)} aria-label="Tutup preview"><X className="h-4 w-4" /></Button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
