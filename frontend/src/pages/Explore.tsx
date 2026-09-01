import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Compass,
  Copy,
  Eye,
  EyeOff,
  Flag,
  Heart,
  LayoutGrid,
  List,
  LockKeyhole,
  Maximize2,
  MoreHorizontal,
  Repeat2,
  Search,
  Share2,
  SlidersHorizontal,
  Sparkles,
  User,
  X,
} from "lucide-react";
import { brokenImg } from "../lib/utils";
import { useAuth } from "../hooks/useAuth";
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
import { Select } from "../components/ui/select";
import { Layout } from "../components/Layout";
import { LoadingImage } from "../components/LoadingImage";
import { MobileFilterSheet } from "../components/MobileFilterSheet";

interface PublicResult {
  taskId: string;
  url: string;
  thumbnailUrl?: string;
  prompt: string;
  model: string;
  ratio: string;
  resolution?: string;
  estimatedCredit: number;
  email: string;
  timestamp: string;
  caption?: string;
  tags?: string[];
  creatorName: string;
  likeCount: number;
  saveCount: number;
  remixCount: number;
  liked?: boolean;
  saved?: boolean;
  showPrompt: boolean;
  allowPromptCopy: boolean;
  allowRemix: boolean;
  canRemix: boolean;
  remixParentTaskId?: string | null;
  remixParentCreator?: string | null;
  negativePrompt?: string;
  blurred?: boolean;
}

function creatorInitials(name: string) {
  return (
    (name || "Kreator Piksel")
      .replace(/^@/, "")
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "KR"
  );
}

