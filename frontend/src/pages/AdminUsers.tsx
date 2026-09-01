import { useCallback, useEffect, useState } from 'react'
import { Ban, Coins, Download, Edit2, Infinity as InfinityIcon, LogOut, Search, ShieldCheck, Trash2, UserRoundCog, Users, UserPlus, Activity, ChevronLeft, ChevronRight, MoreVertical } from 'lucide-react'
import { AdminLayout } from '../components/Layout'
import { PortalDropdown } from '../components/PortalDropdown'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { Input } from '../components/ui/input'
import { Select } from '../components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'
import { Label } from '../components/ui/label'
import { Textarea } from '../components/ui/textarea'

interface User { 
  email: string
  credits: number
  totalCredits: number
  totalSpent: number
  unlimited?: boolean
  signupIP?: string
  createdAt?: string
  lastLogin?: string
  emailVerifiedAt?: string | null
  suspendedAt?: string | null
  suspensionReason?: string | null
  tags?: string[]
  adminNotes?: string
  totalImages?: number
  lastGenerationAt?: string
}

type PendingAction = { type: 'credits' | 'suspension' | 'logout' | 'unlimited' | 'delete' | 'metadata' | 'bulk-credits' | 'bulk-suspend' | 'bulk-delete'; user?: User; users?: string[] }

export default function AdminUsers() {
  const [users, setUsers] = useState<User[]>([])
  const [stats, setStats] = useState<any>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [verified, setVerified] = useState('all')
  const [suspended, setSuspended] = useState('all')
  const [creditFilter, setCreditFilter] = useState('all')
  const [activityFilter, setActivityFilter] = useState('all')
  const [sortBy, setSortBy] = useState('created_at')
  
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState('')
  const [editForm, setEditForm] = useState({ tags: '', adminNotes: '' })
  
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set())
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  
  const limit = 50

  const load = useCallback(async () => {
    const params = new URLSearchParams({ 
      page: String(page), 
      limit: String(limit), 
      q: query,
      sort: sortBy
    })
    if (verified !== 'all') params.set('verified', verified)
    if (suspended !== 'all') params.set('suspended', suspended)
    if (creditFilter !== 'all') params.set('credits', creditFilter)
    if (activityFilter !== 'all') params.set('activity', activityFilter)
    
    const [usersRes, statsRes] = await Promise.all([
      fetch(`/api/admin/users?${params}`, { credentials: 'include' }),
      fetch('/api/admin/users/stats', { credentials: 'include' })
    ])
    
    const body = usersRes.ok ? await usersRes.json() : { items: [], total: 0 }
    const next = Array.isArray(body) ? body : body.items || []
    setUsers(next)
    setTotal(Array.isArray(body) ? body.length : body.total || 0)
    
    if (statsRes.ok) setStats(await statsRes.json())
  }, [page, query, verified, suspended, creditFilter, activityFilter, sortBy])
  
  useEffect(() => { load() }, [load])
  
  useEffect(() => {
    function handleClickOutside() {
      setOpenMenu(null)
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  async function execute() {
    if (!pending) return
    
    if (pending.type === 'bulk-credits' && pending.users) {
      const res = await fetch('/api/admin/users/bulk-credits', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails: pending.users, amount: Number(amount) })
      })
      const data = await res.json().catch(() => ({}))
      setMessage(res.ok ? `Credits ${Number(amount) > 0 ? 'added to' : 'deducted from'} ${data.success} users` : data.error || 'Bulk action failed')
      if (res.ok) { setPending(null); setAmount(''); setSelectedUsers(new Set()); load() }
      return
    }
    
    if (pending.type === 'bulk-suspend' && pending.users) {
      const res = await fetch('/api/admin/users/bulk-suspend', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails: pending.users, suspend: true, reason })
      })
      const data = await res.json().catch(() => ({}))
      setMessage(res.ok ? `Suspended ${data.updated} users` : data.error || 'Bulk suspend failed')
      if (res.ok) { setPending(null); setReason(''); setSelectedUsers(new Set()); load() }
      return
    }
    
    if (pending.type === 'bulk-delete' && pending.users) {
      const res = await fetch('/api/admin/users/bulk-delete', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emails: pending.users })
      })
      const data = await res.json().catch(() => ({}))
      setMessage(res.ok ? `Deleted ${data.deleted} users` : data.error || 'Bulk delete failed')
      if (res.ok) { setPending(null); setSelectedUsers(new Set()); load() }
      return
    }
    
    if (pending.type === 'metadata' && pending.user) {
      const res = await fetch(`/api/admin/user/${encodeURIComponent(pending.user.email)}/metadata`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          tags: editForm.tags.split(',').map(t => t.trim()).filter(Boolean),
          adminNotes: editForm.adminNotes
        })
      })
      const data = await res.json().catch(() => ({}))
      setMessage(res.ok ? `Metadata updated for ${pending.user.email}` : data.error || 'Update failed')
      if (res.ok) { setPending(null); setEditForm({ tags: '', adminNotes: '' }); load() }
      return
    }
    
    if (!pending.user) return
    const email = encodeURIComponent(pending.user.email)
    let url = `/api/admin/user/${email}`
    let method = 'POST'
    let body: Record<string, unknown> | undefined
    
    if (pending.type === 'credits') { url += '/credits'; body = { amount: Number(amount) } }
    if (pending.type === 'suspension') { url += '/suspension'; method = 'PATCH'; body = { suspended: !pending.user.suspendedAt, reason } }
    if (pending.type === 'logout') url += '/revoke-sessions'
    if (pending.type === 'unlimited') { url += '/unlimited'; method = 'PATCH'; body = { unlimited: !pending.user.unlimited } }
    if (pending.type === 'delete') method = 'DELETE'
    
    const res = await fetch(url, { 
      method, 
      credentials: 'include', 
      headers: body ? { 'Content-Type': 'application/json' } : undefined, 
      body: body ? JSON.stringify(body) : undefined 
    })
    const data = await res.json().catch(() => ({}))
    setMessage(res.ok ? `${pending.type} action completed for ${pending.user.email}.` : data.error || 'Action failed')
    if (res.ok) { setPending(null); setAmount(''); setReason(''); load() }
  }
  
  function filter() { setPage(1); setQuery(search.trim()) }
  
  function toggleSelect(email: string) {
    const newSet = new Set(selectedUsers)
    if (newSet.has(email)) newSet.delete(email)
    else newSet.add(email)
    setSelectedUsers(newSet)
  }
  
  function toggleSelectAll() {
    if (selectedUsers.size === users.length) setSelectedUsers(new Set())
    else setSelectedUsers(new Set(users.map(u => u.email)))
  }
  
  function exportUsers() {
    window.location.href = '/api/admin/users/export'
  }
  
  function openEditMetadata(user: User) {
    setOpenMenu(null)
    setPending({ type: 'metadata', user })
    setEditForm({
      tags: (user.tags || []).join(', '),
      adminNotes: user.adminNotes || ''
    })
  }
  
  const pages = Math.max(1, Math.ceil(total / limit))

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <p className="text-sm font-medium text-primary">Audience</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Users</h1>
          <p className="mt-2 text-sm text-muted-foreground">Search accounts and manage access, sessions, limits, and balances.</p>
        </div>
        
        {stats && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardContent className="flex items-center gap-4 p-5">
                <Users className="h-8 w-8 text-primary" />
                <div>
                  <div className="text-2xl font-semibold">{stats.total_users}</div>
                  <div className="text-xs text-muted-foreground">Total Users</div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="flex items-center gap-4 p-5">
                <UserPlus className="h-8 w-8 text-success" />
                <div>
                  <div className="text-2xl font-semibold">{stats.new_users_week}</div>
                  <div className="text-xs text-muted-foreground">New (7 days)</div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="flex items-center gap-4 p-5">
                <Activity className="h-8 w-8 text-primary" />
                <div>
                  <div className="text-2xl font-semibold">{stats.active_users_week}</div>
                  <div className="text-xs text-muted-foreground">Active (7 days)</div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="flex items-center gap-4 p-5">
                <Coins className="h-8 w-8 text-warning" />
                <div>
                  <div className="text-2xl font-semibold">{stats.total_credits}</div>
                  <div className="text-xs text-muted-foreground">Total Credits</div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
        
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  value={search} 
                  onChange={e => setSearch(e.target.value)} 
                  onKeyDown={e => e.key === 'Enter' && filter()} 
                  placeholder="Search by email" 
                  className="pl-9"
                />
              </div>
              <Button onClick={filter}>
                <Search className="h-4 w-4" /> Search
              </Button>
            </div>
            
            <div className="grid gap-2 sm:grid-cols-5">
              <Select value={verified} onChange={e => { setPage(1); setVerified(e.target.value) }}>
                <option value="all">Any verification</option>
                <option value="true">Verified</option>
                <option value="false">Unverified</option>
              </Select>
              
              <Select value={suspended} onChange={e => { setPage(1); setSuspended(e.target.value) }}>
                <option value="all">Any status</option>
                <option value="false">Active</option>
                <option value="true">Suspended</option>
              </Select>
              
              <Select value={creditFilter} onChange={e => { setPage(1); setCreditFilter(e.target.value) }}>
                <option value="all">Any credits</option>
                <option value="zero">Zero</option>
                <option value="low">Low (1-10)</option>
                <option value="medium">Medium (11-50)</option>
                <option value="high">High (50+)</option>
                <option value="unlimited">Unlimited</option>
              </Select>
              
              <Select value={activityFilter} onChange={e => { setPage(1); setActivityFilter(e.target.value) }}>
                <option value="all">Any activity</option>
                <option value="active_7d">Active (7d)</option>
                <option value="inactive_30d">Inactive (30d+)</option>
              </Select>
              
              <Select value={sortBy} onChange={e => { setPage(1); setSortBy(e.target.value) }}>
                <option value="created_at">Newest</option>
                <option value="credits_desc">Credits (High)</option>
                <option value="credits_asc">Credits (Low)</option>
                <option value="last_login">Last Login</option>
                <option value="total_images">Most Active</option>
              </Select>
            </div>
          </CardContent>
        </Card>
        
        {selectedUsers.size > 0 && (
          <Card className="border-primary/50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="text-sm font-medium">{selectedUsers.size} users selected</div>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setPending({ type: 'bulk-credits', users: Array.from(selectedUsers) })}
                  >
                    <Coins className="h-3.5 w-3.5" /> Bulk Credits
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setPending({ type: 'bulk-suspend', users: Array.from(selectedUsers) })}
                  >
                    <Ban className="h-3.5 w-3.5" /> Bulk Suspend
                  </Button>
                  <Button 
                    variant="destructive" 
                    size="sm"
                    onClick={() => setPending({ type: 'bulk-delete', users: Array.from(selectedUsers) })}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Bulk Delete
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => setSelectedUsers(new Set())}
                  >
                    Clear
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        
        {message && (
          <div className="rounded-xl border border-border bg-primary/10 p-3 text-sm text-muted-foreground">
            {message}
          </div>
        )}
        
        <div className="flex justify-between items-center">
          <div className="text-sm text-muted-foreground">{total.toLocaleString()} users</div>
          <Button variant="outline" size="sm" onClick={exportUsers}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        </div>
        
        <Card>
          <CardContent className="p-0">
            <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8">
                      <input 
                        type="checkbox" 
                        checked={users.length > 0 && selectedUsers.size === users.length}
                        onChange={toggleSelectAll}
                        className="w-4 h-4"
                      />
                    </TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Credits</TableHead>
                    <TableHead>Activity</TableHead>
                    <TableHead className="w-16">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!users.length && (
                    <TableRow>
                      <TableCell colSpan={6} className="h-28 text-center text-muted-foreground">
                        No users found.
                      </TableCell>
                    </TableRow>
                  )}
                  {users.map(user => (
                    <TableRow key={user.email}>
                      <TableCell>
                        <input 
                          type="checkbox" 
                          checked={selectedUsers.has(user.email)}
                          onChange={() => toggleSelect(user.email)}
                          className="w-4 h-4"
                        />
                      </TableCell>
                      <TableCell>
                        <div className="max-w-56 truncate font-medium">
                          {user.email}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Joined {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '-'}
                        </div>
                        {user.tags && user.tags.length > 0 && (
                          <div className="flex gap-1 mt-1">
                            {user.tags.map((tag, idx) => (
                              <Badge key={idx} variant="outline" className="text-xs">{tag}</Badge>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {user.emailVerifiedAt ? (
                            <Badge variant="default">
                              <ShieldCheck className="mr-1 h-3 w-3" />verified
                            </Badge>
                          ) : (
                            <Badge variant="secondary">unverified</Badge>
                          )}
                          {user.suspendedAt && <Badge variant="destructive">suspended</Badge>}
                          {user.unlimited && <Badge variant="default">unlimited</Badge>}
                        </div>
                        {user.suspensionReason && (
                          <p className="mt-1 max-w-48 truncate text-xs text-muted-foreground" title={user.suspensionReason}>
                            {user.suspensionReason}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={
                          user.unlimited ? 'default' : 
                          user.credits <= 0 ? 'destructive' : 
                          user.credits <= 5 ? 'secondary' : 
                          'default'
                        }>
                          {user.unlimited ? 'Unlimited' : user.credits}
                        </Badge>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Spent {user.totalSpent || 0}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <div>{user.totalImages || 0} images</div>
                        <div>Last: {user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : '-'}</div>
                      </TableCell>
                      <TableCell>
                        <div className="relative">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              setOpenMenu(openMenu === user.email ? null : user.email)
                            }}
                          >
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                          <PortalDropdown open={openMenu === user.email} onClose={() => setOpenMenu(null)} className="w-52 py-1">
                            <button 
                              className="w-full text-left px-4 py-2 text-sm hover:bg-accent flex items-center gap-2"
                              onClick={(e) => { e.stopPropagation(); setOpenMenu(null); setPending({ type: 'credits', user }); }}
                            >
                              <Coins className="h-3.5 w-3.5" /> Adjust Credits
                            </button>
                            <button 
                              className="w-full text-left px-4 py-2 text-sm hover:bg-accent flex items-center gap-2"
                              onClick={(e) => { e.stopPropagation(); setOpenMenu(null); setPending({ type: 'suspension', user }); }}
                            >
                              <Ban className="h-3.5 w-3.5" /> {user.suspendedAt ? 'Unsuspend User' : 'Suspend User'}
                            </button>
                            <button 
                              className="w-full text-left px-4 py-2 text-sm hover:bg-accent flex items-center gap-2"
                              onClick={(e) => { e.stopPropagation(); setOpenMenu(null); setPending({ type: 'logout', user }); }}
                            >
                              <LogOut className="h-3.5 w-3.5" /> Logout Sessions
                            </button>
                            <button 
                              className="w-full text-left px-4 py-2 text-sm hover:bg-accent flex items-center gap-2"
                              onClick={(e) => { e.stopPropagation(); setOpenMenu(null); setPending({ type: 'unlimited', user }); }}
                            >
                              <InfinityIcon className="h-3.5 w-3.5" /> {user.unlimited ? 'Set Limited' : 'Set Unlimited'}
                            </button>
                            <button 
                              className="w-full text-left px-4 py-2 text-sm hover:bg-accent flex items-center gap-2"
                              onClick={(e) => { e.stopPropagation(); openEditMetadata(user); }}
                            >
                              <Edit2 className="h-3.5 w-3.5" /> Edit Tags & Notes
                            </button>
                            <div className="border-t my-1"></div>
                            <button 
                              className="w-full text-left px-4 py-2 text-sm hover:bg-destructive/10 text-destructive flex items-center gap-2"
                              onClick={(e) => { e.stopPropagation(); setOpenMenu(null); setPending({ type: 'delete', user }); }}
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Delete User
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
        
        {pages > 1 && (
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              Showing {(page - 1) * limit + 1}-{Math.min(page * limit, total)} of {total}
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="flex items-center px-3 text-sm">
                Page {page} of {pages}
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setPage(p => Math.min(pages, p + 1))}
                disabled={page === pages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
      
      <Dialog open={!!pending} onOpenChange={open => !open && setPending(null)}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserRoundCog className="h-5 w-5 text-primary" /> 
            Confirm {pending?.type?.replace('bulk-', 'bulk ')}
          </DialogTitle>
          <DialogDescription className="break-all">
            {pending?.user ? `Target: ${pending.user.email}` : 
             pending?.users ? `Target: ${pending.users.length} users` : ''}
          </DialogDescription>
        </DialogHeader>
        <DialogContent className="space-y-3">
          {pending?.type === 'credits' && (
            <>
              <p className="text-sm text-muted-foreground">
                Use a positive integer to add credits or a negative integer to deduct them.
              </p>
              <Input 
                type="number" 
                value={amount} 
                onChange={e => setAmount(e.target.value)} 
                placeholder="For example 10 or -5" 
              />
            </>
          )}
          
          {pending?.type === 'bulk-credits' && (
            <>
              <p className="text-sm text-muted-foreground">
                Add or deduct credits for {pending.users?.length} selected users.
              </p>
              <Input 
                type="number" 
                value={amount} 
                onChange={e => setAmount(e.target.value)} 
                placeholder="For example 10 or -5" 
              />
            </>
          )}
          
          {(pending?.type === 'suspension' || pending?.type === 'bulk-suspend') && !pending.user?.suspendedAt && (
            <>
              <Label>Suspension Reason (optional)</Label>
              <Input 
                value={reason} 
                onChange={e => setReason(e.target.value)} 
                maxLength={500} 
                placeholder="Reason for suspension" 
              />
            </>
          )}
          
          {pending?.type === 'logout' && (
            <p className="text-sm text-muted-foreground">
              This increments the account session version and invalidates all existing user sessions.
            </p>
          )}
          
          {pending?.type === 'unlimited' && (
            <p className="text-sm text-muted-foreground">
              This will {pending.user?.unlimited ? 'restore normal credit enforcement' : 'disable credit limits'} for this account.
            </p>
          )}
          
          {pending?.type === 'metadata' && (
            <>
              <div className="space-y-2">
                <Label>Tags (comma separated)</Label>
                <Input 
                  value={editForm.tags} 
                  onChange={e => setEditForm({ ...editForm, tags: e.target.value })}
                  placeholder="VIP, Beta Tester, Problem User"
                />
              </div>
              <div className="space-y-2">
                <Label>Admin Notes</Label>
                <Textarea 
                  value={editForm.adminNotes} 
                  onChange={e => setEditForm({ ...editForm, adminNotes: e.target.value })}
                  placeholder="Internal notes about this user..."
                  rows={3}
                />
              </div>
            </>
          )}
          
          {(pending?.type === 'delete' || pending?.type === 'bulk-delete') && (
            <p className="rounded-lg border border-destructive bg-destructive/10 p-3 text-sm text-destructive-foreground">
              This permanently deletes {pending.type === 'bulk-delete' ? `${pending.users?.length} users` : 'the user'} and 
              attempts to remove their stored results and references. This cannot be undone.
            </p>
          )}
        </DialogContent>
        <DialogFooter>
          <Button variant="outline" onClick={() => setPending(null)}>Cancel</Button>
          <Button 
            onClick={execute} 
            disabled={
              (pending?.type === 'credits' || pending?.type === 'bulk-credits') && 
              (!Number.isInteger(Number(amount)) || Number(amount) === 0)
            }
            className={
              (pending?.type === 'delete' || pending?.type === 'bulk-delete') ? 
              'bg-destructive hover:bg-destructive/80' : ''
            }
          >
            Confirm
          </Button>
        </DialogFooter>
      </Dialog>
    </AdminLayout>
  )
}
