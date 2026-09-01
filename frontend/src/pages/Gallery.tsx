import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import ImageDetailModal from "../components/ImageDetailModal";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Copy,
  Download,
  Eye,
  EyeOff,
  Globe2,
  Lock,
  Images,
  Trash2,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Wand2,
  X,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { brokenImg } from "../lib/utils";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { Textarea } from "../components/ui/textarea";
import { Select } from "../components/ui/select";
import { Layout } from "../components/Layout";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { PrivateShareDialog } from "../components/PrivateShareDialog";
import { MobileFilterSheet } from "../components/MobileFilterSheet";

interface Result {
  url: string;
  thumbnailUrl?: string;
  prompt: string;
  negativePrompt?: string;
  model: string;
  ratio: string;
  resolution?: string;
  estimatedCredit: number;
  taskId: string;
  timestamp: string;
  isPublic?: boolean;
  isFavorite?: boolean;
  refUrls?: string[];
}
interface ActiveTask {
  taskId: string;
  status: string;
  prompt?: string;
  model?: string;
  ratio?: string;
  createdAt?: string;
  startedAt?: string;
}

function GalleryThumbnail({ item, blur }: { item: Result; blur: boolean }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <div className="relative aspect-square overflow-hidden bg-muted">
      {!loaded && !failed && (
        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-muted via-primary/10 to-muted" />
      )}
      {failed ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-[#161822] text-muted-foreground">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.4"><rect x="6" y="8" width="36" height="28" rx="3"/><circle cx="17" cy="18" r="5"/><path d="M6 30 L17 22 L26 28 L38 14 L42 18"/></svg>
          <span className="text-[10px]">Tidak tersedia</span>
        </div>
      ) : (
        <img
          src={item.thumbnailUrl || item.url}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          className={`h-full w-full object-cover transition duration-300 ${loaded ? "opacity-100" : "opacity-0"} ${blur ? "blur-xl hover:blur-md" : ""}`}
          onError={(e) => {
            const img = e.target as HTMLImageElement;
            if (img.src !== brokenImg()) {
              img.src = brokenImg();
              img.onerror = null;
            } else {
              setFailed(true);
            }
          }}
        />
      )}
    </div>
  );
}

