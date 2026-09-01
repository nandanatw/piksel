import { useEffect, useState } from "react";
import ImageDetailModal from "../components/ImageDetailModal";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Images,
  Lock,
  Globe2,
  Search,
  Check,
  Trash2,
  Download,
  Maximize2,
  Flag,
  SlidersHorizontal,
} from "lucide-react";
import { AdminLayout } from "../components/Layout";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Select } from "../components/ui/select";
import { brokenImg } from "../lib/utils";
import { MobileFilterSheet } from "../components/MobileFilterSheet";

interface ReferenceImage {
  url: string;
  thumbnailUrl?: string;
  name?: string;
  mime?: string;
  mimeType?: string;
  bytes?: number;
  size?: number;
  position?: number;
  deletedAt?: string | null;
  deletedBy?: string | null;
}

interface GalleryResult {
  id?: string | number;
  taskId: string;
  url: string;
  thumbnailUrl?: string;
  ownerEmail?: string;
  email?: string;
  prompt?: string;
  model?: string;
  ratio?: string;
  resolution?: string;
  cost?: number;
  estimatedCredit?: number;
  timestamp?: string;
  createdAt?: string;
  isPublic?: boolean;
  deletedAt?: string | null;
  deletedBy?: string | null;
  ownerDeletedAt?: string | null;
  width?: number;
  height?: number;
  fileSize?: number;
  format?: string;
  reportCount?: number;
  references?: ReferenceImage[];
  referenceImages?: ReferenceImage[];
}

interface GalleryResponse {
  results?: GalleryResult[];
  items?: GalleryResult[];
  data?: GalleryResult[];
  page?: number;
  pages?: number;
  totalPages?: number;
  total?: number;
  limit?: number;
}

const LIMIT = 24;

