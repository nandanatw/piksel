import { useEffect, useState } from 'react'
import { CircleDollarSign, ReceiptText } from 'lucide-react'
import { AdminLayout } from '../components/Layout'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table'

interface Payment { orderId: string; email: string; credits: number; amount: number | string; paidAmount: number | string | null; status: string; provider: string; createdAt: string; completedAt: string | null }
export default function AdminPayments() {
  const [items, setItems] = useState<Payment[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const limit = 50
  useEffect(() => { fetch(`/api/admin/payments?page=${page}&limit=${limit}`, { credentials: 'include' }).then(r => r.ok ? r.json() : { items: [], total: 0 }).then(d => { setItems(d.items || []); setTotal(d.total || 0) }) }, [page])
  const pages = Math.max(1, Math.ceil(total / limit))
  return <AdminLayout><div className="space-y-6">
    <div><p className="text-sm font-medium text-primary">Ledger</p><h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Payments</h1><p className="mt-2 text-sm text-muted-foreground">Paginated provider orders, expected totals, and settled amounts.</p></div>
    <Card><CardContent className="flex items-center gap-4 p-5"><CircleDollarSign className="h-8 w-8 text-success" /><div><p className="text-2xl font-semibold">{total.toLocaleString()}</p><p className="text-xs text-muted-foreground">Payment records</p></div></CardContent></Card>
    <Card><CardContent className="p-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Status</TableHead><TableHead>Order</TableHead><TableHead>User</TableHead><TableHead>Credits</TableHead><TableHead>Expected</TableHead><TableHead>Paid</TableHead><TableHead>Provider</TableHead><TableHead>Created</TableHead></TableRow></TableHeader><TableBody>{!items.length && <TableRow><TableCell colSpan={8} className="h-28 text-center text-muted-foreground"><ReceiptText className="mx-auto mb-2 h-6 w-6" />No payments found.</TableCell></TableRow>}{items.map(item => <TableRow key={item.orderId}><TableCell><Badge variant={item.status === 'completed' ? 'success' : item.status === 'failed' || item.status === 'expired' ? 'error' : 'warning'}>{item.status}</Badge></TableCell><TableCell className="font-mono text-xs">{item.orderId}</TableCell><TableCell className="max-w-48 truncate">{item.email}</TableCell><TableCell>{item.credits}</TableCell><TableCell>Rp {Number(item.amount || 0).toLocaleString()}</TableCell><TableCell>{item.paidAmount == null ? '-' : `Rp ${Number(item.paidAmount).toLocaleString()}`}</TableCell><TableCell>{item.provider}</TableCell><TableCell className="whitespace-nowrap text-xs text-muted-foreground">{new Date(item.createdAt).toLocaleString()}</TableCell></TableRow>)}</TableBody></Table></div></CardContent></Card>
    <div className="flex items-center justify-between text-sm text-muted-foreground"><span>Page {page} of {pages}</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next</Button></div></div>
  </div></AdminLayout>
}
