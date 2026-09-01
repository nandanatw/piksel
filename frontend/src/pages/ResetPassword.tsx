import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Eye, EyeOff, KeyRound, Sparkles } from "lucide-react";
import ThemeToggle from "../components/ThemeToggle";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token")?.trim() || "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  const hostname = window.location.hostname;
  const loginHref =
    hostname === "localhost" || hostname === "127.0.0.1"
      ? "/login"
      : hostname === "app.kreasya.click"
        ? "/"
        : "https://app.kreasya.click";

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    if (!token) {
      setMessage("Tautan reset tidak lengkap. Minta tautan baru dari halaman masuk.");
      return;
    }
    if (password.length < 12 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
      setMessage("Gunakan minimal 12 karakter dengan huruf besar, huruf kecil, dan angka.");
      return;
    }
    if (password !== confirmPassword) {
      setMessage("Konfirmasi kata sandi belum sama.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setMessage(data.error || "Tautan reset tidak valid atau sudah kedaluwarsa.");
        return;
      }
      setSuccess(true);
      setPassword("");
      setConfirmPassword("");
    } catch {
      setMessage("Tidak dapat menghubungi server. Silakan coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-background px-4 py-20">
      <div className="absolute right-4 top-4 sm:right-8 sm:top-6"><ThemeToggle /></div>
      <div className="w-full max-w-md">
        <a href="https://kreasya.click" className="mb-7 flex w-fit items-center gap-2.5 text-lg font-semibold">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground"><Sparkles className="h-4 w-4" /></span>
          kreasya<span className="text-primary">.</span>
        </a>
        <Card className="border-border/80 shadow-xl shadow-black/5">
          <CardHeader>
            <div className="mb-2 grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary"><KeyRound className="h-5 w-5" /></div>
            <CardTitle className="text-2xl">Buat kata sandi baru</CardTitle>
            <p className="text-sm leading-6 text-muted-foreground">Tautan ini hanya dapat digunakan sekali dan berlaku selama 30 menit.</p>
          </CardHeader>
          <CardContent>
            {success ? (
              <div className="space-y-5">
                <div className="rounded-xl border bg-muted p-4 text-sm">
                  <div className="flex gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><p>Kata sandi berhasil diubah. Semua sesi lama telah dikeluarkan demi keamanan akunmu.</p></div>
                </div>
                <Button className="w-full" asChild><a href={loginHref}>Masuk dengan kata sandi baru</a></Button>
              </div>
            ) : (
              <form className="space-y-4" onSubmit={submit}>
                <div className="space-y-2">
                  <Label htmlFor="new-password">Kata sandi baru</Label>
                  <div className="relative">
                    <Input id="new-password" type={showPassword ? "text" : "password"} autoComplete="new-password" required minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} className="h-12 pr-12" placeholder="Minimal 12 karakter" />
                    <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-1 top-1 grid h-10 w-10 place-items-center rounded-lg text-muted-foreground hover:bg-muted" aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                  </div>
                  <p className="text-xs text-muted-foreground">Minimal 12 karakter, berisi huruf besar, huruf kecil, dan angka.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Ulangi kata sandi</Label>
                  <Input id="confirm-password" type={showPassword ? "text" : "password"} autoComplete="new-password" required minLength={12} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="h-12" />
                </div>
                {message && <div className="rounded-lg border border-destructive bg-destructive/10 p-3 text-sm text-destructive-foreground">{message}</div>}
                <Button type="submit" className="h-12 w-full" disabled={busy || !token}>{busy ? "Menyimpan…" : "Simpan kata sandi baru"}</Button>
                {!token && <p className="text-center text-xs text-destructive">Token reset tidak ditemukan pada tautan ini.</p>}
              </form>
            )}
          </CardContent>
        </Card>
        {!success && <Button variant="ghost" className="mt-4" asChild><a href={loginHref}><ArrowLeft className="h-4 w-4" />Kembali ke halaman masuk</a></Button>}
      </div>
    </main>
  );
}