export default function Gallery() {
  const { user } = useAuth();
  const userLabel = user?.telegramUsername
    ? `@${user.telegramUsername.replace(/^@/, "")}`
    : user?.displayName || user?.email;
  const navigate = useNavigate();
  const [results, setResults] = useState<Result[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 24;
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [query, setQuery] = useState("");
  const [model, setModel] = useState("");
  const [visibility, setVisibility] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [selected, setSelected] = useState<string[]>([]);
  const [detail, setDetail] = useState<Result | null>(null);
  const [postTarget, setPostTarget] = useState<Result | null>(null);
  const [postCaption, setPostCaption] = useState("");
  const [postTags, setPostTags] = useState("");
  const [postCreatorName, setPostCreatorName] = useState("");
  const [postShowPrompt, setPostShowPrompt] = useState(true);
  const [postAllowCopy, setPostAllowCopy] = useState(true);
  const [postAllowRemix, setPostAllowRemix] = useState(true);
  const [posting, setPosting] = useState(false);
  const [shareTarget, setShareTarget] = useState<Result | null>(null);
  const [blur, setBlur] = useState(
    () => localStorage.getItem("gallery_blur") !== "false",
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [activeTasks, setActiveTasks] = useState<ActiveTask[]>([]);
  const [clockNow, setClockNow] = useState(Date.now());
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [filterOpen, setFilterOpen] = useState(false);
  const [draftModel, setDraftModel] = useState(model);
  const [draftVisibility, setDraftVisibility] = useState(visibility);
  const [draftSortBy, setDraftSortBy] = useState(sortBy);
  const [draftBlur, setDraftBlur] = useState(blur);
  const hadActiveRef = useRef(false);
  const [galleryBannerDismissed, setGalleryBannerDismissed] = useState(
    () => sessionStorage.getItem('galleryBannerDismissed') === 'true'
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (query) params.set("q", query);
      if (model) params.set("model", model);
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);
      try {
        const response = await fetch(`/api/results?${params}`, {
          credentials: "include",
          signal: controller.signal,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok)
          throw new Error(data.error || "Unable to load gallery");
        setResults(data.items || []);
        setTotal(data.total || 0);
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error ? cause.message : "Unable to load gallery",
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, model, refreshVersion, page, dateFrom, dateTo]);

  useEffect(() => { setPage(1) }, [query, model, dateFrom, dateTo]);

  useEffect(() => {
    const handler = () => setDetail(null)
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [])

  useEffect(() => {
    let disposed = false;
    const loadActive = async () => {
      const response = await fetch("/api/image/tasks/active", {
        credentials: "include",
      }).catch(() => null);
      const next: ActiveTask[] = response?.ok
        ? await response.json().catch(() => [])
        : [];
      if (disposed) return;
      if (hadActiveRef.current && next.length === 0)
        setRefreshVersion((value) => value + 1);
      hadActiveRef.current = next.length > 0;
      setActiveTasks(next);
    };
    loadActive();
    const interval = window.setInterval(loadActive, 2000);
    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!activeTasks.length) return;
    setClockNow(Date.now());
    const interval = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [activeTasks.length]);

  const visible = results.filter((item) => {
    if (visibility === "favorites") return item.isFavorite;
    if (
      visibility !== "all" &&
      (visibility === "public") !== Boolean(item.isPublic)
    )
      return false;
    return true;
  });

  const sorted = [...visible].sort((a, b) => {
    switch (sortBy) {
      case "oldest":
        return (
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
      case "cost-high":
        return (b.estimatedCredit || 0) - (a.estimatedCredit || 0);
      case "cost-low":
        return (a.estimatedCredit || 0) - (b.estimatedCredit || 0);
      case "newest":
      default:
        return (
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
    }
  });

  const modelOptions = [
    ...new Set(results.map((item) => item.model).filter(Boolean)),
  ];
  const activeFilterCount =
    Number(Boolean(model)) +
    Number(visibility !== "all") +
    Number(sortBy !== "newest") +
    Number(!blur);

  function toggleBlur() {
    setBlur((prev) => {
      const next = !prev;
      localStorage.setItem("gallery_blur", String(next));
      return next;
    });
  }
  function openFilters() {
    setDraftModel(model);
    setDraftVisibility(visibility);
    setDraftSortBy(sortBy);
    setDraftBlur(blur);
    setFilterOpen(true);
  }
  function resetFilterDraft() {
    setDraftModel("");
    setDraftVisibility("all");
    setDraftSortBy("newest");
    setDraftBlur(true);
  }
  function applyMobileFilters() {
    setModel(draftModel);
    setVisibility(draftVisibility);
    setSortBy(draftSortBy);
    setBlur(draftBlur);
    localStorage.setItem("gallery_blur", String(draftBlur));
    setFilterOpen(false);
  }
  async function copyPrompt(text: string) {
    await navigator.clipboard.writeText(text);
    setFeedback("Prompt copied");
    window.setTimeout(() => setFeedback(""), 1800);
  }
  function recreate(item: Result) {
    sessionStorage.setItem(
      "generationDraft",
      JSON.stringify({
        prompt: item.prompt,
        negativePrompt: item.negativePrompt || '',
        model: item.model,
        ratio: item.ratio,
        resolution: item.resolution,
        taskId: item.taskId,
      }),
    );
    navigate("/generate");
  }
  function toggleSelection(id: string) {
    setSelected((prev) =>
      prev.includes(id)
        ? prev.filter((item) => item !== id)
        : prev.length < 100
          ? [...prev, id]
          : prev,
    );
  }

  async function changeVisibility(item: Result) {
    if (!item.isPublic) {
      setPostTarget(item);
      setDetail(null);
      setPostCaption("");
      setPostTags("");
      setPostCreatorName(
        user?.telegramUsername
          ? `@${user.telegramUsername.replace(/^@/, "")}`
          : user?.displayName || "Kreator Kreasya",
      );
      setPostShowPrompt(true);
      setPostAllowCopy(true);
      setPostAllowRemix(true);
      return;
    }
    const response = await fetch(
      `/api/results/${encodeURIComponent(item.taskId)}/public`,
      {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPublic: false }),
      },
    );
    if (!response.ok) {
      setError("Post tidak dapat ditarik dari Explore.");
      return;
    }
    setResults((previous) =>
      previous.map((result) =>
        result.taskId === item.taskId ? { ...result, isPublic: false } : result,
      ),
    );
    setDetail((previous) =>
      previous?.taskId === item.taskId
        ? { ...previous, isPublic: false }
        : previous,
    );
    setFeedback("Post kembali menjadi private");
  }

  async function publishGlobal() {
    if (!postTarget || posting) return;
    setPosting(true);
    setError("");
    const response = await fetch(
      `/api/results/${encodeURIComponent(postTarget.taskId)}/public`,
      {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isPublic: true,
          caption: postCaption,
          tags: postTags.split(","),
          creatorName: postCreatorName,
          showPrompt: postShowPrompt,
          allowPromptCopy: postShowPrompt && postAllowCopy,
          allowRemix: postShowPrompt && postAllowRemix,
        }),
      },
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok)
      setError(data.error || "Post tidak dapat dipublikasikan.");
    else {
      setResults((previous) =>
        previous.map((item) =>
          item.taskId === postTarget.taskId
            ? { ...item, isPublic: true }
            : item,
        ),
      );
      setPostTarget(null);
      setFeedback("Berhasil diposting ke Explore");
    }
    setPosting(false);
  }

  async function bulk(action: "delete" | "setVisibility", isPublic?: boolean) {
    if (!selected.length || selected.length > 100) return;
    if (
      action === "delete" &&
      !confirm(`Delete ${selected.length} selected results?`)
    )
      return;
    setError("");
    const response = await fetch("/api/results/bulk", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskIds: selected, action, isPublic }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error || "Bulk action failed");
      return;
    }
    if (action === "delete")
      setResults((prev) =>
        prev.filter((item) => !selected.includes(item.taskId)),
      );
    else
      setResults((prev) =>
        prev.map((item) =>
          selected.includes(item.taskId) ? { ...item, isPublic } : item,
        ),
      );
    setFeedback(
      action === "delete"
        ? `${data.deleted || selected.length} results deleted`
        : `${data.updated || selected.length} results updated`,
    );
    setSelected([]);
  }

  async function downloadBulk() {
    const resp = await fetch('/api/results/download', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskIds: selected.slice(0, 20) }),
    })
    if (!resp.ok) return setError('Download failed')
    const blob = await resp.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'kreasya-images.zip'; a.click()
    URL.revokeObjectURL(url)
    setSelected([])
  }

  return (
    <Layout title="My Gallery" subtitle="Your private collection">
      {!galleryBannerDismissed && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <div className="flex-1 space-y-1">
            <p className="font-medium text-amber-200">Beberapa hasil generate tidak tersedia</p>
            <p className="text-amber-300/80">Hasil generate sebelum 27 Agustus 2026 tidak dapat dimuat karena kendala teknis server. Hasil terbaru tetap aman dan bisa diakses seperti biasa.</p>
          </div>
          <button onClick={() => { setGalleryBannerDismissed(true); sessionStorage.setItem('galleryBannerDismissed', 'true') }} className="shrink-0 rounded-lg p-1 text-amber-400 hover:bg-amber-500/20 hover:text-amber-200" aria-label="Tutup"><X className="h-4 w-4" /></button>
        </div>
      )}
      <header className="mb-4 sm:mb-6">
        <Badge
          variant="outline"
          className="mb-2 border-border text-primary sm:mb-3"
        >
          <Images className="mr-1.5 h-3.5 w-3.5" />
          Personal archive
        </Badge>
        <h1 className="text-xl font-semibold sm:text-2xl lg:text-3xl">
          Your creative collection
        </h1>
        <p className="mt-1.5 text-xs text-muted-foreground sm:mt-2 sm:text-sm">
          {total} creations saved for {userLabel}
        </p>
      </header>
      <Card className="mb-4 border-border bg-card sm:mb-5">
        <CardContent className="flex gap-2 p-3 md:hidden">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Cari prompt"
              className="pl-9"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={openFilters}
            aria-label="Buka filter"
            className="relative min-h-9 shrink-0 px-3"
          >
            <SlidersHorizontal className="h-4 w-4" />
            <span className="hidden min-[380px]:inline">Filter</span>
            {activeFilterCount > 0 && (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
          </Button>
        </CardContent>
        <CardContent className="hidden gap-3 p-4 md:grid lg:grid-cols-4">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search prompts"
              className="pl-9"
            />
          </div>
          <Select value={model} onChange={(e) => setModel(e.target.value)}>
            <option value="">All models</option>
            {modelOptions.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </Select>
          <Select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value)}
          >
            <option value="all">All</option>
            <option value="favorites">Favorites</option>
            <option value="public">Public</option>
            <option value="private">Private</option>
          </Select>
          <div className="flex gap-2">
            <Select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="flex-1"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="cost-high">Cost: High-Low</option>
              <option value="cost-low">Cost: Low-High</option>
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={toggleBlur}
              title={blur ? "Disable blur" : "Enable blur"}
              className="shrink-0"
            >
              {blur ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </Button>
          </div>
        </CardContent>
        <CardContent className="hidden gap-3 px-4 pb-4 md:flex">
          <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-40" />
          <span className="flex items-center text-xs text-muted-foreground">sampai</span>
          <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-40" />
          {(dateFrom || dateTo) && <Button variant="ghost" size="sm" onClick={() => { setDateFrom(''); setDateTo('') }}>Reset</Button>}
        </CardContent>
      </Card>
      <MobileFilterSheet
        open={filterOpen}
        title="Filter Gallery"
        onClose={() => setFilterOpen(false)}
        onReset={resetFilterDraft}
        onApply={applyMobileFilters}
      >
        <label className="block space-y-2 text-sm font-medium">
          <span>Model</span>
          <Select
            value={draftModel}
            onChange={(e) => setDraftModel(e.target.value)}
            className="w-full"
          >
            <option value="">Semua model</option>
            {modelOptions.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </Select>
        </label>
        <label className="block space-y-2 text-sm font-medium">
          <span>Visibilitas</span>
          <Select
            value={draftVisibility}
            onChange={(e) => setDraftVisibility(e.target.value)}
            className="w-full"
          >
            <option value="all">Semua karya</option>
            <option value="favorites">Favorit</option>
            <option value="public">Publik</option>
            <option value="private">Private</option>
          </Select>
        </label>
        <label className="block space-y-2 text-sm font-medium">
          <span>Urutkan</span>
          <Select
            value={draftSortBy}
            onChange={(e) => setDraftSortBy(e.target.value)}
            className="w-full"
          >
            <option value="newest">Terbaru</option>
            <option value="oldest">Terlama</option>
            <option value="cost-high">Kredit tertinggi</option>
            <option value="cost-low">Kredit terendah</option>
          </Select>
        </label>
        <label className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-border p-3 text-sm">
          <span>
            <span className="block font-medium">Blur gambar</span>
            <span className="text-xs text-muted-foreground">
              Samarkan gambar dan prompt.
            </span>
          </span>
          <input
            type="checkbox"
            checked={draftBlur}
            onChange={(e) => setDraftBlur(e.target.checked)}
            className="h-5 w-5 accent-primary"
          />
        </label>
      </MobileFilterSheet>
      {selected.length > 0 && (
        <div className="sticky top-20 z-30 mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card/95 p-3 shadow-sm backdrop-blur sm:mb-5">
          <Badge>{selected.length} selected</Badge>
          <Button
            size="sm"
            variant="outline"
            onClick={() => bulk("setVisibility", true)}
            className="min-h-[44px]"
          >
            <Globe2 className="h-3.5 w-3.5" />
            <span>Public</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => bulk("setVisibility", false)}
            className="min-h-[44px]"
          >
            <Lock className="h-3.5 w-3.5" />
            <span>Private</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-destructive min-h-[44px]"
            onClick={() => bulk("delete")}
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Delete</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="min-h-[44px]"
            onClick={downloadBulk}
          >
            <Download className="h-3.5 w-3.5" />
            <span>Download</span>
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
            Clear
          </Button>
        </div>
      )}
      {(error || feedback) && (
        <p
          className={`mb-4 rounded-xl border p-3 text-sm ${error ? "border-destructive bg-destructive/10 text-destructive-foreground" : "border-primary bg-primary/10 text-foreground"}`}
        >
          {error || feedback}
        </p>
      )}
      {activeTasks.length > 0 && (
        <section className="mb-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
            Generating now
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {activeTasks.map((task) => (
              <Card
                key={task.taskId}
                className="overflow-hidden border-primary/20"
              >
                <div className="relative grid aspect-square place-items-center overflow-hidden bg-gradient-to-br from-primary/5 via-primary/15 to-muted">
                  <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-transparent via-white/5 to-transparent" />
                  <div className="relative text-center">
                    <div className="relative mx-auto h-14 w-14">
                      <div className="absolute inset-0 animate-ping rounded-full bg-primary/10" />
                      <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-primary border-r-primary/30" />
                      <Wand2 className="absolute inset-0 m-auto h-5 w-5 text-primary" />
                    </div>
                    <p className="mt-4 text-sm font-medium">
                      {task.status === "queued"
                        ? "Waiting in queue"
                        : "Generating image"}
                    </p>
                    <p className="mt-1 flex items-center justify-center gap-1 font-mono text-xs text-muted-foreground">
                      <Clock3 className="h-3.5 w-3.5" />
                      {Math.max(
                        0,
                        Math.floor(
                          (clockNow -
                            new Date(
                              task.startedAt || task.createdAt || clockNow,
                            ).getTime()) /
                            1000,
                        ),
                      )}
                      s
                    </p>
                  </div>
                </div>
                <CardContent className="p-3">
                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    {task.prompt || "Preparing your generation..."}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}
      {loading ? (
        <div className="grid min-h-64 place-items-center">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : sorted.length === 0 ? (
        <Card className="border-dashed bg-card py-16 text-center">
          <CardContent>
            <Images className="mx-auto h-8 w-8 text-primary" />
            <p className="mt-4 font-semibold">No matching images</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Create an image or adjust your filters.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="columns-1 gap-3 sm:columns-2 sm:gap-4 lg:columns-3 xl:columns-4">
          {sorted.map((item) => (
            <Card
              key={item.taskId}
              className="mb-3 break-inside-avoid overflow-hidden border-border bg-card sm:mb-4"
            >
              <div
                className="relative cursor-pointer overflow-hidden bg-muted"
                onClick={() => { setDetail(item); window.history.pushState({ galleryDetail: true }, '') }}
              >
                <GalleryThumbnail item={item} blur={blur} />
                <button
                  type="button"
                  aria-label="Select result"
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleSelection(item.taskId);
                  }}
                  className={`absolute left-3 top-3 grid h-9 w-9 place-items-center rounded-lg border transition ${selected.includes(item.taskId) ? "border-primary bg-primary text-primary-foreground" : "border-white/70 bg-black/50 text-white hover:bg-black/70"}`}
                >
                  {selected.includes(item.taskId) && (
                    <Check className="h-4 w-4" />
                  )}
                </button>
                <Badge
                  variant="outline"
                  className={`absolute right-3 top-3 backdrop-blur ${item.isPublic ? "border-success/60 bg-success/15 text-success" : "border-border bg-card/90 text-foreground"}`}
                >
                  {item.isPublic ? (
                    <Globe2 className="mr-1 h-3 w-3" />
                  ) : (
                    <Lock className="mr-1 h-3 w-3" />
                  )}
                  {item.isPublic ? "Public" : "Private"}
                </Badge>
              </div>
              <CardContent className="space-y-3 p-4">
                <p
                  className={`line-clamp-3 text-sm text-muted-foreground ${blur ? "blur-sm" : ""}`}
                >
                  {item.prompt}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {item.model} | {item.ratio} | {item.estimatedCredit}cr
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 min-h-[44px]"
                    onClick={() => copyPrompt(item.prompt)}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Copy
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-[44px]"
                    asChild
                  >
                    <a href={item.url} download>
                      <Download className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 min-h-[44px]"
                    onClick={() => recreate(item)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Use
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {total > limit && (
        <div className="mt-6 flex items-center justify-center gap-4">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">{page} / {Math.ceil(total / limit)}</span>
          <Button variant="outline" size="sm" disabled={page >= Math.ceil(total / limit)} onClick={() => setPage(p => p + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
      <ImageDetailModal
        open={Boolean(detail)}
        url={detail?.url || ''}
        prompt={detail?.prompt || ''}
        model={detail?.model}
        ratio={detail?.ratio}
        resolution={detail?.resolution}
        isPublic={detail?.isPublic}
        blur={blur}
        onClose={() => { setDetail(null); if (window.history.state?.galleryDetail) window.history.back() }}
        onCopyPrompt={() => detail && copyPrompt(detail.prompt)}
        onRecreate={() => detail && recreate(detail)}
        onToggleVisibility={() => detail && changeVisibility(detail)}
      />
      <PrivateShareDialog
        taskId={shareTarget?.taskId}
        imageUrl={shareTarget?.thumbnailUrl || shareTarget?.url}
        open={Boolean(shareTarget)}
        onOpenChange={(open) => !open && setShareTarget(null)}
      />
      <Dialog
        open={Boolean(postTarget)}
        onOpenChange={(open) => !open && setPostTarget(null)}
      >
        <DialogHeader>
          <DialogTitle>Post ke Explore</DialogTitle>
          <DialogDescription>
            Atur bagaimana komunitas dapat melihat dan menggunakan karya ini.
          </DialogDescription>
          <DialogClose onClose={() => setPostTarget(null)} />
        </DialogHeader>
        {postTarget && (
          <DialogContent className="space-y-4">
            <img
              src={postTarget.thumbnailUrl || postTarget.url}
              className="max-h-52 w-full rounded-xl bg-muted object-contain"
            />
            <div>
              <label
                htmlFor="gallery-post-creator"
                className="text-sm font-medium"
              >
                Nama kreator
              </label>
              <Input
                id="gallery-post-creator"
                value={postCreatorName}
                onChange={(e) =>
                  setPostCreatorName(e.target.value.slice(0, 50))
                }
                placeholder="Kreator Kreasya"
                className="mt-1.5"
              />
            </div>
            <div>
              <label
                htmlFor="gallery-post-caption"
                className="text-sm font-medium"
              >
                Caption{" "}
                <span className="font-normal text-muted-foreground">
                  (opsional)
                </span>
              </label>
              <Textarea
                id="gallery-post-caption"
                value={postCaption}
                onChange={(e) => setPostCaption(e.target.value.slice(0, 500))}
                placeholder="Ceritakan sedikit tentang karya ini..."
                className="mt-1.5 min-h-24"
              />
              <p className="mt-1 text-right text-xs text-muted-foreground">
                {postCaption.length}/500
              </p>
            </div>
            <div>
              <label
                htmlFor="gallery-post-tags"
                className="text-sm font-medium"
              >
                Tags{" "}
                <span className="font-normal text-muted-foreground">
                  (maks. 5)
                </span>
              </label>
              <Input
                id="gallery-post-tags"
                value={postTags}
                onChange={(e) => setPostTags(e.target.value)}
                placeholder="portrait, indonesia, cinematic"
                className="mt-1.5"
              />
            </div>
            <div className="space-y-2 rounded-xl border border-border bg-muted/25 p-3">
              <label className="flex cursor-pointer items-center justify-between gap-3 text-sm">
                <span>
                  <span className="block font-medium">Tampilkan prompt</span>
                  <span className="text-xs text-muted-foreground">
                    Komunitas dapat mempelajari prompt karya.
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={postShowPrompt}
                  onChange={(e) => {
                    setPostShowPrompt(e.target.checked);
                    if (!e.target.checked) {
                      setPostAllowCopy(false);
                      setPostAllowRemix(false);
                    }
                  }}
                  className="h-4 w-4 accent-primary"
                />
              </label>
              <label className="flex cursor-pointer items-center justify-between gap-3 border-t border-border pt-2 text-sm">
                <span>
                  <span className="block font-medium">
                    Izinkan salin prompt
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Menampilkan tombol Salin Prompt.
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={postShowPrompt && postAllowCopy}
                  disabled={!postShowPrompt}
                  onChange={(e) => setPostAllowCopy(e.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
              </label>
              <label className="flex cursor-pointer items-center justify-between gap-3 border-t border-border pt-2 text-sm">
                <span>
                  <span className="block font-medium">Izinkan Remix Karya</span>
                  <span className="text-xs text-muted-foreground">
                    Gambar dapat dipakai melalui reference existing.
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={postShowPrompt && postAllowRemix}
                  disabled={!postShowPrompt}
                  onChange={(e) => setPostAllowRemix(e.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
              </label>
            </div>
            <Button
              className="w-full"
              onClick={publishGlobal}
              disabled={posting}
            >
              <Globe2 className="h-4 w-4" />
              {posting ? "Posting..." : "Post Global"}
            </Button>
          </DialogContent>
        )}
      </Dialog>
    </Layout>
  );
}
