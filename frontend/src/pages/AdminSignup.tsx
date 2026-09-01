import { useEffect, useRef, useState } from 'react'
import { Activity, CheckCircle2, CircleX, Clock, Database, Download, Loader2, Play, RefreshCw, Settings, Square, Terminal, TrendingUp, Users } from 'lucide-react'
import { AdminLayout } from '../components/Layout'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Select } from '../components/ui/select'
import { Input } from '../components/ui/input'
import { Progress } from '../components/ui/progress'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { Badge } from '../components/ui/badge'
import { Label } from '../components/ui/label'

interface BatchItem { position: number; threadId: number | null; email: string; status: string; step: string; balance: number | null; error: string | null }
interface Batch { id: string; status: string; total: number; success: number; failed: number; items: BatchItem[]; createdAt?: string; finishedAt?: string; threads?: number }
interface Account { email: string; balance: number; createdAt: string; apiKey?: string }
interface BatchHistory { id: string; total: number; success: number; failed: number; createdAt: string; finishedAt: string; duration: number; successRate: number; threads: number }

export default function AdminSignup() {
  const [count, setCount] = useState(10), [threads, setThreads] = useState(2)
  const [running, setRunning] = useState(false), [logs, setLogs] = useState<string[]>([])
  const [progress, setProgress] = useState(0), [success, setSuccess] = useState(0), [fail, setFail] = useState(0)
  const [batchId, setBatchId] = useState(''), [message, setMessage] = useState('')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [history, setHistory] = useState<BatchHistory[]>([])
  const [stats, setStats] = useState({ totalAccounts: 0, totalCredits: 0, avgTime: 0, totalBatches: 0 })
  const [activeTab, setActiveTab] = useState('current')
  const [retryCount, setRetryCount] = useState(2)
  const [timeout, setTimeout] = useState(30)
  const controllerRef = useRef<AbortController | null>(null)

  function recover(batch: Batch | null) {
    if (!batch) return
    setBatchId(batch.id); setRunning(batch.status === 'running'); setSuccess(batch.success || batch.items.filter(i => i.status === 'ok').length); setFail(batch.failed || batch.items.filter(i => i.status === 'fail').length)
    const completed = batch.items.filter(i => ['ok', 'fail', 'stopped'].includes(i.status)).length
    setProgress(batch.status === 'completed' ? 100 : Math.round((completed / Math.max(1, batch.total)) * 100))
    setLogs(batch.items.map(i => `[T${i.threadId || '-'}] ${i.status === 'ok' ? 'OK' : i.status === 'fail' ? 'FAIL' : i.status.toUpperCase()} ${i.position}/${batch.total} ${i.email || ''} ${i.step || ''}${i.balance != null ? ` | ${i.balance}cr` : ''}${i.error ? ` - ${i.error}` : ''}`))
  }

  async function loadAccounts() {
    const res = await fetch('/api/pool/signup/accounts', { credentials: 'include' })
    if (res.ok) {
      const data = await res.json()
      setAccounts(data.accounts || [])
    }
  }

  async function loadHistory() {
    const res = await fetch('/api/pool/signup/history', { credentials: 'include' })
    if (res.ok) {
      const data = await res.json()
      setHistory(data.history || [])
    }
  }

  async function loadStats() {
    const res = await fetch('/api/pool/signup/stats', { credentials: 'include' })
    if (res.ok) {
      const data = await res.json()
      setStats(data)
    }
  }

  useEffect(() => {
    fetch('/api/pool/signup/status', { credentials: 'include' }).then(r => r.ok ? r.json() : null).then(recover)
    loadAccounts()
    loadHistory()
    loadStats()
    return () => controllerRef.current?.abort()
  }, [])

  function handleEvent(d: Record<string, unknown>) {
    if (d.type === 'start') { setBatchId(String(d.batchId)); setRunning(true) }
    if (d.type === 'thread') {
      setProgress(Number(d.progress || 0)); const status = String(d.status); const thread = String(d.threadId || '-'); const line = `[T${thread}] ${status === 'ok' ? 'OK' : status === 'fail' ? 'FAIL' : status.toUpperCase()} ${d.index}/${d.total} ${d.email || ''} ${d.step || status}${d.balance != null ? ` | ${d.balance}cr` : ''}${d.error ? ` - ${d.error}` : ''}`
      setLogs(prev => { const at = prev.findIndex(item => item.startsWith(`[T${thread}]`)); if (at >= 0) { const next = [...prev]; next[at] = line; return next } return [...prev, line] })
      if (status === 'ok') setSuccess(s => s + 1); if (status === 'fail') setFail(f => f + 1)
    }
    if (d.type === 'done') { setProgress(100); setSuccess(Number(d.success || 0)); setFail(Number(d.fail || 0)); setRunning(false); setLogs(prev => [...prev, `DONE: ${d.success}/${Number(d.success || 0) + Number(d.fail || 0)}`]); loadAccounts(); loadHistory(); loadStats() }
  }

  async function startSignup() {
    controllerRef.current?.abort(); const controller = new AbortController(); controllerRef.current = controller
    setRunning(true); setLogs([]); setProgress(0); setSuccess(0); setFail(0); setMessage('')
    try {
      const res = await fetch('/api/pool/signup', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ count, threads, retryCount, timeout }), signal: controller.signal })
      if (!res.ok || !res.body) { const error = await res.json().catch(() => ({})); if (error.batchId) setBatchId(error.batchId); throw new Error(error.error || 'Signup request failed') }
      const reader = res.body.getReader(), decoder = new TextDecoder(); let buffer = ''
      while (true) { const { done, value } = await reader.read(); if (done) break; buffer += decoder.decode(value, { stream: true }); const events = buffer.split('\n\n'); buffer = events.pop() || ''; for (const event of events) { const data = event.split('\n').find(line => line.startsWith('data: ')); if (data) try { handleEvent(JSON.parse(data.slice(6))) } catch { /* Ignore malformed SSE frames. */ } } }
    } catch (error) { if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : 'Signup failed') } finally { if (controllerRef.current === controller) controllerRef.current = null; if (!controller.signal.aborted) setRunning(false) }
  }

  async function stopSignup() {
    if (!batchId) return
    const res = await fetch('/api/pool/signup/stop', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ batchId }) }); const body = await res.json().catch(() => ({}))
    setMessage(res.ok ? `Batch ${batchId} stopped. In-flight browser work may finish its current cooperative step.` : body.error || 'Unable to stop batch')
    if (res.ok) { controllerRef.current?.abort(); controllerRef.current = null; setRunning(false); fetch('/api/pool/signup/status', { credentials: 'include' }).then(r => r.json()).then(recover) }
  }

  async function exportAccounts() {
    const csv = ['Email,Balance,Created'].concat(accounts.map(a => `${a.email},${a.balance},${a.createdAt}`)).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `accounts-${Date.now()}.csv`
    a.click()
  }

  async function deleteAccount(email: string) {
    if (!confirm(`Delete account ${email}?`)) return
    const res = await fetch('/api/pool/signup/accounts', { method: 'DELETE', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) })
    if (res.ok) loadAccounts()
  }

  const errorGroups = logs.reduce((acc, log) => {
    if (log.includes('FAIL')) {
      const match = log.match(/- (.+)$/)
      const error = match ? match[1] : 'Unknown'
      const key = error.includes('timeout') ? 'Timeout' : error.includes('No signup button') ? 'No signup button' : error.includes('API key not found') ? 'API key not found' : 'Other'
      acc[key] = (acc[key] || 0) + 1
    }
    return acc
  }, {} as Record<string, number>)

  return <AdminLayout><div className="space-y-6">
    <div><p className="text-sm font-medium text-primary">Operations</p><h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Account signup</h1><p className="mt-2 text-sm text-muted-foreground">Generate, stop, and manage automated account batches with templates and monitoring.</p></div>

    <div className="grid gap-3 sm:grid-cols-4">
      <Card><CardContent className="flex items-center gap-4 p-5"><Users className="h-8 w-8 text-primary" /><div><div className="text-2xl font-semibold">{stats.totalAccounts}</div><div className="text-xs text-muted-foreground">Total accounts</div></div></CardContent></Card>
      <Card><CardContent className="flex items-center gap-4 p-5"><Database className="h-8 w-8 text-primary" /><div><div className="text-2xl font-semibold">{stats.totalCredits}</div><div className="text-xs text-muted-foreground">Total credits</div></div></CardContent></Card>
      <Card><CardContent className="flex items-center gap-4 p-5"><Clock className="h-8 w-8 text-primary" /><div><div className="text-2xl font-semibold">{stats.avgTime}s</div><div className="text-xs text-muted-foreground">Avg time/account</div></div></CardContent></Card>
      <Card><CardContent className="flex items-center gap-4 p-5"><TrendingUp className="h-8 w-8 text-primary" /><div><div className="text-2xl font-semibold">{stats.totalBatches}</div><div className="text-xs text-muted-foreground">Total batches</div></div></CardContent></Card>
    </div>

    <div className="space-y-4">
      <div className="inline-flex h-9 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground">
        <button onClick={() => setActiveTab('current')} className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all ${activeTab === 'current' ? 'bg-background text-foreground shadow' : 'text-muted-foreground hover:text-foreground'}`}>Current Batch</button>
        <button onClick={() => setActiveTab('accounts')} className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all ${activeTab === 'accounts' ? 'bg-background text-foreground shadow' : 'text-muted-foreground hover:text-foreground'}`}>Accounts ({accounts.length})</button>
        <button onClick={() => setActiveTab('history')} className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all ${activeTab === 'history' ? 'bg-background text-foreground shadow' : 'text-muted-foreground hover:text-foreground'}`}>History ({history.length})</button>
        <button onClick={() => setActiveTab('settings')} className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium transition-all ${activeTab === 'settings' ? 'bg-background text-foreground shadow' : 'text-muted-foreground hover:text-foreground'}`}>Settings</button>
      </div>

      {activeTab === 'current' && <div className="mt-2 space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Card><CardContent className="flex items-center gap-4 p-5"><CheckCircle2 className="h-8 w-8 text-primary" /><div><div className="text-2xl font-semibold">{success}</div><div className="text-xs text-muted-foreground">Successful</div></div></CardContent></Card>
          <Card><CardContent className="flex items-center gap-4 p-5"><CircleX className="h-8 w-8 text-destructive" /><div><div className="text-2xl font-semibold">{fail}</div><div className="text-xs text-muted-foreground">Failed</div></div></CardContent></Card>
          <Card><CardContent className="flex items-center gap-4 p-5"><Activity className="h-8 w-8 text-primary" /><div><div className="text-2xl font-semibold">{progress}%</div><div className="text-xs text-muted-foreground">Progress</div></div></CardContent></Card>
        </div>

        {message && <div className="rounded-xl border border-border bg-primary/10 p-3 text-sm text-muted-foreground">{message}</div>}

        <Card>
          <CardHeader>
            <CardTitle>Signup run</CardTitle>
            <CardDescription>{batchId ? `Latest batch: ${batchId}` : 'Choose batch size and parallel workers.'}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto_auto]">
              <div className="space-y-2">
                <Label htmlFor="count">Accounts</Label>
                <Select id="count" value={String(count)} onChange={e => setCount(Number(e.target.value))} disabled={running}>
                  {Array.from({ length: 50 }, (_, i) => i + 1).map(n => (
                    <option key={n} value={n}>{n} account{n > 1 ? 's' : ''}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="threads">Threads</Label>
                <Select id="threads" value={String(threads)} onChange={e => setThreads(Number(e.target.value))} disabled={running}>
                  {[1, 2, 3, 4, 5].map(n => (
                    <option key={n} value={n}>{n} thread{n > 1 ? 's' : ''}</option>
                  ))}
                </Select>
              </div>
              <div className="flex items-end">
                <Button onClick={startSignup} disabled={running}>
                  {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                  {running ? 'Running' : 'Generate'}
                </Button>
              </div>
              {running && (
                <div className="flex items-end">
                  <Button variant="outline" onClick={stopSignup} disabled={!batchId} className="text-destructive">
                    <Square className="h-4 w-4" /> Stop
                  </Button>
                </div>
              )}
              <div className="flex items-end">
                <Button variant="outline" onClick={() => { loadAccounts(); loadHistory(); loadStats() }}>
                  <RefreshCw className="h-4 w-4" /> Refresh
                </Button>
              </div>
            </div>
            <Progress value={progress} max={100} />
          </CardContent>
        </Card>

        {Object.keys(errorGroups).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Error Analysis</CardTitle>
              <CardDescription>Grouped error types from current batch</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {Object.entries(errorGroups).map(([error, count]) => (
                  <div key={error} className="rounded-xl border border-destructive/30 bg-destructive/5 p-3">
                    <p className="text-sm font-medium">{error}</p>
                    <p className="text-2xl font-semibold text-destructive">{count}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Terminal className="h-4 w-4 text-primary" /> Batch activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-72 overflow-y-auto rounded-xl border border-border bg-muted/30 p-4 font-mono text-xs">
              {!logs.length && <div className="grid h-full place-items-center text-muted-foreground">No batch activity.</div>}
              {logs.map((line, i) => (
                <div key={`${i}-${line}`} className={line.includes('FAIL') ? 'text-destructive' : line.includes('OK') || line.startsWith('DONE') ? 'text-primary' : 'text-muted-foreground'}>
                  {line}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>}

      {activeTab === 'accounts' && <div className="mt-2 space-y-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Generated Accounts</CardTitle>
                <CardDescription>All accounts created via auto signup</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={exportAccounts}>
                <Download className="h-4 w-4" /> Export CSV
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Balance</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!accounts.length && (
                    <TableRow>
                      <TableCell colSpan={4} className="h-28 text-center text-muted-foreground">
                        No accounts yet.
                      </TableCell>
                    </TableRow>
                  )}
                  {accounts.map(account => (
                    <TableRow key={account.email}>
                      <TableCell className="font-mono text-xs">{account.email}</TableCell>
                      <TableCell>
                        <Badge variant={account.balance > 10 ? 'default' : account.balance > 0 ? 'warning' : 'error'}>
                          {account.balance} cr
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(account.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => deleteAccount(account.email)}
                          className="text-destructive"
                        >
                          Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>}

      {activeTab === 'history' && <div className="mt-2 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Batch History</CardTitle>
            <CardDescription>Past signup batch runs and their performance</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Batch ID</TableHead>
                    <TableHead>Accounts</TableHead>
                    <TableHead>Success Rate</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Threads</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!history.length && (
                    <TableRow>
                      <TableCell colSpan={6} className="h-28 text-center text-muted-foreground">
                        No batch history.
                      </TableCell>
                    </TableRow>
                  )}
                  {history.map(batch => (
                    <TableRow key={batch.id}>
                      <TableCell className="font-mono text-xs">{batch.id}</TableCell>
                      <TableCell>
                        {batch.success}/{batch.total}
                      </TableCell>
                      <TableCell>
                        <Badge variant={batch.successRate >= 80 ? 'success' : batch.successRate >= 50 ? 'warning' : 'error'}>
                          {batch.successRate}%
                        </Badge>
                      </TableCell>
                      <TableCell>{batch.duration}s</TableCell>
                      <TableCell>{batch.threads}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(batch.createdAt).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>}

      {activeTab === 'settings' && <div className="mt-2 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-primary" />
              Performance Tuning
            </CardTitle>
            <CardDescription>Adjust timeout and retry behavior for better success rates</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="timeout">IMAP Connection Timeout (seconds)</Label>
              <Input
                id="timeout"
                type="number"
                value={timeout}
                onChange={e => setTimeout(Number(e.target.value))}
                min={10}
                max={60}
              />
              <p className="text-xs text-muted-foreground">
                Current: {timeout}s. Increase if seeing timeout errors. Recommended: 30s
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="retry">Retry Count on Failure</Label>
              <Input
                id="retry"
                type="number"
                value={retryCount}
                onChange={e => setRetryCount(Number(e.target.value))}
                min={0}
                max={5}
              />
              <p className="text-xs text-muted-foreground">
                Current: {retryCount} retries. Number of automatic retries on failure.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>}
    </div>
  </div></AdminLayout>
}