function formatBytes(bytes?: number) {
  if (bytes == null) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

export default function AdminGallery() {
  const gridCols: Record<number, string> = {
    2: 'grid-cols-2 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2',
    3: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-3',
    4: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-4',
    5: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-5',
    6: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6',
  }
  const [response, setResponse] = useState<GalleryResponse>({});
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [columns, setColumns] = useState(() => Number(localStorage.getItem('adminGalleryColumns') || 5));
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [blur, setBlur] = useState(
    () => localStorage.getItem("admin_gallery_blur") !== "false",
  );

  // Filters
  const [query, setQuery] = useState("");
  const [email, setEmail] = useState("");
  const [model, setModel] = useState("");
  const [visibility, setVisibility] = useState("");
  const [deletion, setDeletion] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [filterOpen, setFilterOpen] = useState(false);
  const [draftEmail, setDraftEmail] = useState(email);
  const [draftModel, setDraftModel] = useState(model);
  const [draftVisibility, setDraftVisibility] = useState(visibility);
  const [draftDeletion, setDraftDeletion] = useState(deletion);
  const [draftSortBy, setDraftSortBy] = useState(sortBy);
  const [draftBlur, setDraftBlur] = useState(blur);

  // Selection
  const [selected, setSelected] = useState<string[]>([]);

  // Preview modal
  const [previewResult, setPreviewResult] = useState<GalleryResult | null>(
    null,
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setError("");

      const params = new URLSearchParams({
        page: String(page),
        limit: String(LIMIT),
      });
      if (query) params.set("q", query);
      if (email) params.set("email", email);
      if (model) params.set("model", model);
      if (visibility) params.set("visibility", visibility);
      if (deletion) params.set("deletion", deletion);
      if (sortBy) params.set("sort", sortBy);

      fetch(`/api/admin/gallery?${params}`, {
        credentials: "include",
        signal: controller.signal,
      })
        .then(async (res) => {
          if (!res.ok)
            throw new Error(
              (await res.json().catch(() => ({}))).error ||
                "Failed to load gallery",
            );
          return res.json();
        })
        .then((data) =>
          setResponse(Array.isArray(data) ? { results: data } : data),
        )
        .catch((error) => {
          if (error.name !== "AbortError") setError(error.message);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [page, query, email, model, visibility, deletion, sortBy]);

  useEffect(() => {
    const handler = () => setPreviewResult(null)
    window.addEventListener('popstate', handler)
    return () => window.removeEventListener('popstate', handler)
  }, [])

  const results = response.results ?? response.items ?? response.data ?? [];
  const totalPages =
    response.totalPages ??
    response.pages ??
    Math.max(
      1,
      Math.ceil((response.total ?? results.length) / (response.limit ?? LIMIT)),
    );

  const modelOptions = [
    ...new Set(results.map((r) => r.model).filter(Boolean)),
  ];
  const activeFilterCount =
    Number(Boolean(email)) +
    Number(Boolean(model)) +
    Number(Boolean(visibility)) +
    Number(Boolean(deletion)) +
    Number(sortBy !== "newest") +
    Number(!blur);

  function toggleBlur() {
    setBlur((current) => {
      localStorage.setItem("admin_gallery_blur", String(!current));
      return !current;
    });
  }

  function openFilters() {
    setDraftEmail(email);
    setDraftModel(model);
    setDraftVisibility(visibility);
    setDraftDeletion(deletion);
    setDraftSortBy(sortBy);
    setDraftBlur(blur);
    setFilterOpen(true);
  }

  function resetFilterDraft() {
    setDraftEmail("");
    setDraftModel("");
    setDraftVisibility("");
    setDraftDeletion("");
    setDraftSortBy("newest");
    setDraftBlur(true);
  }

  function applyMobileFilters() {
    setEmail(draftEmail);
    setModel(draftModel);
    setVisibility(draftVisibility);
    setDeletion(draftDeletion);
    setSortBy(draftSortBy);
    setBlur(draftBlur);
    localStorage.setItem("admin_gallery_blur", String(draftBlur));
    setPage(1);
    setFilterOpen(false);
  }

  function toggleSelection(taskId: string) {
    setSelected((prev) =>
      prev.includes(taskId)
        ? prev.filter((id) => id !== taskId)
        : [...prev, taskId],
    );
  }

  function selectAll() {
    if (selected.length === results.length) {
      setSelected([]);
    } else {
      setSelected(results.map((r) => String(r.taskId)));
    }
  }

  async function bulkAction(action: "delete" | "setPublic" | "setPrivate") {
    if (!selected.length) return;
    if (action === "delete" && !confirm(`Delete ${selected.length} images?`))
      return;

    setError("");
    setFeedback("");

    try {
      const res = await fetch("/api/admin/gallery/bulk", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskIds: selected, action }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Bulk action failed");

      setFeedback(
        `Successfully ${action === "delete" ? "deleted" : "updated"} ${selected.length} images`,
      );
      setSelected([]);

      // Refresh gallery
      setPage(1);
      setTimeout(() => window.location.reload(), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bulk action failed");
    }
  }

  async function exportGallery() {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (email) params.set("email", email);
    if (model) params.set("model", model);
    if (visibility) params.set("visibility", visibility);
    if (deletion) params.set("deletion", deletion);

    window.location.href = `/api/admin/gallery/export?${params}`;
  }


  function openPreview(result: GalleryResult) {
    setPreviewResult(result);
    window.history.pushState({ adminGalleryDetail: true }, '');
  }


  function closePreview() {
    setPreviewResult(null);
    if (window.history.state?.adminGalleryDetail) window.history.back();
  }

  return (
    <AdminLayout>
      <div className="space-y-6 p-3 sm:p-6">
        <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-medium text-primary">Content overview</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
              Global gallery
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Review generated results and their uploaded reference images
              across all accounts.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportGallery}>
              <Download className="h-3.5 w-3.5" />
              Export
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={toggleBlur}
              className="hidden md:inline-flex"
            >
              {blur ? (
                <EyeOff className="h-3.5 w-3.5" />
              ) : (
                <Eye className="h-3.5 w-3.5" />
              )}
              {blur ? "Blur on" : "Blur off"}
            </Button>
            <Select value={String(columns)} onChange={e => { const v = Number(e.target.value); setColumns(v); localStorage.setItem('adminGalleryColumns', String(v)) }} className="hidden w-20 md:inline-flex">
              <option value="2">2 col</option>
              <option value="3">3 col</option>
              <option value="4">4 col</option>
              <option value="5">5 col</option>
              <option value="6">6 col</option>
            </Select>
          </div>
        </header>

        {/* Filters */}
        <Card className="border-border">
          <CardContent className="flex gap-2 p-3 md:hidden">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cari prompt..."
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
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
          <CardContent className="hidden gap-3 p-4 md:grid md:grid-cols-2 lg:grid-cols-6">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search prompts..."
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                className="pl-9"
              />
            </div>
            <Input
              placeholder="Filter by email..."
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setPage(1);
              }}
            />
            <Select
              value={model}
              onChange={(e) => {
                setModel(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All models</option>
              {modelOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
            <Select
              value={visibility}
              onChange={(e) => {
                setVisibility(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All visibility</option>
              <option value="public">Public only</option>
              <option value="private">Private only</option>
              <option value="reported">Reported posts</option>
            </Select>
            <Select
              value={deletion}
              onChange={(e) => {
                setDeletion(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All deletion states</option>
              <option value="active">Active only</option>
              <option value="deleted">User-deleted only</option>
            </Select>
            <Select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="cost-high">Cost: High→Low</option>
              <option value="cost-low">Cost: Low→High</option>
              <option value="user">By user (A-Z)</option>
            </Select>
          </CardContent>
        </Card>
        <MobileFilterSheet
          open={filterOpen}
          title="Filter Admin Gallery"
          onClose={() => setFilterOpen(false)}
          onReset={resetFilterDraft}
          onApply={applyMobileFilters}
        >
          <label className="block space-y-2 text-sm font-medium">
            <span>Email pengguna</span>
            <Input
              value={draftEmail}
              onChange={(e) => setDraftEmail(e.target.value)}
              placeholder="nama@email.com"
            />
          </label>
          <label className="block space-y-2 text-sm font-medium">
            <span>Model</span>
            <Select
              value={draftModel}
              onChange={(e) => setDraftModel(e.target.value)}
              className="w-full"
            >
              <option value="">Semua model</option>
              {modelOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
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
              <option value="">Semua visibilitas</option>
              <option value="public">Publik saja</option>
              <option value="private">Private saja</option>
              <option value="reported">Post dilaporkan</option>
            </Select>
          </label>
          <label className="block space-y-2 text-sm font-medium">
            <span>Status penghapusan</span>
            <Select
              value={draftDeletion}
              onChange={(e) => setDraftDeletion(e.target.value)}
              className="w-full"
            >
              <option value="">Semua status</option>
              <option value="active">Aktif saja</option>
              <option value="deleted">Dihapus user</option>
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
              <option value="user">Pengguna A–Z</option>
            </Select>
          </label>
          <label className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-border p-3 text-sm">
            <span>
              <span className="block font-medium">Blur gambar</span>
              <span className="text-xs text-muted-foreground">
                Samarkan konten saat meninjau.
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

        {/* Bulk actions toolbar */}
        {selected.length > 0 && (
          <div className="sticky top-20 z-30 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur">
            <Badge variant="default">{selected.length} selected</Badge>
            <Button
              size="sm"
              variant="outline"
              onClick={() => bulkAction("setPublic")}
            >
              <Globe2 className="h-3.5 w-3.5" />
              Public
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => bulkAction("setPrivate")}
            >
              <Lock className="h-3.5 w-3.5" />
              Private
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => bulkAction("delete")}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
              Clear
            </Button>
          </div>
        )}

        {(error || feedback) && (
          <Card
            className={error ? "border-destructive/30" : "border-primary/30"}
          >
            <CardContent
              className={`p-4 text-sm ${error ? "text-destructive-foreground" : "text-foreground"}`}
            >
              {error || feedback}
            </CardContent>
          </Card>
        )}

        {loading ? (
          <div className="grid min-h-64 place-items-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : results.length === 0 && !error ? (
          <Card className="border-dashed">
            <CardContent className="grid place-items-center gap-3 py-16 text-center">
              <Images className="h-10 w-10 text-muted-foreground" />
              <div>
                <p className="font-semibold">No gallery results</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  No generated images match your filters.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className={`grid gap-4 ${gridCols[columns] || gridCols[5]}`}>
            {results.map((result, index) => {
              const isSelected = selected.includes(String(result.taskId));

              return (
                <Card
                  key={result.taskId ?? result.id ?? index}
                  className="group overflow-hidden border-border/80 bg-card shadow-sm transition-all hover:shadow-lg hover:scale-[1.02]"
                >
                  <div
                    className="relative overflow-hidden bg-muted cursor-pointer"
                    onClick={() => openPreview(result)}
                  >
                    <img
                      src={result.thumbnailUrl || result.url}
                      alt={result.prompt || "Generated result"}
                      loading="lazy"
                      onError={(event) =>
                        (event.currentTarget.src = brokenImg())
                      }
                      className={`aspect-square w-full object-cover transition duration-300 ${blur ? "blur-xl scale-105" : "group-hover:scale-110"}`}
                    />
                    {blur && (
                      <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/10">
                        <EyeOff className="h-8 w-8 text-white/80" />
                      </div>
                    )}

                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Maximize2 className="h-8 w-8 text-white" />
                    </div>

                    {/* Selection checkbox */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSelection(String(result.taskId));
                      }}
                      className={`absolute left-2 top-2 grid h-6 w-6 place-items-center rounded-md border transition z-10 ${
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-white/40 bg-black/40 text-white hover:bg-black/60"
                      }`}
                    >
                      {isSelected && <Check className="h-3.5 w-3.5" />}
                    </button>

                    <Badge
                      variant="outline"
                      className={`absolute right-2 top-2 backdrop-blur text-[10px] px-1.5 py-0.5 ${result.isPublic ? "border-success/60 bg-success/15 text-success" : "border-border bg-card/90 text-foreground"}`}
                    >
                      {result.isPublic ? (
                        <Globe2 className="mr-1 h-2.5 w-2.5" />
                      ) : (
                        <Lock className="mr-1 h-2.5 w-2.5" />
                      )}
                      {result.isPublic ? "Public" : "Private"}
                    </Badge>
                    {Boolean(result.reportCount) && (
                      <Badge
                        variant="destructive"
                        className="absolute bottom-2 left-2 text-[10px]"
                      >
                        <Flag className="mr-1 h-2.5 w-2.5" />
                        {result.reportCount} report
                      </Badge>
                    )}
                    {result.deletedAt && (
                      <Badge
                        variant="destructive"
                        className="absolute bottom-2 right-2 text-[10px]"
                      >
                        User deleted
                      </Badge>
                    )}
                  </div>
                  <CardContent className="p-2">
                    <p
                      className="text-[11px] font-medium text-primary truncate"
                      title={result.ownerEmail ?? result.email}
                    >
                      {result.ownerEmail ?? result.email ?? "Unknown"}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-border/70 pt-5">
          <div className="flex items-center gap-3">
            <p className="text-xs text-muted-foreground">
              Page {page} of {totalPages}
              {response.total != null ? ` · ${response.total} total` : ""}
            </p>
            {results.length > 0 && (
              <Button size="sm" variant="ghost" onClick={selectAll}>
                {selected.length === results.length
                  ? "Deselect all"
                  : "Select all"}
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage((current) => current - 1)}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((current) => current + 1)}
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      <ImageDetailModal
        open={!!previewResult}
        isAdmin
        url={previewResult?.url || ''}
        prompt={previewResult?.prompt || ''}
        model={previewResult?.model}
        ratio={previewResult?.ratio}
        resolution={previewResult?.resolution}
        isPublic={previewResult?.isPublic}
        ownerEmail={previewResult?.ownerEmail ?? previewResult?.email}
        taskId={String(previewResult?.taskId || '')}
        blur={blur}
        metadata={previewResult ? [
          { label: 'Biaya', value: `${previewResult.cost ?? previewResult.estimatedCredit ?? '-'} cr` },
          { label: 'Dibuat', value: new Date(previewResult.timestamp ?? previewResult.createdAt ?? Date.now()).toLocaleString('id-ID') },
          { label: 'Dimensi', value: previewResult.width && previewResult.height ? `${previewResult.width}×${previewResult.height}` : '-' },
          { label: 'Format', value: previewResult.format || '-' },
          { label: 'Ukuran', value: previewResult.fileSize ? formatBytes(previewResult.fileSize) : '-' },
          { label: 'Task ID', value: String(previewResult.taskId).slice(0, 16) + '…' },
        ] : undefined}
        referenceImages={previewResult?.references ?? previewResult?.referenceImages}
        onClose={closePreview}
      />
    </AdminLayout>
  );
}