function relativeTime(value: string) {
  const seconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 1000),
  );
  if (seconds < 60) return "baru saja";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} menit`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} jam`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)} hari`;
  return new Date(value).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
  });
}

export default function Explore() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const page = Math.max(1, Number(params.get("page")) || 1);
  const query = params.get("q") || "",
    model = params.get("model") || "",
    ratio = params.get("ratio") || "",
    sort = params.get("sort") === "popular" ? "popular" : "newest",
    postId = params.get("post") || "",
    savedOnly = params.get("view") === "saved";
  const [results, setResults] = useState<PublicResult[]>([]);
  const [total, setTotal] = useState(0);
  const [blur, setBlur] = useState(
    () => localStorage.getItem("explore_blur") !== "false",
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [detail, setDetail] = useState<PublicResult | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (detail) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [detail])
  const [viewMode, setViewMode] = useState<"feed" | "grid">(() =>
    localStorage.getItem("explore_view") === "grid" ? "grid" : "feed",
  );
  const [expandedPromptIds, setExpandedPromptIds] = useState<string[]>([]);
  const [menuTarget, setMenuTarget] = useState<PublicResult | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [draftModel, setDraftModel] = useState(model);
  const [draftRatio, setDraftRatio] = useState(ratio);
  const [draftSort, setDraftSort] = useState(sort);
  const [draftBlur, setDraftBlur] = useState(blur);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const requestedPost = postId;
    fetch(
      `/api/public/results?page=${requestedPost ? 1 : page}&limit=20&sort=${sort}${requestedPost ? `&taskId=${encodeURIComponent(requestedPost)}` : ""}${savedOnly && !requestedPost ? "&saved=true" : ""}`,
      { credentials: "include", signal: controller.signal },
    )
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Unable to load Explore");
        return data;
      })
      .then((data) => {
        const items = data.items || [];
        setResults(items);
        setTotal(data.total || 0);
        if (requestedPost)
          setDetail(
            items.find((item: PublicResult) => item.taskId === requestedPost) ||
              null,
          );
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error ? cause.message : "Unable to load Explore",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [page, sort, postId, savedOnly]);

  function update(name: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    next.delete("page");
    setParams(next);
  }
  function setPage(pageNumber: number) {
    const next = new URLSearchParams(params);
    next.set("page", String(pageNumber));
    next.delete("post");
    setParams(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function toggleBlur() {
    setBlur((prev) => {
      const next = !prev;
      localStorage.setItem("explore_blur", String(next));
      return next;
    });
  }
  function openFilters() {
    setDraftModel(model);
    setDraftRatio(ratio);
    setDraftSort(sort);
    setDraftBlur(blur);
    setFilterOpen(true);
  }
  function resetFilterDraft() {
    setDraftModel("");
    setDraftRatio("");
    setDraftSort("newest");
    setDraftBlur(true);
  }
  function applyMobileFilters() {
    const next = new URLSearchParams(params);
    if (draftModel) next.set("model", draftModel);
    else next.delete("model");
    if (draftRatio) next.set("ratio", draftRatio);
    else next.delete("ratio");
    if (draftSort === "popular") next.set("sort", draftSort);
    else next.delete("sort");
    next.delete("page");
    setParams(next);
    setBlur(draftBlur);
    localStorage.setItem("explore_blur", String(draftBlur));
    setFilterOpen(false);
  }
  function updateItem(taskId: string, patch: Partial<PublicResult>) {
    setResults((prev) =>
      prev.map((item) =>
        item.taskId === taskId ? { ...item, ...patch } : item,
      ),
    );
    setDetail((prev) =>
      prev?.taskId === taskId ? { ...prev, ...patch } : prev,
    );
  }
  function requireLogin() {
    if (user) return true;
    navigate("/");
    return false;
  }
  async function copy(text: string) {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }
  function inspire(item: PublicResult) {
    sessionStorage.setItem(
      "generationDraft",
      JSON.stringify({
        prompt: item.prompt,
        negativePrompt: item.negativePrompt || '',
        model: item.model,
        ratio: item.ratio,
        resolution: item.resolution,
      }),
    );
    navigate(user ? "/generate" : "/");
  }
  function remix(item: PublicResult) {
    if (!requireLogin() || !item.canRemix) return;
    sessionStorage.setItem(
      "generationDraft",
      JSON.stringify({
        prompt: item.prompt,
        negativePrompt: item.negativePrompt || '',
        model: item.model,
        ratio: item.ratio,
        resolution: item.resolution,
        referenceUrl: item.url,
        remixParentTaskId: item.taskId,
      }),
    );
    navigate("/generate");
  }

  async function toggleInteraction(item: PublicResult, type: "like" | "save") {
    if (!requireLogin()) return;
    const field = type === "like" ? "liked" : "saved",
      countField = type === "like" ? "likeCount" : "saveCount";
    const next = !item[field];
    updateItem(item.taskId, {
      [field]: next,
      [countField]: Math.max(0, item[countField] + (next ? 1 : -1)),
    });
    const response = await fetch(
      `/api/public/posts/${encodeURIComponent(item.taskId)}/${type}`,
      {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: next }),
      },
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      updateItem(item.taskId, {
        [field]: item[field],
        [countField]: item[countField],
      });
      setError(data.error || `Unable to ${type} post`);
    } else
      updateItem(item.taskId, {
        [field]: data[field],
        [countField]: data[countField],
      });
  }

  async function sharePost(item: PublicResult) {
    const url = `${window.location.origin}/explore?post=${encodeURIComponent(item.taskId)}`;
    if (navigator.share)
      await navigator
        .share({
          title: "Piksel creation",
          text: item.caption || item.prompt.slice(0, 100),
          url,
        })
        .catch(() => {});
    else {
      await navigator.clipboard.writeText(url);
      setFeedback("Public link copied");
      window.setTimeout(() => setFeedback(""), 1800);
    }
  }

  async function reportPost(item: PublicResult) {
    if (
      !requireLogin() ||
      !window.confirm("Report post ini untuk ditinjau admin?")
    )
      return;
    const response = await fetch(
      `/api/public/posts/${encodeURIComponent(item.taskId)}/report`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "other" }),
      },
    );
    if (response.ok) {
      setFeedback("Report terkirim. Terima kasih.");
      window.setTimeout(() => setFeedback(""), 2500);
    } else setError("Report tidak dapat dikirim");
  }

  const visible = results.filter(
    (item) =>
      (!query ||
        `${item.caption || ""} ${item.prompt} ${(item.tags || []).join(" ")}`
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (!model || item.model === model) &&
      (!ratio || item.ratio === ratio),
  );
  const models = [
      ...new Set(results.map((item) => item.model).filter(Boolean)),
    ],
    ratios = [...new Set(results.map((item) => item.ratio).filter(Boolean))];
  const totalPages = Math.max(1, Math.ceil(total / 20));
  const popularItems = [...visible]
    .sort(
      (a, b) =>
        b.likeCount +
        b.saveCount +
        b.remixCount -
        (a.likeCount + a.saveCount + a.remixCount),
    )
    .slice(0, 4);
  const popularTags = [
    ...new Set(visible.flatMap((item) => item.tags || [])),
  ].slice(0, 8);
  const activeFilterCount =
    Number(Boolean(model)) +
    Number(Boolean(ratio)) +
    Number(sort !== "newest") +
    Number(!blur);

  function changeView(next: "feed" | "grid") {
    setViewMode(next);
    localStorage.setItem("explore_view", next);
  }

  function togglePrompt(taskId: string) {
    setExpandedPromptIds((previous) =>
      previous.includes(taskId)
        ? previous.filter((id) => id !== taskId)
        : [...previous, taskId],
    );
  }

  function postMenu(item: PublicResult, className = "") {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Menu post"
        title="Menu post"
        className={`z-20 bg-card/90 shadow-sm backdrop-blur ${className}`}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setMenuTarget(item);
        }}
      >
        <MoreHorizontal className="h-4 w-4" />
      </Button>
    );
  }

  function runMenuAction(action: () => void | Promise<void>) {
    setMenuTarget(null);
    void action();
  }

  return (
    <Layout title="Piksel" subtitle="Community showcase">
      <header className="relative mb-4 overflow-hidden rounded-3xl border border-border bg-card px-4 py-6 shadow-sm sm:mb-6 sm:px-8 sm:py-8">
        <div className="absolute -right-16 -top-20 h-56 w-56 rounded-full bg-primary/15 blur-3xl" />
        <div className="relative max-w-2xl">
          <Badge
            variant="outline"
            className="mb-3 border-border text-primary sm:mb-4"
          >
            <Compass className="mr-1.5 h-3.5 w-3.5" />
            Komunitas Piksel
          </Badge>
          <h1 className="text-2xl font-semibold sm:text-3xl lg:text-5xl">
            Temukan. Pelajari. Remix.
          </h1>
          <p className="mt-3 text-xs text-muted-foreground sm:mt-4 sm:text-sm">
            Jelajahi {total} karya, pelajari resep kreatifnya, lalu buat versimu
            sendiri.
          </p>
          {user && (
            <Button
              variant={savedOnly ? "default" : "outline"}
              size="sm"
              onClick={() => update("view", savedOnly ? "" : "saved")}
              className="mt-4"
            >
              <Bookmark className="h-4 w-4" />
              {savedOnly ? "Menampilkan tersimpan" : "Karya tersimpan"}
            </Button>
          )}
        </div>
      </header>
      <Card className="mb-4 border-border bg-card sm:mb-6">
        <CardContent className="flex gap-2 p-3 md:hidden">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => update("q", e.target.value)}
              placeholder="Cari karya"
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
              onChange={(e) => update("q", e.target.value)}
              placeholder="Search posts"
              className="pl-9"
            />
          </div>
          <Select
            value={model}
            onChange={(e) => update("model", e.target.value)}
          >
            <option value="">All models</option>
            {models.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </Select>
          <Select
            value={ratio}
            onChange={(e) => update("ratio", e.target.value)}
          >
            <option value="">All ratios</option>
            {ratios.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </Select>
          <div className="flex gap-2">
            <Select
              value={sort}
              onChange={(e) => update("sort", e.target.value)}
              className="flex-1"
            >
              <option value="newest">Newest</option>
              <option value="popular">Popular</option>
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
      </Card>
      <MobileFilterSheet
        open={filterOpen}
        title="Filter Explore"
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
            {models.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </Select>
        </label>
        <label className="block space-y-2 text-sm font-medium">
          <span>Rasio</span>
          <Select
            value={draftRatio}
            onChange={(e) => setDraftRatio(e.target.value)}
            className="w-full"
          >
            <option value="">Semua rasio</option>
            {ratios.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </Select>
        </label>
        <label className="block space-y-2 text-sm font-medium">
          <span>Urutkan</span>
          <Select
            value={draftSort}
            onChange={(e) => setDraftSort(e.target.value)}
            className="w-full"
          >
            <option value="newest">Terbaru</option>
            <option value="popular">Terpopuler</option>
          </Select>
        </label>
        <label className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-border p-3 text-sm">
          <span>
            <span className="block font-medium">Blur gambar</span>
            <span className="text-xs text-muted-foreground">
              Samarkan konten saat menjelajah.
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
      <div className="mb-4 flex items-center justify-between gap-3 sm:mb-6">
        <div>
          <p className="text-sm font-semibold">
            {viewMode === "feed" ? "Feed komunitas" : "Galeri komunitas"}
          </p>
          <p className="text-xs text-muted-foreground">
            {visible.length} karya di halaman ini
          </p>
        </div>
        <div className="flex rounded-xl border border-border bg-card p-1">
          <Button
            variant={viewMode === "feed" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => changeView("feed")}
            className="min-h-9"
          >
            <List className="h-4 w-4" />
            Feed
          </Button>
          <Button
            variant={viewMode === "grid" ? "secondary" : "ghost"}
            size="sm"
            onClick={() => changeView("grid")}
            className="min-h-9"
          >
            <LayoutGrid className="h-4 w-4" />
            Grid
          </Button>
        </div>
      </div>
      {(error || feedback) && (
        <p
          className={`mb-4 rounded-xl border p-3 text-sm ${error ? "border-destructive bg-destructive/10 text-destructive-foreground" : "border-primary bg-primary/10"}`}
        >
          {error || feedback}
        </p>
      )}
      {loading ? (
        <div className="grid min-h-[40vh] place-items-center">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : visible.length === 0 ? (
        <Card className="text-center">
          <CardHeader>
            <CardTitle>Belum ada karya yang cocok</CardTitle>
            <CardDescription>
              Ubah filter atau jelajahi halaman lainnya.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : viewMode === "grid" ? (
        <div className="columns-1 gap-3 sm:columns-2 sm:gap-4 lg:columns-3 xl:columns-4">
          {visible.map((item) => (
            <Card
              key={item.taskId}
              className="mb-3 break-inside-avoid overflow-hidden border-border bg-card transition sm:mb-4 sm:hover:-translate-y-1 sm:hover:border-primary/40"
            >
              <div className="block w-full text-left">
                <div className="relative">
                  <img
                    src={item.thumbnailUrl || item.url}
                    loading="lazy"
                    className={`aspect-square w-full object-cover transition ${blur || item.blurred ? "blur-xl hover:blur-md" : ""}`}
                    onError={(e) =>
                      ((e.target as HTMLImageElement).src = brokenImg())
                    }
                  />
                  {postMenu(item, "absolute right-3 top-3")}
                </div>
                <CardContent className="space-y-3 p-4">
                  {item.remixParentTaskId && (
                    <p className="flex items-center gap-1 text-[11px] text-primary">
                      <Repeat2 className="h-3 w-3" />
                      Remix dari {item.remixParentCreator || "karya komunitas"}
                    </p>
                  )}
                  {item.caption && (
                    <p className="line-clamp-2 text-sm font-medium">
                      {item.caption}
                    </p>
                  )}
                  {item.showPrompt ? (
                    <p
                      className={`line-clamp-3 text-sm text-muted-foreground ${blur ? "blur-sm" : ""}`}
                    >
                      {item.prompt}
                    </p>
                  ) : (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <LockKeyhole className="h-3.5 w-3.5" />
                      Prompt disembunyikan kreator
                    </p>
                  )}
                  {Boolean(item.tags?.length) && (
                    <div className="flex flex-wrap gap-1">
                      {item.tags?.map((tag) => (
                        <Badge
                          key={tag}
                          variant="outline"
                          className="text-[10px]"
                        >
                          #{tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <User className="h-3.5 w-3.5" />
                    <span>{item.creatorName || "Kreator Piksel"}</span>
                  </div>
                </CardContent>
              </div>
              <div className="flex items-center gap-1 border-t border-border px-3 py-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleInteraction(item, "like")}
                  className={item.liked ? "text-primary" : ""}
                >
                  <Heart
                    className={`h-4 w-4 ${item.liked ? "fill-current" : ""}`}
                  />
                  {item.likeCount}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleInteraction(item, "save")}
                  className={item.saved ? "text-primary" : ""}
                >
                  <Bookmark
                    className={`h-4 w-4 ${item.saved ? "fill-current" : ""}`}
                  />
                  {item.saveCount}
                </Button>
                {item.remixCount > 0 && (
                  <span
                    className="ml-1 flex items-center gap-1 text-xs text-muted-foreground"
                    title="Jumlah remix"
                  >
                    <Repeat2 className="h-3.5 w-3.5" />
                    {item.remixCount}
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => sharePost(item)}
                  className="ml-auto"
                >
                  <Share2 className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="mx-auto grid max-w-5xl items-start gap-6 xl:grid-cols-[minmax(0,680px)_280px]">
          <section className="min-w-0 space-y-5">
            {visible.map((item) => {
              const creator = item.creatorName || "Kreator Piksel";
              const promptExpanded = expandedPromptIds.includes(item.taskId);
              return (
                <Card
                  key={item.taskId}
                  className="overflow-hidden border-border bg-card shadow-sm"
                >
                  <div className="flex items-center gap-3 px-3 py-3 sm:px-4">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                      {creatorInitials(creator)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {creator}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {relativeTime(item.timestamp)} · {item.model} ·{" "}
                        {item.ratio}
                      </p>
                    </div>
                    {postMenu(item)}
                  </div>

                  <div className="relative block min-h-64 w-full overflow-hidden bg-muted text-left">
                    <LoadingImage
                      src={item.url || item.thumbnailUrl}
                      fallbackSrc={item.thumbnailUrl || brokenImg()}
                      loading="lazy"
                      alt={item.caption || `Karya ${creator}`}
                      className={`max-h-[78vh] min-h-64 w-full object-contain transition ${blur || item.blurred ? "blur-xl hover:blur-md" : ""}`}
                    />
                  </div>

                  <div className="px-3 pb-4 pt-2 sm:px-4">
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleInteraction(item, "like")}
                        className={item.liked ? "text-primary" : ""}
                      >
                        <Heart
                          className={`h-4 w-4 ${item.liked ? "fill-current" : ""}`}
                        />
                        {item.likeCount}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleInteraction(item, "save")}
                        className={item.saved ? "text-primary" : ""}
                      >
                        <Bookmark
                          className={`h-4 w-4 ${item.saved ? "fill-current" : ""}`}
                        />
                        {item.saveCount}
                      </Button>
                      {item.canRemix && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => remix(item)}
                        >
                          <Repeat2 className="h-4 w-4" />
                          Remix
                          {item.remixCount > 0 ? ` ${item.remixCount}` : ""}
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => sharePost(item)}
                        className="ml-auto"
                        title="Bagikan"
                      >
                        <Share2 className="h-4 w-4" />
                      </Button>
                    </div>

                    {item.caption && (
                      <p className="mt-2 text-sm leading-6">
                        <span className="mr-1 font-semibold">{creator}</span>
                        {item.caption}
                      </p>
                    )}
                    {item.remixParentTaskId && (
                      <button
                        type="button"
                        className="mt-2 flex items-center gap-1 text-xs text-primary hover:underline"
                        onClick={() =>
                          update("post", item.remixParentTaskId || "")
                        }
                      >
                        <Repeat2 className="h-3.5 w-3.5" />
                        Remix dari{" "}
                        {item.remixParentCreator || "karya komunitas"}
                      </button>
                    )}

                    {item.showPrompt ? (
                      <div className="mt-2">
                        <button
                          type="button"
                          onClick={() => togglePrompt(item.taskId)}
                          className="text-xs font-medium text-muted-foreground hover:text-foreground"
                        >
                          {promptExpanded
                            ? "Sembunyikan prompt"
                            : "Lihat prompt"}
                        </button>
                        {promptExpanded && (
                          <div className="mt-2 space-y-3 rounded-xl border border-border bg-muted/25 p-3">
                            <p
                              className={`whitespace-pre-wrap text-sm leading-6 text-muted-foreground ${blur ? "blur-sm" : ""}`}
                            >
                              {item.prompt}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {item.allowPromptCopy && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => copy(item.prompt)}
                                >
                                  <Copy className="h-3.5 w-3.5" />
                                  Salin prompt
                                </Button>
                              )}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => inspire(item)}
                              >
                                <Sparkles className="h-3.5 w-3.5" />
                                Gunakan sebagai inspirasi
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <LockKeyhole className="h-3.5 w-3.5" />
                        Prompt disembunyikan kreator
                      </p>
                    )}

                    {Boolean(item.tags?.length) && (
                      <div className="mt-3 flex flex-wrap gap-1">
                        {item.tags?.map((tag) => (
                          <button
                            type="button"
                            key={tag}
                            onClick={() => update("q", tag)}
                          >
                            <Badge
                              variant="outline"
                              className="text-[10px] hover:border-primary/50"
                            >
                              #{tag}
                            </Badge>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </section>

          <aside className="sticky top-6 hidden space-y-4 xl:block">
            <Card className="border-border bg-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  Populer di halaman ini
                </CardTitle>
                <CardDescription>
                  Karya dengan interaksi terbanyak.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {popularItems.map((item) => (
                  <div
                    key={item.taskId}
                    className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition-colors hover:bg-muted"
                  >
                    <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-muted">
                      <LoadingImage
                        src={item.thumbnailUrl || item.url}
                        fallbackSrc={brokenImg()}
                        alt="Karya populer"
                        className="h-full w-full object-cover"
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold">
                        {item.creatorName || "Kreator Piksel"}
                      </span>
                      <span className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Heart className="h-3 w-3" />
                          {item.likeCount}
                        </span>
                        <span>{item.ratio}</span>
                      </span>
                    </span>
                    {postMenu(item)}
                  </div>
                ))}
              </CardContent>
            </Card>
            {popularTags.length > 0 && (
              <Card className="border-border bg-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Tags populer</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-1.5">
                  {popularTags.map((tag) => (
                    <button
                      type="button"
                      key={tag}
                      onClick={() => update("q", tag)}
                    >
                      <Badge
                        variant="outline"
                        className="hover:border-primary/50"
                      >
                        #{tag}
                      </Badge>
                    </button>
                  ))}
                </CardContent>
              </Card>
            )}
          </aside>
        </div>
      )}
      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-3 sm:mt-8">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(page - 1)}
            disabled={page <= 1}
            className="min-h-[44px]"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Prev
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(page + 1)}
            disabled={page >= totalPages}
            className="min-h-[44px]"
          >
            Next
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
      {menuTarget && (
        <div className="fixed inset-0 z-[100]" role="presentation">
          <button
            type="button"
            aria-label="Tutup menu post"
            className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
            onClick={() => setMenuTarget(null)}
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Aksi post"
            className="absolute inset-x-0 bottom-0 overflow-hidden rounded-t-3xl border border-b-0 border-border bg-card shadow-2xl sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[360px] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border"
          >
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-muted-foreground/30 sm:hidden" />
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {menuTarget.creatorName || "Kreator Piksel"}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {menuTarget.model} · {menuTarget.ratio}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMenuTarget(null)}
                aria-label="Tutup menu post"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="space-y-1 p-2 pb-[max(.5rem,env(safe-area-inset-bottom))]">
              <button
                className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm transition hover:bg-muted"
                onClick={() => runMenuAction(() => setDetail(menuTarget))}
              >
                <Maximize2 className="h-4 w-4 text-muted-foreground" />
                Lihat detail
              </button>
              <button
                className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm transition hover:bg-muted"
                onClick={() => runMenuAction(() => sharePost(menuTarget))}
              >
                <Share2 className="h-4 w-4 text-muted-foreground" />
                Bagikan
              </button>
              {menuTarget.allowPromptCopy && (
                <button
                  className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm transition hover:bg-muted"
                  onClick={() => runMenuAction(() => copy(menuTarget.prompt))}
                >
                  <Copy className="h-4 w-4 text-muted-foreground" />
                  Salin prompt
                </button>
              )}
              {menuTarget.canRemix && (
                <button
                  className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm transition hover:bg-muted"
                  onClick={() => runMenuAction(() => remix(menuTarget))}
                >
                  <Repeat2 className="h-4 w-4 text-muted-foreground" />
                  Remix karya
                </button>
              )}
              <button
                className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm transition hover:bg-muted"
                onClick={() => runMenuAction(() => reportPost(menuTarget))}
              >
                <Flag className="h-4 w-4 text-muted-foreground" />
                Laporkan
              </button>
            </div>
          </section>
        </div>
      )}
      {detail && createPortal(
        <div className="fixed inset-0 z-[9999] bg-background flex flex-col" onKeyDown={e => { if (e.key === 'Backspace' && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) { e.preventDefault() } }}>
          <div className="flex-shrink-0 border-b bg-card px-4 py-3 flex items-center justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold truncate">{detail.caption || 'Karya komunitas'}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{detail.creatorName || 'Kreator Piksel'} · {detail.model} · {detail.ratio}</p>
            </div>
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg" onClick={() => { setDetail(null); const next = new URLSearchParams(params); next.delete('post'); setParams(next, { replace: true }) }}><X className="h-5 w-5" /></Button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <div className="flex flex-col lg:flex-row h-full">
              <div className="flex-1 flex items-center justify-center bg-black/90 p-4 min-h-[40vh]">
                <img src={detail.url} className={`max-h-full max-w-full object-contain ${blur || detail.blurred ? 'blur-xl' : ''}`} />
              </div>
              <div className="w-full lg:w-80 shrink-0 border-l border-border p-5 space-y-4">
                {detail.remixParentTaskId && (
                  <button type="button" className="flex items-center gap-1.5 text-sm text-primary hover:underline" onClick={() => { const next = new URLSearchParams(params); next.set('post', detail.remixParentTaskId || ''); setParams(next); setDetail(null) }}>
                    <Repeat2 className="h-4 w-4" /> Remix dari {detail.remixParentCreator || 'karya komunitas'}
                  </button>
                )}
                {detail.showPrompt ? (
                  <div className={`rounded-xl border border-border bg-muted/25 p-3 text-sm leading-6 ${blur ? 'blur-sm' : ''}`}>{detail.prompt}</div>
                ) : (
                  <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/25 p-3 text-sm text-muted-foreground"><LockKeyhole className="h-4 w-4" />Prompt disembunyikan oleh kreator.</div>
                )}
                {Boolean(detail?.tags?.length) && <div className="flex flex-wrap gap-1">{detail.tags!.map(tag => <Badge key={tag} variant="outline">#{tag}</Badge>)}</div>}
                {detail.remixCount > 0 && <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><Repeat2 className="h-4 w-4" />Sudah dibuat {detail.remixCount} remix dari karya ini.</p>}
                {detail.allowRemix && !detail.canRemix && <p className="text-xs text-muted-foreground">Model karya ini belum mendukung gambar reference.</p>}
              </div>
            </div>
          </div>
          <div className="flex-shrink-0 border-t bg-card p-4 flex items-center gap-2 flex-wrap">
            <div className="flex gap-2 flex-1">
              {detail.allowPromptCopy && <Button variant="outline" onClick={() => copy(detail.prompt)} className="min-h-[44px]"><Copy className="h-4 w-4" />{copied ? 'Tersalin' : 'Salin prompt'}</Button>}
              {detail.showPrompt && <Button variant="outline" onClick={() => inspire(detail)} className="min-h-[44px]"><Sparkles className="h-4 w-4" />Inspirasi</Button>}
              {detail.canRemix && <Button onClick={() => remix(detail)} className="min-h-[44px]"><Repeat2 className="h-4 w-4" />Remix</Button>}
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" onClick={() => toggleInteraction(detail, 'like')} className={detail.liked ? 'text-primary' : ''} title="Suka"><Heart className={`h-4 w-4 ${detail.liked ? 'fill-current' : ''}`} /></Button>
              <Button variant="ghost" size="icon" onClick={() => toggleInteraction(detail, 'save')} className={detail.saved ? 'text-primary' : ''} title="Simpan"><Bookmark className={`h-4 w-4 ${detail.saved ? 'fill-current' : ''}`} /></Button>
              <Button variant="ghost" size="icon" onClick={() => sharePost(detail)} title="Bagikan"><Share2 className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" onClick={() => reportPost(detail)} title="Laporkan"><Flag className="h-4 w-4" /></Button>
            </div>
          </div>
        </div>
        , document.body)}
    </Layout>
  );
}
