import { useCallback, useEffect, useState } from 'react'
import { Activity, Ban, Clock3, RefreshCw, CheckCircle2, XCircle, Clock, Zap, Pause, Play, Settings, ArrowUp, MoreVertical, Eye } from 'lucide-react'
import { AdminLayout } from '../components/Layout'
import { PortalDropdown } from '../components/PortalDropdown'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { Label } from '../components/ui/label'
import { Select } from '../components/ui/select'

interface QueueTask {
  taskId: string
  email: string
  status: 'queued' | 'running'
  prompt: string
  model: string
  ratio: string
  resolution: string
  cost: number
  createdAt: string
  startedAt: string | null
  cancelRequestedAt: string | null
  retryCount: number
  position: number | null
  estimatedCompletion: string | null
}

interface QueueStats {
  queued: number
  active: number
  stopRequested: number
  maxConcurrent: number
  maxQueued: number
  paused: boolean
  avgWaitTime: number
  avgProcessingTime: number
}

interface HistoryTask {
  taskId: string
  email: string
  status: string
  prompt: string
  model: string
  cost: number
  createdAt: string
  finishedAt: string | null
  cancelledAt: string | null
  processingDuration: number | null
  error: string | null
}

export default function AdminQueue() {
  const [tasks, setTasks] = useState<QueueTask[]>([])
  const [stats, setStats] = useState<QueueStats>({ queued: 0, active: 0, stopRequested: 0, maxConcurrent: 4, maxQueued: 100, paused: false, avgWaitTime: 0, avgProcessingTime: 0 })
  const [analytics, setAnalytics] = useState<any>(null)
  const [history, setHistory] = useState<HistoryTask[]>([])
  const [, setBusy] = useState('')
  const [message, setMessage] = useState('')
  
  // Filters
  const [statusFilter, setStatusFilter] = useState('all')
  const [modelFilter, setModelFilter] = useState('all')
  const [userFilter, setUserFilter] = useState('')
  const [sortBy, setSortBy] = useState('created_at')
  
  // View state
  const [activeTab, setActiveTab] = useState<'active' | 'completed' | 'failed' | 'cancelled' | 'analytics'>('active')
  const [selectedTasks, setSelectedTasks] = useState<Set<string>>(new Set())
  const [detailTask, setDetailTask] = useState<any>(null)
  const [showConfig, setShowConfig] = useState(false)
  const [configForm, setConfigForm] = useState({ maxConcurrent: 4, maxQueued: 100 })
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  
  const refresh = useCallback(async () => {
    const params = new URLSearchParams({
      status: statusFilter,
      model: modelFilter,
      user: userFilter,
      sort: sortBy
    })
    
    const [queueRes, analyticsRes] = await Promise.all([
      fetch(`/api/admin/queue?${params}`, { credentials: 'include' }),
      fetch('/api/admin/queue/analytics', { credentials: 'include' })
    ])
    
    if (queueRes.ok) {
      const data = await queueRes.json()
      setTasks(data.tasks)
      setStats(data.stats)
      setConfigForm({ maxConcurrent: data.stats?.maxConcurrent || 4, maxQueued: data.stats?.maxQueued || 100 })
    }
    
    if (analyticsRes.ok) {
      setAnalytics(await analyticsRes.json())
    }
  }, [statusFilter, modelFilter, userFilter, sortBy])
  
  const loadHistory = useCallback(async (type: string) => {
    const res = await fetch(`/api/admin/queue/history?type=${type}&limit=100`, { credentials: 'include' })
    if (res.ok) setHistory(await res.json())
  }, [])
  
  useEffect(() => { 
    refresh()
    const timer = window.setInterval(refresh, 10000)
    return () => window.clearInterval(timer)
  }, [refresh])
  
  useEffect(() => {
    if (activeTab !== 'active' && activeTab !== 'analytics') {
      loadHistory(activeTab)
    }
  }, [activeTab, loadHistory])
  
  useEffect(() => {
    function handleClickOutside() { setOpenMenu(null) }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  async function action(id: string, kind: 'cancel' | 'retry' | 'priority') {
    setBusy(`${kind}:${id}`)
    const url = kind === 'priority' ? `/api/admin/tasks/${id}/priority` : `/api/admin/tasks/${id}/${kind}`
    const res = await fetch(url, { method: 'POST', credentials: 'include' })
    const body = await res.json().catch(() => ({}))
    
    if (res.ok) {
      if (kind === 'cancel') setMessage('Task cancelled')
      else if (kind === 'retry') setMessage(`Retry queued as ${body.taskId}`)
      else if (kind === 'priority') setMessage('Task moved to front of queue')
    } else {
      setMessage(body.error || `${kind} failed`)
    }
    
    setBusy('')
    setOpenMenu(null)
    refresh()
  }
  
  async function bulkCancel() {
    if (selectedTasks.size === 0) return
    if (!confirm(`Cancel ${selectedTasks.size} selected tasks?`)) return
    
    const res = await fetch('/api/admin/queue/bulk-cancel', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskIds: Array.from(selectedTasks) })
    })
    
    const data = await res.json().catch(() => ({}))
    setMessage(res.ok ? `Cancelled ${data.cancelled} tasks` : data.error || 'Bulk cancel failed')
    setSelectedTasks(new Set())
    refresh()
  }
  
  async function cancelAllQueued() {
    if (!confirm('Cancel ALL queued tasks? Running tasks will not be affected.')) return
    
    const res = await fetch('/api/admin/queue/bulk-cancel', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cancelAll: true })
    })
    
    const data = await res.json().catch(() => ({}))
    setMessage(res.ok ? `Cancelled ${data.cancelled} queued tasks` : data.error || 'Cancel all failed')
    refresh()
  }
  
  async function togglePause() {
    const res = await fetch('/api/admin/queue/pause', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paused: !(stats?.paused || false) })
    })
    
    const data = await res.json().catch(() => ({}))
    setMessage(res.ok ? `Queue ${data.paused ? 'paused' : 'resumed'}` : 'Toggle failed')
    refresh()
  }
  
  async function saveConfig() {
    const res = await fetch('/api/admin/queue/config', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(configForm)
    })
    
    const data = await res.json().catch(() => ({}))
    setMessage(res.ok ? 'Config updated' : data.error || 'Update failed')
    setShowConfig(false)
    refresh()
  }
  
  async function killStuck() {
    if (!confirm('Kill all tasks running for more than 10 minutes?')) return
    
    const res = await fetch('/api/admin/queue/kill-stuck', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ minutes: 10 })
    })
    
    const data = await res.json().catch(() => ({}))
    setMessage(res.ok ? `Stop requested for ${data.cancellationRequested || 0} stuck tasks` : data.error || 'Stop request failed')
    refresh()
  }
  
  async function loadTaskDetail(taskId: string) {
    const res = await fetch(`/api/admin/tasks/${taskId}/detail`, { credentials: 'include' })
    if (res.ok) setDetailTask(await res.json())
  }
  
  function toggleSelect(taskId: string) {
    const newSet = new Set(selectedTasks)
    if (newSet.has(taskId)) newSet.delete(taskId)
    else newSet.add(taskId)
    setSelectedTasks(newSet)
  }
  
  function toggleSelectAll() {
    if (selectedTasks.size === tasks.length) setSelectedTasks(new Set())
    else setSelectedTasks(new Set(tasks.map(t => t.taskId)))
  }
  
  function formatDuration(seconds: number) {
    if (!seconds) return '-'
    const min = Math.floor(seconds / 60)
    const sec = seconds % 60
    return `${min}m ${sec}s`
  }

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-primary">Workload</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Generation queue</h1>
            <p className="mt-2 text-sm text-muted-foreground">Monitor and manage image generation queue in real-time.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="icon" onClick={refresh}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowConfig(true)}>
              <Settings className="h-4 w-4" /> Config
            </Button>
            <Button 
              variant={stats?.paused ? 'default' : 'outline'} 
              size="sm" 
              onClick={togglePause} disabled={!stats}
            >
              {stats?.paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
              {stats?.paused ? 'Resume' : 'Pause'}
            </Button>
          </div>
        </div>
        
        {/* Stats Cards */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <Card>
            <CardContent className="flex items-center gap-3 p-5">
              <Clock3 className="h-7 w-7 text-foreground" />
              <div>
                <p className="text-2xl font-semibold">{stats?.queued || 0}</p>
                <p className="text-xs text-muted-foreground">Queued / {stats?.maxQueued || 0}</p>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="flex items-center gap-3 p-5">
              <Activity className="h-7 w-7 text-success" />
              <div>
                <p className="text-2xl font-semibold">{stats?.active || 0}</p>
                <p className="text-xs text-muted-foreground">Active / {stats?.maxConcurrent || 0}</p>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="flex items-center gap-3 p-5">
              <Ban className="h-7 w-7 text-destructive" />
              <div>
                <p className="text-2xl font-semibold">{stats?.stopRequested || 0}</p>
                <p className="text-xs text-muted-foreground">Stop Requested</p>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="flex items-center gap-3 p-5">
              <Clock className="h-7 w-7 text-primary" />
              <div>
                <p className="text-2xl font-semibold">{formatDuration(stats?.avgWaitTime || 0)}</p>
                <p className="text-xs text-muted-foreground">Avg Wait</p>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="flex items-center gap-3 p-5">
              <Zap className="h-7 w-7 text-warning" />
              <div>
                <p className="text-2xl font-semibold">{formatDuration(stats?.avgProcessingTime || 0)}</p>
                <p className="text-xs text-muted-foreground">Avg Process</p>
              </div>
            </CardContent>
          </Card>
          
          {analytics && (
            <Card>
              <CardContent className="flex items-center gap-3 p-5">
                <CheckCircle2 className="h-7 w-7 text-success" />
                <div>
                  <p className="text-2xl font-semibold">{analytics.today.completed || 0}</p>
                  <p className="text-xs text-muted-foreground">Today</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
        
        {message && (
          <div className="rounded-xl border border-border bg-primary/10 p-3 text-sm text-muted-foreground">
            {message}
          </div>
        )}
        
        {/* Tabs */}
        <div className="flex gap-2 border-b">
          <button
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'active' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            onClick={() => setActiveTab('active')}
          >
            Active Queue ({tasks.length})
          </button>
          <button
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'completed' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            onClick={() => setActiveTab('completed')}
          >
            Completed
          </button>
          <button
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'failed' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            onClick={() => setActiveTab('failed')}
          >
            Failed
          </button>
          <button
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'cancelled' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            onClick={() => setActiveTab('cancelled')}
          >
            Cancelled
          </button>
          <button
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'analytics' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            onClick={() => setActiveTab('analytics')}
          >
            Analytics
          </button>
        </div>
        
        {/* Active Queue Tab */}
        {activeTab === 'active' && (
          <>
            {/* Filters */}
            <Card>
              <CardContent className="p-4">
                <div className="grid gap-2 sm:grid-cols-4">
                  <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                    <option value="all">All Status</option>
                    <option value="queued">Queued</option>
                    <option value="running">Running</option>
                  </Select>
                  
                  <Select value={modelFilter} onChange={e => setModelFilter(e.target.value)}>
                    <option value="all">All Models</option>
                    <option value="seedream-5-0-pro">SeeDream Pro</option>
                    <option value="seedream-5-0-lite">SeeDream Lite</option>
                    <option value="midjourney-v7">Midjourney v7</option>
                    <option value="grok-image">Grok Image</option>
                  </Select>
                  
                  <Input
                    value={userFilter}
                    onChange={e => setUserFilter(e.target.value)}
                    placeholder="Filter by user email"
                  />
                  
                  <Select value={sortBy} onChange={e => setSortBy(e.target.value)}>
                    <option value="created_at">Oldest First</option>
                    <option value="cost_desc">Cost (High)</option>
                    <option value="cost_asc">Cost (Low)</option>
                    <option value="model">By Model</option>
                  </Select>
                </div>
              </CardContent>
            </Card>
            
            {/* Bulk Actions */}
            {selectedTasks.size > 0 && (
              <Card className="border-destructive/50">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">{selectedTasks.size} tasks selected</div>
                    <div className="flex gap-2">
                      <Button variant="destructive" size="sm" onClick={bulkCancel}>
                        <Ban className="h-3.5 w-3.5" /> Cancel Selected
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setSelectedTasks(new Set())}>
                        Clear
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
            
            {/* Emergency Actions */}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={cancelAllQueued}>
                <Ban className="h-3.5 w-3.5" /> Cancel All Queued
              </Button>
              <Button variant="outline" size="sm" onClick={killStuck}>
                <XCircle className="h-3.5 w-3.5" /> Kill Stuck Tasks
              </Button>
            </div>
            
            {/* Tasks Table */}
            <Card>
              <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-8">
                          <input
                            type="checkbox"
                            checked={tasks.length > 0 && selectedTasks.size === tasks.length}
                            onChange={toggleSelectAll}
                            className="w-4 h-4"
                          />
                        </TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Task</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead>Generation</TableHead>
                        <TableHead>Queue</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead className="w-16">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {!tasks.length && (
                        <TableRow>
                          <TableCell colSpan={8} className="h-28 text-center text-muted-foreground">
                            No queued or running tasks.
                          </TableCell>
                        </TableRow>
                      )}
                      {tasks.map(task => (
                        <TableRow key={task.taskId}>
                          <TableCell>
                            <input
                              type="checkbox"
                              checked={selectedTasks.has(task.taskId)}
                              onChange={() => toggleSelect(task.taskId)}
                              className="w-4 h-4"
                            />
                          </TableCell>
                          <TableCell>
                            <Badge variant={
                              task.cancelRequestedAt ? 'secondary' :
                              task.status === 'running' ? 'default' : 
                              'secondary'
                            }>
                              {task.cancelRequestedAt ? 'stopping' : task.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div 
                              className="max-w-52 truncate font-mono text-xs cursor-pointer hover:text-primary"
                              onClick={() => loadTaskDetail(task.taskId)}
                            >
                              {task.taskId}
                            </div>
                            <div className="max-w-64 truncate text-xs text-muted-foreground" title={task.prompt}>
                              {task.prompt}
                            </div>
                          </TableCell>
                          <TableCell className="max-w-44 truncate">{task.email}</TableCell>
                          <TableCell>
                            <div className="text-xs">{task.model}</div>
                            <div className="text-xs text-muted-foreground">
                              {task.ratio} · {task.resolution} · {task.cost} cr
                            </div>
                          </TableCell>
                          <TableCell>
                            {task.position && (
                              <div className="text-xs">
                                <div className="font-medium">Position: {task.position}</div>
                                <div className="text-muted-foreground">
                                  ETA: ~{Math.ceil(task.position * (stats?.avgProcessingTime || 30) / 60)} min
                                </div>
                              </div>
                            )}
                            {task.status === 'running' && <Badge variant="default">Processing</Badge>}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                            {new Date(task.createdAt).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <div className="relative">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setOpenMenu(openMenu === task.taskId ? null : task.taskId)
                                }}
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                              <PortalDropdown open={openMenu === task.taskId} onClose={() => setOpenMenu(null)} className="w-48 py-1">
                                <button
                                  className="w-full text-left px-4 py-2 text-sm hover:bg-accent flex items-center gap-2"
                                  onClick={(e) => { e.stopPropagation(); loadTaskDetail(task.taskId); }}
                                >
                                  <Eye className="h-3.5 w-3.5" /> View Details
                                </button>
                                {task.status === 'queued' && (
                                  <button
                                    className="w-full text-left px-4 py-2 text-sm hover:bg-accent flex items-center gap-2"
                                    onClick={(e) => { e.stopPropagation(); action(task.taskId, 'priority'); }}
                                  >
                                    <ArrowUp className="h-3.5 w-3.5" /> Priority Boost
                                  </button>
                                )}
                                <div className="border-t my-1"></div>
                                <button
                                  className="w-full text-left px-4 py-2 text-sm hover:bg-destructive/10 text-destructive flex items-center gap-2"
                                  onClick={(e) => { e.stopPropagation(); action(task.taskId, 'cancel'); }}
                                  disabled={!!task.cancelRequestedAt}
                                >
                                  <Ban className="h-3.5 w-3.5" /> {task.status === 'running' ? 'Request Stop' : 'Cancel'}
                                </button>
                              </PortalDropdown>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
              </CardContent>
            </Card>
          </>
        )}
        
        {/* History Tabs */}
        {(activeTab === 'completed' || activeTab === 'failed' || activeTab === 'cancelled') && (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                    <TableRow>
                      <TableHead>Task ID</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Model</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Finished</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!history.length && (
                      <TableRow>
                        <TableCell colSpan={6} className="h-28 text-center text-muted-foreground">
                          No {activeTab} tasks.
                        </TableCell>
                      </TableRow>
                    )}
                    {history.map(task => (
                      <TableRow key={task.taskId}>
                        <TableCell className="font-mono text-xs">{task.taskId}</TableCell>
                        <TableCell>{task.email}</TableCell>
                        <TableCell>{task.model}</TableCell>
                        <TableCell>{formatDuration(task.processingDuration || 0)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(task.createdAt).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {task.finishedAt ? new Date(task.finishedAt).toLocaleString() : 
                           task.cancelledAt ? new Date(task.cancelledAt).toLocaleString() : '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
            </CardContent>
          </Card>
        )}
        
        {/* Analytics Tab */}
        {activeTab === 'analytics' && analytics && (
          <div className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle>Today's Stats</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Completed</span>
                    <span className="font-semibold text-success">{analytics.today.completed}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Failed</span>
                    <span className="font-semibold text-error">{analytics.today.failed}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Cancelled</span>
                    <span className="font-semibold text-warning">{analytics.today.cancelled}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Total</span>
                    <span className="font-semibold">{analytics.today.total}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Credits Used</span>
                    <span className="font-semibold">{analytics.today.credits_used || 0}</span>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>By Model (24h)</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {analytics.byModel.map((m: any, idx: number) => (
                    <div key={idx} className="flex justify-between text-sm">
                      <span className="truncate">{m.model}</span>
                      <span className="font-semibold">{m.count}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>Top Users Today</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {analytics.topUsers.map((u: any, idx: number) => (
                    <div key={idx} className="flex justify-between text-sm">
                      <span className="truncate">{u.email}</span>
                      <span className="font-semibold">{u.count}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
      
      {/* Config Dialog */}
      <Dialog open={showConfig} onOpenChange={setShowConfig}>
        <DialogHeader>
          <DialogTitle>Queue Configuration</DialogTitle>
          <DialogDescription>Adjust queue limits and behavior</DialogDescription>
        </DialogHeader>
        <DialogContent className="space-y-4">
          <div className="space-y-2">
            <Label>Max Concurrent Tasks</Label>
            <Input
              type="number"
              value={configForm.maxConcurrent}
              onChange={e => setConfigForm({ ...configForm, maxConcurrent: parseInt(e.target.value) })}
              min={1}
              max={20}
            />
          </div>
          <div className="space-y-2">
            <Label>Max Queued Tasks</Label>
            <Input
              type="number"
              value={configForm.maxQueued}
              onChange={e => setConfigForm({ ...configForm, maxQueued: parseInt(e.target.value) })}
              min={10}
              max={1000}
            />
          </div>
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setShowConfig(false)}>Cancel</Button>
          <Button onClick={saveConfig}>Save</Button>
        </DialogFooter>
      </Dialog>
      
      {/* Task Detail Dialog */}
      {detailTask && (
        <Dialog open={!!detailTask} onOpenChange={() => setDetailTask(null)}>
          <DialogHeader>
            <DialogTitle>Task Details</DialogTitle>
          </DialogHeader>
          <DialogContent className="space-y-4">
            <div className="space-y-2">
              <div><strong>Task ID:</strong> {detailTask.task.task_id}</div>
              <div><strong>User:</strong> {detailTask.task.email}</div>
              <div><strong>Model:</strong> {detailTask.task.model}</div>
              <div><strong>Status:</strong> {detailTask.task.status}</div>
              <div><strong>Prompt:</strong> {detailTask.task.prompt}</div>
              <div><strong>Cost:</strong> {detailTask.task.cost} credits</div>
              <div><strong>Created:</strong> {new Date(detailTask.task.created_at).toLocaleString()}</div>
              {detailTask.task.started_at && (
                <div><strong>Started:</strong> {new Date(detailTask.task.started_at).toLocaleString()}</div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </AdminLayout>
  )
}
