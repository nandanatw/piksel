import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  MailCheck,
  Send,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import ThemeToggle from "../components/ThemeToggle";
import { CloudflareTurnstile } from "../components/CloudflareTurnstile";
import portrait from "../assets/showcase-portrait.jpg";
import perfume from "../assets/showcase-perfume.jpg";
import travel from "../assets/showcase-travel.jpg";

export default function Login() {
  const { user, refresh } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [forgot, setForgot] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [verificationRequired, setVerificationRequired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [resending, setResending] = useState(false);
  const [telegramUsername, setTelegramUsername] = useState("");
  const [telegramOidc, setTelegramOidc] = useState(false);
  const [website, setWebsite] = useState("");
  const [turnstileSiteKey, setTurnstileSiteKey] = useState("");
  const [turnstileEnabled, setTurnstileEnabled] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [challengeVersion, setChallengeVersion] = useState(0);
  const [messageNeutral, setMessageNeutral] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);
  const [offerEmail, setOfferEmail] = useState('');
  const [offerReason, setOfferReason] = useState('');
  const [offerContactEmail, setOfferContactEmail] = useState('');
  const [offerBusy, setOfferBusy] = useState(false);
  const [offerDone, setOfferDone] = useState(false);
  const [offerStep, setOfferStep] = useState<'offer' | 'input'>('offer');
  const telegramWidgetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/auth/security-config")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        setTurnstileEnabled(Boolean(data?.turnstileEnabled));
        setTurnstileSiteKey(String(data?.turnstileSiteKey || ""));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (user) {
      if (user.role === "admin")
        window.location.replace("https://admin.kreasya.click");
      else nav("/generate", { replace: true });
    }
  }, [user, nav]);

  useEffect(() => {
    const error = new URLSearchParams(window.location.search).get("error");
    if (error === "expired")
      setMessage(
        "That verification link expired. Enter your email to request another one.",
      );
    if (error === "missing_token")
      setMessage(
        "The verification link is incomplete. Request a new email below.",
      );
    if (error === "limit_reached")
      setMessage("Free account limit reached for this network.");
    if (error === "login_failed")
      setMessage(
        "Email verification failed. Request a new link and try again.",
      );
  }, []);

  useEffect(() => {
    fetch("/api/auth/telegram/config")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (data?.oidc) setTelegramOidc(true);
        else if (data?.botUsername) setTelegramUsername(data.botUsername);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!telegramUsername || !telegramWidgetRef.current) return;
    telegramWidgetRef.current.replaceChildren();
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", telegramUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "10");
    script.setAttribute("data-userpic", "false");
    script.setAttribute("data-request-access", "write");
    script.setAttribute(
      "data-auth-url",
      `${window.location.origin}/api/auth/telegram`,
    );
    telegramWidgetRef.current.appendChild(script);
  }, [telegramUsername]);

  if (user) return null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setMessageNeutral(false);
    setBusy(true);
    try {
      const response = await fetch("/api/auth/password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          mode,
          website,
          turnstileToken: mode === "register" ? turnstileToken : "",
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (data.code === "EMAIL_NOT_VERIFIED") setVerificationRequired(true);
        if (data.code === "ACCOUNT_SUSPENDED") {
          setOfferEmail(email);
          setOfferReason(data.error || '');
          setOfferOpen(true);
          setBusy(false);
          return;
        }
        setMessage(data.error || "Authentication failed");
        if (mode === "register" && turnstileEnabled) {
          setTurnstileToken("");
          setChallengeVersion((value) => value + 1);
        }
        return;
      }
      if (data.verificationRequired) {
        setVerificationRequired(true);
        setEmail(data.email || email);
        setMessage(
          data.freeGrantHeld
            ? "Account created. Check your inbox to verify it. Free credits are temporarily unavailable for this email domain."
            : "Account created. Check your inbox for a verification link valid for 30 minutes.",
        );
        return;
      }
      await refresh();
      nav("/generate", { replace: true });
    } catch {
      setMessage("Unable to reach the server. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submitForgot(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setMessageNeutral(false);
    setBusy(true);
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, website, turnstileToken }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(data.error || "Permintaan reset tidak dapat diproses.");
      } else {
        setMessageNeutral(true);
        setMessage("Jika akun tersebut menggunakan password, link reset telah dikirim ke email.");
      }
      if (turnstileEnabled) {
        setTurnstileToken("");
        setChallengeVersion((value) => value + 1);
      }
    } catch {
      setMessage("Tidak dapat menghubungi server. Silakan coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (!email.trim()) {
      setMessage("Enter the email address you registered with.");
      return;
    }
    setResending(true);
    setMessage("");
    try {
      const response = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json().catch(() => ({}));
      setMessage(
        response.ok
          ? "If this account still needs verification, a new email has been sent."
          : data.error || "Could not resend verification email.",
      );
    } catch {
      setMessage("Unable to reach the server. Please try again.");
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="grid min-h-screen overflow-x-hidden bg-background lg:grid-cols-[1.08fr_.92fr]">
      <section className="relative hidden min-h-screen overflow-hidden bg-[#071014] p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-14">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(54,209,220,.18),transparent_32%),radial-gradient(circle_at_85%_80%,rgba(237,155,105,.14),transparent_28%)]" />
        <a
          href="https://kreasya.click"
          className="relative z-10 flex w-fit items-center gap-2.5 text-lg font-semibold"
        >
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Sparkles className="h-4 w-4" />
          </span>
          kreasya<span className="text-primary">.</span>
        </a>
        <div className="relative z-10 grid grid-cols-[1.2fr_.8fr] gap-3">
          <div className="relative row-span-2 h-[420px] overflow-hidden rounded-[2rem]">
            <img
              src={portrait}
              alt="Contoh karya portrait dari Kreasya"
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
            <div className="absolute bottom-6 left-6">
              <p className="text-xs font-semibold uppercase tracking-[.18em] text-cyan-200">
                Fashion editorial
              </p>
              <p className="mt-1 text-xl font-medium">
                Dari ide menjadi karya.
              </p>
            </div>
          </div>
          <img
            src={travel}
            alt="Contoh karya travel dari Kreasya"
            className="h-[204px] w-full rounded-[1.5rem] object-cover"
          />
          <img
            src={perfume}
            alt="Contoh karya produk dari Kreasya"
            className="h-[204px] w-full rounded-[1.5rem] object-cover"
          />
        </div>
        <div className="relative z-10">
          <p className="max-w-lg text-3xl font-semibold leading-tight tracking-[-.035em]">
            Satu ruang untuk membuat, menyimpan, dan membagikan visual
            terbaikmu.
          </p>
          <p className="mt-3 text-sm text-white/45">
            Composer personal untuk ide yang ingin segera diwujudkan.
          </p>
        </div>
      </section>

      <section className="relative flex min-h-screen items-center justify-center px-4 py-20 sm:px-8">
        <div className="absolute left-4 top-4 sm:left-8 sm:top-7">
          <a
            href="https://kreasya.click"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Kembali ke Kreasya
          </a>
        </div>
        <div className="absolute right-4 top-4 sm:right-8 sm:top-6">
          <ThemeToggle />
        </div>
        <div className="w-full max-w-[430px]">
          <div className="mb-7 lg:hidden">
            <div className="mb-5 flex items-center gap-2.5 text-lg font-semibold">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground">
                <Sparkles className="h-4 w-4" />
              </span>
              kreasya<span className="text-primary">.</span>
            </div>
          </div>
          <div className="mb-7">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/25 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary">
              <WandSparkles className="h-3.5 w-3.5" />
              Ruang kreator
            </div>
            <h1 className="text-3xl font-semibold tracking-[-.035em] sm:text-4xl">
              {forgot
                ? "Atur ulang kata sandi."
                : mode === "login"
                ? "Selamat datang kembali."
                : "Mulai berkarya hari ini."}
            </h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {forgot
                ? "Masukkan email akunmu. Kami akan mengirim tautan reset yang berlaku selama 30 menit."
                : mode === "login"
                ? "Masuk untuk melanjutkan karya dan generasi terakhirmu."
                : "Buat akun untuk mengakses Composer dan menyimpan setiap hasil."}
            </p>
          </div>
          <Card className="border-border/80 shadow-xl shadow-black/5">
            <CardContent className="space-y-5 p-5 sm:p-6">
              {forgot ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="w-fit px-2"
                  onClick={() => {
                    setForgot(false);
                    setMessage("");
                    setMessageNeutral(false);
                    setTurnstileToken("");
                  }}
                >
                  <ArrowLeft className="h-4 w-4" />
                  Kembali ke masuk
                </Button>
              ) : (
                <div className="grid grid-cols-2 rounded-xl bg-muted p-1">
                <Button
                  type="button"
                  variant={mode === "login" ? "default" : "ghost"}
                  onClick={() => {
                    setMode("login");
                    setForgot(false);
                    setMessage("");
                    setMessageNeutral(false);
                    setTurnstileToken("");
                  }}
                >
                  Masuk
                </Button>
                <Button
                  type="button"
                  variant={mode === "register" ? "default" : "ghost"}
                  onClick={() => {
                    setMode("register");
                    setForgot(false);
                    setMessage("");
                    setMessageNeutral(false);
                  }}
                >
                  Daftar
                </Button>
              </div>
              )}
              <form
                className="space-y-4"
                onSubmit={forgot ? submitForgot : submit}
                autoComplete="on"
              >
                {(mode === "register" || forgot) && (
                  <div
                    className="pointer-events-none absolute -left-[10000px] h-px w-px overflow-hidden"
                    aria-hidden="true"
                  >
                    <Label htmlFor="website">Website</Label>
                    <Input
                      id="website"
                      name="website"
                      value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                      tabIndex={-1}
                      autoComplete="off"
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="email">Alamat email</Label>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nama@email.com"
                    className="h-12"
                  />
                </div>
                {!forgot && <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor="password">Kata sandi</Label>
                    {mode === "login" && (
                      <button
                        type="button"
                        className="text-xs font-medium text-primary transition hover:underline"
                        onClick={() => {
                          setForgot(true);
                          setMessage("");
                          setMessageNeutral(false);
                          setVerificationRequired(false);
                          setTurnstileToken("");
                        }}
                      >
                        Lupa kata sandi?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete={
                        mode === "login" ? "current-password" : "new-password"
                      }
                      required
                      minLength={mode === "register" ? 12 : 1}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={
                        mode === "register"
                          ? "Minimal 12 karakter"
                          : "Masukkan kata sandi"
                      }
                      className="h-12 pr-12"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      className="absolute right-1 top-1 grid h-10 w-10 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label={
                        showPassword
                          ? "Sembunyikan kata sandi"
                          : "Tampilkan kata sandi"
                      }
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  {mode === "register" && (
                    <p className="text-xs text-muted-foreground">
                      Gunakan minimal 12 karakter dengan huruf besar, huruf
                      kecil, dan angka.
                    </p>
                  )}
                </div>}
                {(mode === "register" || forgot) &&
                  turnstileEnabled &&
                  turnstileSiteKey && (
                    <CloudflareTurnstile
                      key={challengeVersion}
                      siteKey={turnstileSiteKey}
                      onToken={setTurnstileToken}
                    />
                  )}
                <Button
                  type="submit"
                  disabled={
                    busy ||
                    ((mode === "register" || forgot) &&
                      turnstileEnabled &&
                      !turnstileToken)
                  }
                  className="h-12 w-full"
                >
                  {busy
                    ? "Memproses…"
                    : forgot
                      ? "Kirim link reset"
                      : mode === "login"
                      ? "Masuk ke Composer"
                      : "Buat akun"}
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </form>
              {!forgot && (telegramUsername || telegramOidc) && (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="h-px flex-1 bg-border" />
                    <span>atau lanjut dengan</span>
                    <span className="h-px flex-1 bg-border" />
                  </div>
                  {telegramOidc ? (
                    <Button variant="outline" className="h-12 w-full" asChild>
                      <a href="/api/auth/telegram/start">
                        <Send className="h-4 w-4 text-primary" />
                        Telegram
                      </a>
                    </Button>
                  ) : (
                    <div
                      ref={telegramWidgetRef}
                      className="flex justify-center"
                    />
                  )}
                  <p className="text-center text-xs text-muted-foreground">
                    Kami tidak pernah meminta kata sandi Telegram.
                  </p>
                </div>
              )}
              {message && (
                <div
                  className={`rounded-lg border p-3 text-sm ${verificationRequired || messageNeutral ? "bg-muted text-foreground" : "border-destructive bg-destructive/10 text-destructive-foreground"}`}
                >
                  {message}
                </div>
              )}
              {!forgot && verificationRequired && (
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={resending}
                  onClick={resend}
                >
                  <MailCheck className="h-4 w-4" />
                  {resending ? "Mengirim…" : "Kirim ulang email verifikasi"}
                </Button>
              )}
            </CardContent>
          </Card>
          <div className="mt-5 text-center">
            <a
              href="/explore"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground transition hover:text-primary"
            >
              <Sparkles className="h-4 w-4" />
              Lihat karya komunitas
            </a>
          </div>
        </div>
</section>
        {offerOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
              {offerDone ? (
                <div className="text-center space-y-3">
                  <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
                  <p className="font-semibold">Terima kasih! Admin akan menghubungi Anda melalui email yang diberikan.</p>
                  <Button className="w-full" onClick={() => { setOfferOpen(false); setOfferDone(false); setOfferStep('offer'); setEmail(''); setPassword('') }}>Tutup</Button>
                </div>
              ) : offerStep === 'input' ? (
                <>
                  <h2 className="text-lg font-semibold mb-2">Email Kontak</h2>
                  <p className="text-sm text-muted-foreground mb-4">Masukkan email Gmail pribadi Anda untuk dihubungi admin.</p>
                  <Input type="email" placeholder="nama@gmail.com" value={offerContactEmail} onChange={e => setOfferContactEmail(e.target.value)} className="mb-4" />
                  <div className="space-y-2">
                    <Button className="w-full" disabled={offerBusy || !offerContactEmail.includes('@')} onClick={async () => {
                      setOfferBusy(true);
                      const res = await fetch('/api/auth/offer-response', { method: 'POST', credentials: 'include', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ email: offerEmail, action: 'accept', contactEmail: offerContactEmail }) });
                      if (res.ok) setOfferDone(true);
                      else { const d = await res.json().catch(()=>({})); setMessage(d.error || 'Gagal'); }
                      setOfferBusy(false);
                    }}>Kirim</Button>
                    <Button variant="ghost" className="w-full" onClick={() => setOfferStep('offer')}>Kembali</Button>
                  </div>
                </>
              ) : (
                <>
                  <h2 className="text-lg font-semibold mb-2">Penawaran Khusus</h2>
                  <p className="text-sm text-muted-foreground mb-4">{offerReason}</p>
                  <div className="mb-4 rounded-xl border border-border bg-muted/30 p-3">
                    <p className="text-sm font-semibold">Google Gemini Pro 18 bulan</p>
                    <p className="text-xs text-muted-foreground mt-1">Akses unlimited &bull; 5TB storage &bull; Generate tanpa batas</p>
                  </div>
                  <div className="space-y-2">
                    <Button className="w-full" onClick={() => setOfferStep('input')}>Ya, saya tertarik</Button>
                    <Button variant="outline" className="w-full" disabled={offerBusy} onClick={async () => {
                      setOfferBusy(true);
                      await fetch('/api/auth/offer-response', { method: 'POST', credentials: 'include', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ email: offerEmail, action: 'reject' }) }).catch(()=>{});
                      setOfferOpen(false); setOfferStep('offer');
                      setEmail(''); setPassword('');
                      setOfferBusy(false);
                    }}>Tidak, terima kasih</Button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }
