import { useEffect, useState } from "react";
import QRCode from "qrcode";
import {
  BarChart3,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  History,
  Infinity as InfinityIcon,
  Plus,
  QrCode,
  ShieldCheck,
  Sparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import { Layout } from "../components/Layout";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { useAuth } from "../hooks/useAuth";
import { cn } from "../lib/utils";

interface Payment {
  orderId: string;
  credits: number;
  amount: number;
  paidAmount?: number;
  status: string;
  productType?: string;
  planDays?: number;
  createdAt: string;
  completedAt?: string;
}
interface UsageStats {
  totalGenerated: number;
  last7Days: number;
  last30Days: number;
}
interface PlanItem {
  slug: string
  name: string
  duration_days: number
  price_idr: number
  compare_at_idr: number | null
  badge: string | null
  description: string
  features: string[]
  sort_order: number
}
interface Pricing {
  plans: PlanItem[]
}
interface QrisPayment {
  qrString: string;
  paymentUrl?: string;
  reference: string;
  amount: number;
  title: string;
  expiresAt?: string;
}

const formatMoney = (value = 0) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);

export default function Payments() {
  const { user, refresh } = useAuth();
  const [items, setItems] = useState<Payment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [subscriptionBusy, setSubscriptionBusy] = useState(false);
  const [error, setError] = useState("");
  const [voucherCode, setVoucherCode] = useState('');
  const [voucherRedeeming, setVoucherRedeeming] = useState(false);
  const [voucherMsg, setVoucherMsg] = useState('');
  const [qrPayment, setQrPayment] = useState<QrisPayment | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [paymentNotice, setPaymentNotice] = useState<Payment | null>(null);
  const [stats, setStats] = useState<UsageStats>({
    totalGenerated: 0,
    last7Days: 0,
    last30Days: 0,
  });
  const [pricing, setPricing] = useState<Pricing>({
    plans: [],
  });
  const statCards: Array<{
    label: string;
    value: string;
    note: string;
    Icon: LucideIcon;
  }> = [
    {
      label: user?.freeTrial ? "Free Trial" : user?.unlimited ? "Unlimited" : "Tidak Aktif",
      value: user?.freeTrial ? "7 hari" : user?.unlimited ? "Aktif" : "—",
      note: user?.freeTrial ? "Beli plan untuk hapus watermark" : user?.unlimited ? "Generate tanpa batas" : "Beli plan untuk mulai",
      Icon: InfinityIcon,
    },
    {
      label: "Gambar dibuat",
      value: String(stats.totalGenerated),
      note: "Total generasi",
      Icon: Sparkles,
    },
    {
      label: "7 hari terakhir",
      value: `${stats.last7Days}`,
      note: "Generasi terbaru",
      Icon: Clock3,
    },
    {
      label: "30 hari terakhir",
      value: `${stats.last30Days}`,
      note: "Aktivitas bulanan",
      Icon: BarChart3,
    },
  ];

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/payments?page=${page}&limit=20`, {
        credentials: "include",
      }).then((r) => r.json()),
      fetch("/api/user/stats", { credentials: "include" })
        .then((r) => r.json())
        .catch(() => ({})),
    ])
      .then(([paymentsData, statsData]) => {
        setItems(paymentsData.items || []);
        setTotal(paymentsData.total || 0);
        if (statsData.totalGenerated !== undefined) setStats(statsData);
      })
      .catch((cause) =>
        setError(
          cause instanceof Error
            ? cause.message
            : "Pembayaran tidak dapat dimuat",
        ),
      )
      .finally(() => setLoading(false));
  }, [page]);

  useEffect(() => {
    fetch("/api/pricing")
      .then((r) => r.json())
      .then((data) => setPricing(data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const orderId =
      new URLSearchParams(window.location.search).get("order_id") ||
      qrPayment?.reference;
    if (!orderId) return;
    let disposed = false;
    let attempts = 0;
    let timer: number | undefined;
    const check = async () => {
      const response = await fetch(
        `/api/payments/${encodeURIComponent(orderId)}`,
        { credentials: "include" },
      ).catch(() => null);
      const payment = response?.ok
        ? await response.json().catch(() => null)
        : null;
      if (disposed || !payment) return;
      setPaymentNotice((previous) =>
        previous?.status === payment.status ? previous : payment,
      );
      if (payment.status === "completed") {
        await refresh();
        window.history.replaceState({}, "", "/payments");
        return;
      }
      if (payment.status === "failed" || payment.status === "cancelled") {
        window.history.replaceState({}, "", "/payments");
        return;
      }
      attempts += 1;
      if (attempts < 120) timer = window.setTimeout(check, 2500);
    };
    check();
    return () => {
      disposed = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [refresh, qrPayment?.reference]);

  useEffect(() => {
    if (!qrPayment?.qrString) {
      setQrDataUrl("");
      return;
    }
    QRCode.toDataURL(qrPayment.qrString, {
      width: 1200,
      margin: 4,
      errorCorrectionLevel: "M",
      color: { dark: "#09090b", light: "#ffffff" },
    })
      .then(setQrDataUrl)
      .catch(() =>
        setError(
          "QRIS tidak dapat dibuat. Silakan gunakan tombol buka pembayaran.",
        ),
      );
  }, [qrPayment]);

  function showPayment(data: any, title: string) {
    if (!data.qr_string) {
      throw new Error("QRIS tidak tersedia. Silakan coba lagi.");
    }
    setPaymentNotice(null);
    sessionStorage.setItem(
      "kreasya_checkout",
      JSON.stringify({
        qr_string: data.qr_string,
        reference: data.reference,
        amount: data.amount,
        title,
        expired_at: data.expired_at,
      }),
    );
    window.location.assign(
      "/payment?order_id=" + encodeURIComponent(data.reference),
    );
  }

  async function redeemVoucher() {
    if (!voucherCode.trim()) return
    setVoucherRedeeming(true); setError('')
    try {
      const r = await fetch('/api/vouchers/redeem', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: voucherCode }) })
      const data = await r.json()
      if (!r.ok) { setVoucherMsg(data.error || 'Voucher tidak valid'); return }
      setVoucherMsg(`✅ ${data.plan} · ${data.days} hari aktif!`)
      setVoucherCode('')
      setTimeout(() => { window.location.reload() }, 1500)
    } catch { setVoucherMsg('Gagal menukar voucher') }
    finally { setVoucherRedeeming(false) }
  }

  async function buyPlan(planSlug: string, planName: string) {
    setSubscriptionBusy(true);
    setError("");
    try {
      const response = await fetch("/api/subscriptions/unlimited", {
        method: "POST",
        credentials: "include",
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planSlug }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(data.error || "Tidak dapat membuat pembayaran");
      showPayment(data, planName);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Tidak dapat membuat pembayaran",
      );
    } finally {
      setSubscriptionBusy(false);
    }
  }

  async function cancelPayment(orderId: string) {
    if (!confirm("Batalkan pembayaran ini?")) return;
    try {
      const response = await fetch(`/api/payments/${orderId}/cancel`, {
        method: "POST",
        credentials: "include",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(data.error || "Pembayaran tidak dapat dibatalkan");
      setItems((prev) =>
        prev.map((item) =>
          item.orderId === orderId ? { ...item, status: "cancelled" } : item,
        ),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Pembayaran tidak dapat dibatalkan",
      );
    }
  }

  function downloadQris() {
    if (!qrDataUrl || !qrPayment) return;
    const link = document.createElement("a");
    link.href = qrDataUrl;
    link.download = `kreasya-qris-${qrPayment.reference}.png`;
    link.click();
  }

  return (
    <Layout
      title="Pembayaran"
      subtitle="Kreasya Image Studio"
      showCredits
      nav={
        <>
          <Button variant="ghost" size="sm" asChild>
            <a href="/generate">
              <Plus className="h-3.5 w-3.5" />
              Buat
            </a>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <a href="/gallery">
              <History className="h-3.5 w-3.5" />
              Galeri
            </a>
          </Button>
        </>
      }
    >
      <div className="mx-auto max-w-6xl">
        <section className="relative mb-6 overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/15 via-card to-card p-6 sm:p-8">
          <div className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-primary/15 blur-3xl" />
          <div className="relative flex items-start gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/20">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-primary">
                Kreasya membership & credits
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
                Siapkan ide berikutnya.
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
                Bayar dengan QRIS dari aplikasi bank atau e-wallet pilihanmu.
                Aman, cepat, dan langsung tercatat di akun Kreasya.
              </p>
            </div>
          </div>
        </section>
        {user?.unlimited && (
          <div className={cn("mb-6 rounded-xl border p-4", user?.freeTrial ? "border-amber-400/40 bg-amber-500/10" : "border-emerald-400/40 bg-emerald-500/10")}>
            <div className="flex items-center gap-3">
              <div className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", user?.freeTrial ? "bg-amber-500/20 text-amber-600" : "bg-emerald-500/20 text-emerald-600")}>
                <InfinityIcon className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{user?.freeTrial ? 'Free Trial' : 'Paket Aktif'}</p>
                <p className="text-xs text-muted-foreground">
                  {user?.freeTrial ? 'Generate tanpa batas dengan watermark · max 50/hari' : 'Generate tanpa batas, tanpa watermark, semua model, limit lebih tinggi'}
                  {user?.unlimitedUntil ? <> · sisa <strong>{Math.max(0, Math.ceil((new Date(user.unlimitedUntil).getTime() - Date.now()) / 86400000))} hari</strong> · berlaku sampai <strong>{new Date(user.unlimitedUntil).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</strong></> : ''}
                </p>
              </div>
              {user?.freeTrial && <a href="#plans" className="shrink-0 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 transition-colors">Upgrade</a>}
            </div>
          </div>
        )}
        <div className="mb-6 flex items-center gap-2">
          <Input placeholder="Kode voucher..." value={voucherCode} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setVoucherCode(e.target.value.toUpperCase())} className="max-w-[200px] h-10" />
          <Button onClick={redeemVoucher} disabled={voucherRedeeming} variant="outline" className="h-10">{voucherRedeeming ? '...' : 'Tukar'}</Button>
          {voucherMsg && <span className={cn('text-sm', voucherMsg.startsWith('✅') ? 'text-emerald-600' : 'text-destructive')}>{voucherMsg}</span>}
        </div>
        {error && (
          <p className="mb-5 rounded-xl border border-destructive bg-destructive/10 p-3 text-sm text-destructive-foreground">
            {error}
          </p>
        )}
        {paymentNotice && (
          <div
            className={`mb-5 flex items-start gap-3 rounded-xl border p-4 ${paymentNotice.status === "completed" ? "border-primary/30 bg-primary/10" : paymentNotice.status === "pending" ? "border-warning/30 bg-warning/10" : "border-destructive/30 bg-destructive/10"}`}
          >
            <div className="mt-0.5">
              {paymentNotice.status === "completed" ? (
                <Check className="h-5 w-5 text-primary" />
              ) : paymentNotice.status === "pending" ? (
                <Clock3 className="h-5 w-5 text-warning" />
              ) : (
                <X className="h-5 w-5 text-destructive" />
              )}
            </div>
            <div>
              <p className="font-semibold">
                {paymentNotice.status === "completed"
                  ? "Pembayaran berhasil"
                  : paymentNotice.status === "pending"
                    ? "Pembayaran sedang dikonfirmasi"
                    : "Pembayaran belum berhasil"}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {paymentNotice.status === "completed"
                  ? paymentNotice.productType && paymentNotice.productType.startsWith("unlimited_")
                    ? `${paymentNotice.productType.replace(/_/g, ' ')} sudah aktif di akunmu.`
                    : "Credits sudah ditambahkan ke akunmu."
                  : paymentNotice.status === "pending"
                    ? "Jangan melakukan pembayaran ulang. Kami akan memperbarui status otomatis."
                    : "Transaksi ini tidak memberikan credits atau akses. Kamu bisa membuat pembayaran baru."}
              </p>
            </div>
          </div>
        )}

        {qrPayment && (
          <Card className="mb-6 overflow-hidden border-primary/40 bg-primary/5">
            <CardContent className="grid gap-6 p-5 sm:grid-cols-[minmax(0,280px)_1fr] sm:p-6">
              <div className="flex flex-col items-center">
                <div className="rounded-2xl bg-white p-3 shadow-xl">
                  <img
                    src={qrDataUrl}
                    alt="QRIS Kreasya untuk pembayaran"
                    className="h-[240px] w-[240px] sm:h-[260px] sm:w-[260px]"
                  />
                </div>
                <p className="mt-3 text-center text-sm font-semibold">
                  {qrPayment.title}
                </p>
                <p className="mt-1 text-lg font-bold text-primary">
                  {formatMoney(qrPayment.amount)}
                </p>
                <Button
                  variant="outline"
                  className="mt-3 w-full max-w-[286px]"
                  onClick={downloadQris}
                  disabled={!qrDataUrl}
                >
                  <Download className="h-4 w-4" />
                  Download QRIS ukuran asli
                </Button>
              </div>
              <div className="flex flex-col justify-center">
                <Badge
                  variant="outline"
                  className="w-fit border-primary/30 text-primary"
                >
                  <QrCode className="mr-1.5 h-3.5 w-3.5" />
                  Menunggu pembayaran
                </Badge>
                <h2 className="mt-3 text-xl font-semibold">
                  Scan QRIS untuk melanjutkan
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Bayar langsung dari aplikasi bank atau e-wallet yang mendukung
                  QRIS. Setelah pembayaran berhasil, halaman Kreasya ini akan
                  memperbarui status dan akses akun secara otomatis.
                </p>
                <div className="mt-5 space-y-3 text-sm">
                  <div className="flex gap-3">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      1
                    </span>
                    <span>
                      Buka aplikasi mobile banking atau e-wallet yang mendukung
                      QRIS.
                    </span>
                  </div>
                  <div className="flex gap-3">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      2
                    </span>
                    <span>
                      Pilih menu <strong>Bayar / Scan QRIS</strong>, lalu
                      arahkan kamera ke QR di atas atau upload gambar QRIS.
                    </span>
                  </div>
                  <div className="flex gap-3">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      3
                    </span>
                    <span>
                      Periksa nominal dan selesaikan pembayaran, lalu tunggu
                      konfirmasi otomatis di halaman ini.
                    </span>
                  </div>
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  <Button variant="ghost" onClick={() => setQrPayment(null)}>
                    <X className="h-4 w-4" />
                    Tutup
                  </Button>
                </div>
                {qrPayment.expiresAt && (
                  <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock3 className="h-3.5 w-3.5" />
                    Berlaku sampai{" "}
                    {new Date(qrPayment.expiresAt).toLocaleString("id-ID")}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {statCards.map(({ label, value, note, Icon }) => (
            <Card key={label}>
              <CardHeader className="pb-2">
                <CardDescription className="text-xs">{label}</CardDescription>
                <CardTitle className="text-2xl">{value}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  <Icon className="mr-1 inline h-3 w-3" />
                  {note}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        <div id="plans" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {pricing.plans.map((plan, idx) => (
            <Card
              key={plan.slug}
              id={plan.slug}
              className={cn("relative overflow-hidden", idx === 0 ? "border-primary/50 bg-primary/10" : idx === 1 ? "border-primary/40 bg-primary/5" : "h-max")}
            >
              {plan.badge && (
                <div className="absolute right-4 top-4 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                  {plan.badge}
                </div>
              )}
              <CardHeader>
                <div className="mb-2 grid h-11 w-11 place-items-center rounded-2xl bg-primary/15">
                  <InfinityIcon className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>{plan.name}</CardTitle>
                <CardDescription>{plan.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="mb-4 flex items-baseline gap-2">
                  <span className="text-3xl font-bold">{formatMoney(plan.price_idr)}</span>
                  {plan.compare_at_idr && (
                    <span className="text-sm text-muted-foreground line-through">
                      {formatMoney(plan.compare_at_idr)}
                    </span>
                  )}
                </div>
                <ul className="mb-5 space-y-2 text-sm text-muted-foreground">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex gap-2">
                      <Check className="h-4 w-4 shrink-0 text-primary" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Button
                  className="w-full"
                  onClick={() => buyPlan(plan.slug, plan.name)}
                  disabled={subscriptionBusy || (user?.unlimited && !user?.freeTrial)}
                >
                  {subscriptionBusy
                    ? "Menyiapkan pembayaran..."
                    : user?.freeTrial
                      ? "Upgrade sekarang"
                      : user?.unlimited
                        ? "Unlimited sedang aktif"
                        : `Beli ${plan.name}`}
                  <QrCode className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <section className="mt-6">
          <div className="mb-4 flex items-center gap-3">
            <Badge variant="outline">
              <History className="mr-1 h-3.5 w-3.5" />
              Riwayat
            </Badge>
            <h2 className="text-xl font-semibold">Transaksi kamu</h2>
          </div>
          <Card className="overflow-hidden">
            {loading ? (
              <div className="grid min-h-48 place-items-center">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : items.length === 0 ? (
              <CardContent className="py-14 text-center text-sm text-muted-foreground">
                Belum ada transaksi.
              </CardContent>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produk</TableHead>
                    <TableHead>Nominal</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.orderId}>
                      <TableCell>
                        <p className="font-medium">
                          {item.productType && item.productType.startsWith("unlimited_")
                            ? (pricing.plans.find(p => p.slug === item.productType)?.name || `Unlimited ${item.planDays || '?'} hari`)
                            : `${item.credits} credits`}
                        </p>
                        <p className="max-w-44 truncate font-mono text-[11px] text-muted-foreground">
                          {item.orderId}
                        </p>
                      </TableCell>
                      <TableCell>
                        {formatMoney(item.paidAmount || item.amount)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            item.status === "completed"
                              ? "success"
                              : item.status === "failed"
                                ? "error"
                                : "warning"
                          }
                        >
                          {item.status === "completed"
                            ? "Berhasil"
                            : item.status === "pending"
                              ? "Menunggu"
                              : item.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {new Date(
                          item.completedAt || item.createdAt,
                        ).toLocaleString("id-ID")}
                      </TableCell>
                      <TableCell>
                        {item.status === "pending" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => cancelPayment(item.orderId)}
                            aria-label="Batalkan pembayaran"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((value) => value - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
              Sebelumnya
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page * 20 >= total}
              onClick={() => setPage((value) => value + 1)}
            >
              Berikutnya
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-3">
          <Card>
            <CardContent className="p-5">
              <QrCode className="mb-3 h-5 w-5 text-primary" />
              <h3 className="font-semibold">Bayar dari mana saja</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Gunakan mobile banking atau e-wallet apa pun yang memiliki menu
                QRIS.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <Download className="mb-3 h-5 w-5 text-primary" />
              <h3 className="font-semibold">Simpan QRIS</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Download QR ukuran asli, lalu scan atau upload dari perangkat
                pembayaranmu.
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <ShieldCheck className="mb-3 h-5 w-5 text-primary" />
              <h3 className="font-semibold">Konfirmasi otomatis</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Akses atau credits diberikan setelah pembayaran terkonfirmasi
                provider.
              </p>
            </CardContent>
          </Card>
        </section>
      </div>
    </Layout>
  );
}
