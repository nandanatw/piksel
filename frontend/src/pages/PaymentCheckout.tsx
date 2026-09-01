import { useEffect, useState } from "react";
import QRCode from "qrcode";
import {
  ArrowLeft,
  Check,
  Clock3,
  Download,
  QrCode,
  Sparkles,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Layout } from "../components/Layout";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { useAuth } from "../hooks/useAuth";

interface CheckoutData {
  qr_string: string;
  reference: string;
  amount: number;
  title: string;
  expired_at?: string;
}

interface PaymentStatus {
  status: string;
  productType?: string;
}

const money = (value = 0) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);

export default function PaymentCheckout() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [checkout, setCheckout] = useState<CheckoutData | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [status, setStatus] = useState<PaymentStatus>({ status: "pending" });

  useEffect(() => {
    const stored = sessionStorage.getItem("kreasya_checkout");
    if (!stored) return;
    try {
      setCheckout(JSON.parse(stored));
    } catch {
      sessionStorage.removeItem("kreasya_checkout");
    }
  }, []);

  useEffect(() => {
    if (!checkout?.qr_string) return;
    QRCode.toDataURL(checkout.qr_string, {
      width: 1200,
      margin: 4,
      errorCorrectionLevel: "M",
      color: { dark: "#09090b", light: "#ffffff" },
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(""));
  }, [checkout]);

  useEffect(() => {
    if (!checkout?.reference) return;
    let stopped = false;
    let timer: number | undefined;
    let attempts = 0;
    const check = async () => {
      const response = await fetch(
        "/api/payments/" + encodeURIComponent(checkout.reference),
        { credentials: "include" },
      ).catch(() => null);
      const data = response?.ok
        ? await response.json().catch(() => null)
        : null;
      if (stopped || !data) return;
      setStatus(data);
      if (data.status === "completed") {
        await refresh();
        return;
      }
      if (data.status === "failed" || data.status === "cancelled") return;
      attempts += 1;
      if (attempts < 120) timer = window.setTimeout(check, 2500);
    };
    check();
    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [checkout?.reference, refresh]);

  function closeCheckout() {
    sessionStorage.removeItem("kreasya_checkout");
    navigate("/payments");
  }

  function downloadQris() {
    if (!qrDataUrl || !checkout) return;
    const link = document.createElement("a");
    link.href = qrDataUrl;
    link.download = "kreasya-qris-" + checkout.reference + ".png";
    link.click();
  }

  if (!checkout) {
    return (
      <Layout title="Pembayaran" subtitle="Kreasya Image Studio">
        <div className="mx-auto max-w-xl">
          <Card>
            <CardContent className="p-8 text-center">
              <QrCode className="mx-auto mb-4 h-8 w-8 text-muted-foreground" />
              <h1 className="text-xl font-semibold">
                Pembayaran tidak ditemukan
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Silakan pilih paket atau top up terlebih dahulu.
              </p>
              <Button className="mt-5" onClick={() => navigate("/payments")}>
                <ArrowLeft className="h-4 w-4" />
                Kembali ke Credit
              </Button>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  const completed = status.status === "completed";
  const failed = status.status === "failed" || status.status === "cancelled";

  return (
    <Layout title="Pembayaran" subtitle="Kreasya Image Studio">
      <div className="mx-auto max-w-4xl">
        <button
          type="button"
          onClick={closeCheckout}
          className="mb-5 flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Kembali ke Credit
        </button>
        <Card className="overflow-hidden border-primary/30 bg-card shadow-xl">
          <div className="border-b border-border bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-5 sm:p-7">
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary text-primary-foreground">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-primary">Kreasya</p>
                <h1 className="text-xl font-semibold sm:text-2xl">
                  Selesaikan pembayaran
                </h1>
              </div>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Bayar dengan QRIS dari mobile banking atau e-wallet pilihanmu.
            </p>
          </div>
          <CardContent className="grid gap-7 p-5 sm:grid-cols-[minmax(0,320px)_1fr] sm:p-7">
            <div className="flex flex-col items-center">
              <div className="rounded-2xl bg-white p-3 shadow-lg">
                <img
                  src={qrDataUrl}
                  alt="QRIS pembayaran Kreasya"
                  className="h-[260px] w-[260px] sm:h-[290px] sm:w-[290px]"
                />
              </div>
              <p className="mt-4 text-center text-sm font-semibold">
                {checkout.title}
              </p>
              <p className="mt-1 text-2xl font-bold text-primary">
                {money(checkout.amount)}
              </p>
              <Button
                variant="outline"
                className="mt-4 w-full max-w-[300px]"
                onClick={downloadQris}
                disabled={!qrDataUrl}
              >
                <Download className="h-4 w-4" />
                Download QRIS
              </Button>
            </div>
            <div className="flex flex-col justify-center">
              <Badge
                variant={completed ? "success" : failed ? "error" : "warning"}
                className="w-fit"
              >
                {completed ? (
                  <Check className="mr-1.5 h-3.5 w-3.5" />
                ) : failed ? (
                  <X className="mr-1.5 h-3.5 w-3.5" />
                ) : (
                  <Clock3 className="mr-1.5 h-3.5 w-3.5" />
                )}
                {completed
                  ? "Pembayaran berhasil"
                  : failed
                    ? "Pembayaran belum berhasil"
                    : "Menunggu pembayaran"}
              </Badge>
              <h2 className="mt-4 text-xl font-semibold">
                {completed
                  ? "Akses sudah aktif"
                  : failed
                    ? "Silakan coba lagi"
                    : "Scan QRIS untuk membayar"}
              </h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {completed
                  ? "Pembayaran sudah diterima. Kamu bisa kembali dan melanjutkan membuat gambar."
                  : failed
                    ? "Pembayaran ini tidak berhasil. Kembali ke halaman Credit untuk membuat pembayaran baru."
                    : "Buka aplikasi mobile banking atau e-wallet, scan QR di samping, lalu selesaikan pembayaran sesuai nominal."}
              </p>
              {!completed && !failed && (
                <div className="mt-6 space-y-3 text-sm">
                  <div className="flex gap-3">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      1
                    </span>
                    <span>
                      Buka aplikasi bank atau e-wallet yang mendukung QRIS.
                    </span>
                  </div>
                  <div className="flex gap-3">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      2
                    </span>
                    <span>
                      Pilih menu Scan atau Bayar, lalu arahkan kamera ke QRIS.
                    </span>
                  </div>
                  <div className="flex gap-3">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      3
                    </span>
                    <span>Periksa nominal dan selesaikan pembayaran.</span>
                  </div>
                </div>
              )}
              <Button className="mt-6 w-full sm:w-fit" onClick={closeCheckout}>
                {completed
                  ? "Mulai membuat gambar"
                  : failed
                    ? "Buat pembayaran baru"
                    : "Kembali ke Credit"}
              </Button>
              {!completed && !failed && checkout.expired_at && (
                <p className="mt-3 text-xs text-muted-foreground">
                  QRIS berlaku sampai{" "}
                  {new Date(checkout.expired_at).toLocaleString("id-ID")}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
