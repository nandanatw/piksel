import { useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import {
  User,
  Lock,
  Trash2,
  Mail,
  Shield,
  Send,
  Bell,
  BellRing,
  Palette,
  Moon,
  Sun,
  MonitorSmartphone,
  LogOut,
  Sparkles,
} from "lucide-react";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select } from "../components/ui/select";
import { Badge } from "../components/ui/badge";
import { Layout } from "../components/Layout";
import { useTheme } from "../hooks/useTheme";

export default function Settings() {
  const { user, refresh, logout } = useAuth();
  const { theme, toggle: toggleTheme } = useTheme();
  const isTelegramAccount = user?.email?.endsWith("@telegram.user") ?? false;
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [notificationMessage, setNotificationMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [profileUsername, setProfileUsername] = useState("");
  const [profileDisplayName, setProfileDisplayName] = useState("");
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    () =>
      localStorage.getItem("generationNotifications") === "true" &&
      typeof Notification !== "undefined" &&
      Notification.permission === "granted",
  );
  const [sessions, setSessions] = useState<
    Array<{
      id: string;
      ip?: string;
      userAgent?: string;
      createdAt: string;
      lastSeenAt: string;
      current: boolean;
    }>
  >([]);
  const [legacySession, setLegacySession] = useState(false);
  const [sessionsLoading, setSessionsLoading] = useState(true);

  async function loadSessions() {
    setSessionsLoading(true);
    const response = await fetch("/api/auth/sessions", {
      credentials: "include",
    }).catch(() => null);
    const data = response?.ok ? await response.json().catch(() => ({})) : {};
    setSessions(data.items || []);
    setLegacySession(Boolean(data.legacySession));
    setSessionsLoading(false);
  }

  useEffect(() => {
    void loadSessions();
  }, []);

  useEffect(() => {
    setProfileUsername(user?.username || "");
    setProfileDisplayName(user?.displayName || "");
  }, [user?.username, user?.displayName]);

  async function updateProfile(event: React.FormEvent) {
    event.preventDefault();
    setProfileError("");
    setProfileMessage("");
    const normalizedUsername = profileUsername.trim().toLowerCase();
    const normalizedName = profileDisplayName.trim().replace(/\s+/g, " ");
    if (!/^[a-z0-9_]{3,24}$/.test(normalizedUsername)) {
      setProfileError("Username harus 3–24 karakter: huruf kecil, angka, atau underscore");
      return;
    }
    if (normalizedName.length < 2 || normalizedName.length > 50) {
      setProfileError("Nama harus berisi 2–50 karakter");
      return;
    }
    setProfileLoading(true);
    try {
      const response = await fetch("/api/auth/profile", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: normalizedUsername, displayName: normalizedName }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setProfileError(data.error || "Profil tidak dapat diperbarui");
        return;
      }
      await refresh();
      setProfileMessage("Profil berhasil diperbarui");
    } catch {
      setProfileError("Tidak dapat menghubungi server");
    } finally {
      setProfileLoading(false);
    }
  }

  function sessionDevice(userAgent = "") {
    const browser = /Edg\//.test(userAgent)
      ? "Edge"
      : /Chrome\//.test(userAgent)
        ? "Chrome"
        : /Firefox\//.test(userAgent)
          ? "Firefox"
          : /Safari\//.test(userAgent)
            ? "Safari"
            : "Browser";
    const device = /Android|iPhone|Mobile/i.test(userAgent)
      ? "Mobile"
      : "Desktop";
    return `${browser} · ${device}`;
  }

  async function revokeSession(id: string, current: boolean) {
    const response = await fetch(
      `/api/auth/sessions/${encodeURIComponent(id)}`,
      { method: "DELETE", credentials: "include" },
    );
    if (!response.ok) {
      setError("Session tidak dapat dikeluarkan");
      return;
    }
    if (current) {
      logout();
      return;
    }
    await loadSessions();
  }

  async function toggleNotifications() {
    setError("");
    setNotificationMessage("");
    if (notificationsEnabled) {
      localStorage.setItem("generationNotifications", "false");
      setNotificationsEnabled(false);
      setNotificationMessage("Generation notifications disabled");
      return;
    }
    if (typeof Notification === "undefined") {
      setError("Browser ini tidak mendukung notification");
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      localStorage.setItem("generationNotifications", "false");
      setError("Izin notification belum diberikan oleh browser");
      return;
    }
    localStorage.setItem("generationNotifications", "true");
    setNotificationsEnabled(true);
    setNotificationMessage("Generation notifications enabled");
    new Notification("Kreasya", {
      body: "Notification aktif. Kami akan memberi tahu saat gambar selesai.",
      icon: "/favicon.svg",
    });
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (
      newPassword.length < 12 ||
      !/[A-Z]/.test(newPassword) ||
      !/[a-z]/.test(newPassword) ||
      !/\d/.test(newPassword)
    ) {
      setError(
        "Gunakan minimal 12 karakter dengan huruf besar, huruf kecil, dan angka",
      );
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");

    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to change password");
        return;
      }

      setMessage("Password changed successfully");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError("Failed to change password");
    } finally {
      setLoading(false);
    }
  }

  async function deleteAccount() {
    if (
      !confirm(
        "Are you sure you want to delete your account? This action cannot be undone.",
      )
    )
      return;

    const confirmation = prompt("Type DELETE to confirm account deletion:");
    if (confirmation !== "DELETE") return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/delete-account", {
        method: "DELETE",
        credentials: "include",
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to delete account");
        return;
      }

      logout();
    } catch (err) {
      setError("Failed to delete account");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout title="Settings" subtitle="Account settings">
      <header className="mb-4 sm:mb-6">
        <Badge
          variant="outline"
          className="mb-2 border-border text-primary sm:mb-3"
        >
          <User className="mr-1.5 h-3.5 w-3.5" />
          Account
        </Badge>
        <h1 className="text-xl font-semibold sm:text-2xl lg:text-3xl">
          Settings
        </h1>
        <p className="mt-1.5 text-xs text-muted-foreground sm:mt-2 sm:text-sm">
          Manage your account preferences
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5 text-primary" />
              Tampilan
            </CardTitle>
            <CardDescription>
              Sesuaikan tampilan Kreasya di perangkat ini.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-4">
              <div>
                <p className="text-sm font-medium">Tema aplikasi</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Saat ini menggunakan mode{" "}
                  {theme === "dark" ? "gelap" : "terang"}.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={toggleTheme}
                className="shrink-0"
              >
                {theme === "dark" ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
                {theme === "dark" ? "Mode terang" : "Mode gelap"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Default Generate
            </CardTitle>
            <CardDescription>
              Model dan rasio yang otomatis dipilih saat buka Generate.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DefaultPreferences />
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              Generation Notifications
            </CardTitle>
            <CardDescription>
              Get a browser alert when your image is ready.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-4">
              <div>
                <p className="text-sm font-medium">Notify when finished</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Works while Kreasya is open in this browser.
                </p>
              </div>
              <Button
                type="button"
                variant={notificationsEnabled ? "default" : "outline"}
                onClick={toggleNotifications}
                className="shrink-0"
              >
                {notificationsEnabled ? (
                  <BellRing className="h-4 w-4" />
                ) : (
                  <Bell className="h-4 w-4" />
                )}
                {notificationsEnabled ? "On" : "Enable"}
              </Button>
            </div>
            {notificationMessage && (
              <p className="mt-3 text-sm text-primary">{notificationMessage}</p>
            )}
          </CardContent>
        </Card>

        {/* Account Info */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              Profil
            </CardTitle>
            <CardDescription>Nama dan identitas publik akunmu.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form className="space-y-4" onSubmit={updateProfile}>
              <div className="space-y-2">
                <Label htmlFor="profileDisplayName">Nama</Label>
                <Input id="profileDisplayName" required minLength={2} maxLength={50} value={profileDisplayName} onChange={(event) => setProfileDisplayName(event.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="profileUsername">Username</Label>
                <div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">@</span><Input id="profileUsername" required minLength={3} maxLength={24} pattern="[a-z0-9_]{3,24}" value={profileUsername} onChange={(event) => setProfileUsername(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} className="pl-7" /></div>
                <p className="text-xs text-muted-foreground">3–24 karakter. Gunakan huruf kecil, angka, atau underscore.</p>
              </div>
              {profileError && <p className="text-sm text-destructive">{profileError}</p>}
              {profileMessage && <p className="text-sm text-primary">{profileMessage}</p>}
              <Button type="submit" className="w-full" disabled={profileLoading}>{profileLoading ? "Menyimpan…" : "Simpan profil"}</Button>
            </form>
            <div className="border-t border-border pt-4">
              <Label className="text-xs text-muted-foreground">Email akun</Label>
              <p className="mt-1 truncate text-sm font-medium">{user?.email}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">
                Login method
              </Label>
              <p className="mt-1 flex items-center gap-2 text-sm font-medium">
                {isTelegramAccount ? (
                  <>
                    <Send className="h-4 w-4 text-primary" /> Telegram
                  </>
                ) : (
                  <>
                    <Mail className="h-4 w-4 text-primary" /> Email and password
                  </>
                )}
              </p>
              {isTelegramAccount && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Your account is securely connected to Telegram
                </p>
              )}
            </div>
            {isTelegramAccount && user?.telegramId && (
              <div>
                <Label className="text-xs text-muted-foreground">
                  Telegram User ID
                </Label>
                <p className="mt-1 font-mono text-sm font-medium">
                  {user.telegramId}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Used only as your unique Telegram identifier
                </p>
              </div>
            )}
            <div>
              <Label className="text-xs text-muted-foreground">
                Account Type
              </Label>
              <p className="mt-1 text-sm font-medium">
                <Badge variant="outline">
                  {isTelegramAccount
                    ? "Telegram account"
                    : user?.role || "user"}
                </Badge>
              </p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">
                Credits Balance
              </Label>
              <p className="mt-1 text-sm font-medium">
                {user?.credits || 0} credits
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Change Password */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-primary" />
              Change Password
            </CardTitle>
            <CardDescription>Update your account password</CardDescription>
          </CardHeader>
          <CardContent>
            {isTelegramAccount ? (
              <div className="flex min-h-[220px] flex-col items-center justify-center text-center">
                <Send className="mb-3 h-8 w-8 text-primary" />
                <p className="text-sm font-medium">
                  Password managed by Telegram
                </p>
                <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                  Sign in securely with your Telegram account. You do not need a
                  separate Kreasya password.
                </p>
              </div>
            ) : (
              <form onSubmit={changePassword} className="space-y-4">
                <div>
                  <Label htmlFor="currentPassword">Current Password</Label>
                  <Input
                    id="currentPassword"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="newPassword">New Password</Label>
                  <Input
                    id="newPassword"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={12}
                    className="mt-1"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Minimal 12 karakter dengan huruf besar, huruf kecil, dan
                    angka.
                  </p>
                </div>
                <div>
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className="mt-1"
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                {message && <p className="text-sm text-primary">{message}</p>}
                <Button type="submit" disabled={loading} className="w-full">
                  {loading ? "Changing..." : "Change Password"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        {/* Security */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              Security
            </CardTitle>
            <CardDescription>Manage your security settings</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <Label className="text-xs text-muted-foreground">
                Sesi aktif
              </Label>
              {sessionsLoading ? (
                <div className="h-16 animate-pulse rounded-xl bg-muted" />
              ) : (
                <>
                  {legacySession && (
                    <div className="rounded-xl border border-border bg-muted/40 p-3 text-sm">
                      <p className="font-medium">Sesi perangkat ini</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Sesi lama tetap aman dan akan terdaftar lengkap setelah
                        login berikutnya.
                      </p>
                    </div>
                  )}
                  {sessions.map((session) => (
                    <div
                      key={session.id}
                      className="flex items-center gap-3 rounded-xl border border-border p-3"
                    >
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                        <MonitorSmartphone className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {sessionDevice(session.userAgent)}{" "}
                          {session.current && (
                            <span className="text-primary">
                              · perangkat ini
                            </span>
                          )}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {session.ip || "IP tidak tersedia"} · aktif{" "}
                          {new Date(session.lastSeenAt).toLocaleString("id-ID")}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          revokeSession(session.id, session.current)
                        }
                        aria-label="Keluarkan sesi"
                      >
                        <LogOut className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  fetch("/api/auth/logout-all", {
                    method: "POST",
                    credentials: "include",
                  }).then(() => logout())
                }
                className="mt-2 w-full"
              >
                Keluar dari semua perangkat
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Danger Zone */}
        <Card className="border-destructive/50 bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Danger Zone
            </CardTitle>
            <CardDescription>Irreversible actions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-sm font-medium">Delete Account</Label>
              <p className="mt-1 text-sm text-muted-foreground">
                Permanently delete your account and all associated data. This
                action cannot be undone.
              </p>
              <Button
                variant="destructive"
                size="sm"
                onClick={deleteAccount}
                disabled={loading}
                className="mt-3"
              >
                Delete Account
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}

function DefaultPreferences() {
  const [models, setModels] = useState<Record<string, { name: string; ratios: string[] }>>({})
  const [model, setModel] = useState('')
  const [ratio, setRatio] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/models').then(r => r.json()).then(data => setModels(data)).catch(() => {})
    fetch('/api/user/preferences', { credentials: 'include' }).then(r => r.json()).then(p => {
      if (p.model) setModel(p.model)
      if (p.ratio) setRatio(p.ratio)
    }).catch(() => {})
  }, [])

  async function save() {
    await fetch('/api/user/preferences', {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: model || null, ratio: ratio || null }),
    })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const currentRatios = model && models[model] ? models[model].ratios : []

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Model default</Label>
          <Select value={model} onChange={e => { setModel(e.target.value); setRatio('') }}>
            <option value="">Tidak disetel</option>
            {Object.entries(models).map(([id, m]) => <option key={id} value={id}>{m.name}</option>)}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Rasio default</Label>
          <Select value={ratio} onChange={e => setRatio(e.target.value)} disabled={!currentRatios.length}>
            <option value="">Tidak disetel</option>
            {currentRatios.map(r => <option key={r} value={r}>{r}</option>)}
          </Select>
        </div>
      </div>
      <Button size="sm" onClick={save} disabled={saved}>
        {saved ? 'Tersimpan ✓' : 'Simpan'}
      </Button>
    </div>
  )
}
