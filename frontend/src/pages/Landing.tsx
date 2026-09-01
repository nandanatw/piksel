import {
  ArrowRight,
  ChevronDown,
  Image as ImageIcon,
  Layers3,
  LoaderCircle,
  Menu,
  Play,
  Sparkles,
  WandSparkles,
  X,
} from "lucide-react";
import { useState } from "react";
import ThemeToggle from "../components/ThemeToggle";
import portrait from "../assets/showcase-portrait.jpg";
import perfume from "../assets/showcase-perfume.jpg";
import interior from "../assets/showcase-interior.jpg";
import food from "../assets/showcase-food.jpg";
import travel from "../assets/showcase-travel.jpg";
import automotive from "../assets/showcase-automotive.jpg";
import fantasy from "../assets/showcase-fantasy.jpg";
import skincare from "../assets/showcase-skincare.jpg";

const appUrl = "https://app.kreasya.click";

const models = [
  { name: "Seedream 5.0 Pro", detail: "Reference images · 1K / 2K" },
  { name: "Seedream 5.0 Lite", detail: "Reference images · 2K / 3K / 4K" },
  { name: "Midjourney V7", detail: "Creative image generation" },
  { name: "Midjourney V8.1", detail: "Creative image generation" },
  { name: "Midjourney V8.2", detail: "Creative image generation" },
  { name: "GPT Image 2", detail: "Image generation · 1K / 2K / 4K" },
  { name: "Grok Image", detail: "Image generation · 1K / 2K" },
  { name: "Grok Image Quality", detail: "Image generation · 1K / 2K" },
  { name: "Nano Banana Pro", detail: "Reference images · 1K / 2K / 4K" },
  { name: "Nano Banana 2", detail: "Reference images · 1K / 2K / 4K" },
];

const results = [
  {
    image: portrait,
    category: "Fashion",
    title: "Editorial Nusantara",
    prompt: "Portrait editorial sinematik dengan tekstur tenun modern",
  },
  {
    image: perfume,
    category: "Produk",
    title: "Amber Nocturne",
    prompt: "Foto produk parfum premium dengan cahaya amber",
  },
  {
    image: interior,
    category: "Interior",
    title: "Tropical Quiet",
    prompt: "Ruang tropis modern Bali saat golden hour",
  },
  {
    image: food,
    category: "Kuliner",
    title: "Rasa Indonesia",
    prompt: "Fine dining Indonesia yang hangat dan menggugah selera",
  },
  {
    image: travel,
    category: "Travel",
    title: "Hidden Lagoon",
    prompt: "Laguna tersembunyi Indonesia dari udara saat sunrise",
  },
  {
    image: automotive,
    category: "Otomotif",
    title: "Electric Horizon",
    prompt: "Mobil grand touring futuristik di jalan vulkanik",
  },
  {
    image: fantasy,
    category: "Ilustrasi",
    title: "Penjaga Rimba",
    prompt: "Kisah fantasi folklore di candi hutan yang terlupakan",
  },
  {
    image: skincare,
    category: "Branding",
    title: "Botanical Ritual",
    prompt: "Kampanye skincare botani dengan kemasan natural",
  },
];

const features = [
  {
    icon: WandSparkles,
    image: portrait,
    title: "Mulai dari satu kalimat",
    text: "Tulis ide seadanya. Kreasya membantu mengubahnya menjadi visual yang siap dipamerkan.",
  },
  {
    icon: ImageIcon,
    image: skincare,
    title: "Arahkan dengan referensi",
    text: "Upload gambar favoritmu untuk menjaga mood, komposisi, dan karakter tetap konsisten.",
  },
  {
    icon: Layers3,
    image: fantasy,
    title: "Eksplor berbagai gaya",
    text: "Coba beragam model dan gaya sampai menemukan hasil yang benar-benar terasa milikmu.",
  },
];

export default function Landing() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <main className="landing-page min-h-screen overflow-x-hidden selection:bg-[#87e8ed] selection:text-[#07191d]">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-0 h-[680px] bg-[radial-gradient(circle_at_74%_10%,rgba(36,169,181,.2),transparent_32%),radial-gradient(circle_at_15%_16%,rgba(255,144,88,.08),transparent_25%)]" />
      <div className="relative z-10 mx-auto max-w-[1240px] px-5 sm:px-8">
        <nav className="landing-border flex h-20 items-center justify-between border-b">
          <a
            href="#top"
            className="flex items-center gap-2.5 text-lg font-semibold tracking-tight"
          >
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-[#f0c1a4] via-[#70d9de] to-[#168895] shadow-[0_0_28px_rgba(54,209,220,.24)]">
              <Sparkles className="h-4 w-4 text-[#082126]" />
            </span>
            kreasya<span className="text-[#67e8f9]">.</span>
          </a>
          <div className="landing-muted hidden items-center gap-8 text-sm md:flex">
            <a className="landing-hover transition" href="#results">
              Hasil
            </a>
            <a className="landing-hover transition" href="#how-it-works">
              Cara kerja
            </a>
            <a className="landing-hover transition" href="#features">
              Fitur
            </a>
            <a className="landing-hover transition" href="#pricing">
              Harga
            </a>
          </div>
          <div className="flex items-center gap-1 md:gap-3">
            <ThemeToggle />
            <a
              href={appUrl}
              className="landing-muted landing-hover hidden rounded-full px-4 py-2 text-sm transition hover:bg-[var(--landing-surface)] md:block"
            >
              Masuk
            </a>
            <a
              href={appUrl}
              className="landing-primary-button hidden rounded-full px-5 py-2.5 text-sm font-medium transition md:block"
            >
              Mulai gratis <ArrowRight className="ml-1 inline h-3.5 w-3.5" />
            </a>
            <button
              className="rounded-lg p-2 md:hidden"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Buka menu"
            >
              {menuOpen ? <X /> : <Menu />}
            </button>
          </div>
        </nav>
        {menuOpen && (
          <div className="landing-border landing-muted flex flex-col gap-4 border-b py-5 text-sm md:hidden">
            <a href="#results" onClick={() => setMenuOpen(false)}>
              Hasil
            </a>
            <a href="#how-it-works" onClick={() => setMenuOpen(false)}>
              Cara kerja
            </a>
            <a href="#features" onClick={() => setMenuOpen(false)}>
              Fitur
            </a>
            <a href="#pricing" onClick={() => setMenuOpen(false)}>
              Harga
            </a>
            <a href={appUrl}>Mulai gratis</a>
          </div>
        )}

        <section
          id="top"
          className="grid items-center gap-12 py-16 sm:py-24 lg:grid-cols-[.88fr_1.12fr] lg:gap-6 lg:py-28"
        >
          <div className="relative z-10 max-w-xl">
            <div className="landing-pill mb-7 inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-medium text-[var(--landing-accent)] shadow-inner">
              <span className="h-1.5 w-1.5 rounded-full bg-[#36d1dc] shadow-[0_0_10px_#36d1dc]" />{" "}
              AI creative studio untuk ide yang lebih berani
            </div>
            <h1 className="text-5xl font-semibold leading-[.98] tracking-[-.055em] sm:text-7xl">
              Bayangkan.
              <br />
              <span className="bg-gradient-to-r from-[#f4c4a9] via-[#8ae3e7] to-[#36d1dc] bg-clip-text text-transparent">
                Lalu wujudkan.
              </span>
            </h1>
            <p className="landing-muted mt-7 max-w-md text-base leading-7 sm:text-lg">
              Dari satu kalimat menjadi visual yang layak dijual, dipamerkan,
              dan dibagikan. Tanpa proses desain yang rumit.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <a
                href={appUrl}
                className="landing-primary-button rounded-full px-6 py-3.5 text-sm font-semibold shadow-lg transition hover:-translate-y-0.5"
              >
                Coba Kreasya gratis{" "}
                <ArrowRight className="ml-1.5 inline h-4 w-4" />
              </a>
              <a
                href="#results"
                className="landing-muted landing-hover group flex items-center gap-2 text-sm font-medium transition"
              >
                <span className="landing-pill grid h-9 w-9 place-items-center rounded-full border transition">
                  <Play className="ml-0.5 h-3.5 w-3.5 fill-current" />
                </span>{" "}
                Lihat hasil nyata
              </a>
            </div>
            <div className="landing-muted mt-12 flex flex-wrap items-center gap-2 text-xs">
              <span className="landing-subtle mr-1">Model tersedia:</span>
              {[
                "Seedream 5.0",
                "Midjourney V8.2",
                "GPT Image 2",
                "Nano Banana 2",
              ].map((name) => (
                <span
                  key={name}
                  className="landing-pill rounded-full border px-2.5 py-1.5"
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
          <div
            id="showcase"
            className="relative flex justify-center lg:-mr-16 lg:justify-end"
          >
            <div className="absolute -inset-10 rounded-full bg-[#2696a0]/20 blur-3xl" />
            <div className="phone-demo-frame">
              <div className="phone-demo-notch" />
              <div className="phone-demo-screen">
                <div className="flex items-center justify-between px-5 pt-4 text-[10px] text-white/60">
                  <span>9:41</span>
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-3 rounded-[2px] border border-white/50" />
                    <span className="h-2 w-2 rounded-full bg-white/70" />
                  </span>
                </div>
                <div className="phone-demo-result phone-demo-result-stack">
                  {[portrait, perfume, travel].map((image, index) => (
                    <img
                      key={image}
                      src={image}
                      alt="Contoh hasil generate Kreasya"
                      style={{ animationDelay: `${index * 7}s` }}
                    />
                  ))}
                </div>
                <div className="phone-demo-generating">
                  <div className="phone-demo-loader">
                    <LoaderCircle className="h-7 w-7 animate-spin text-[#8ae3e7]" />
                  </div>
                  <p className="mt-4 text-sm font-medium">Mewujudkan idemu</p>
                  <p className="mt-1 text-[11px] text-white/45">
                    Detail, cahaya, dan komposisi sedang disiapkan…
                  </p>
                  <div className="mx-auto mt-5 h-1 w-36 overflow-hidden rounded-full bg-white/10">
                    <div className="phone-demo-progress h-full rounded-full bg-gradient-to-r from-[#f1b5a0] to-[#36d1dc]" />
                  </div>
                </div>
                <div className="phone-demo-prompt">
                  <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[.16em] text-[#8ae3e7]">
                    <Sparkles className="h-3 w-3" /> Prompt
                  </div>
                  <p className="line-clamp-2 text-xs leading-5 text-white/75">
                    Potret editorial sinematik, warm amber light, detail
                    realistis
                  </p>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-[10px] text-white/35">Kreasya</span>
                    <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] text-white/55">
                      1 gambar
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          id="results"
          className="landing-border border-t py-24 sm:py-32"
        >
          <div className="mb-10 flex flex-col gap-5 sm:mb-14 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
              <p className="mb-4 text-xs font-semibold uppercase tracking-[.22em] text-[var(--landing-accent)]">
                Dibuat dengan Kreasya
              </p>
              <h2 className="text-3xl font-semibold tracking-[-.04em] sm:text-5xl">
                Satu Composer.
                <br />
                <span className="landing-subtle">Banyak kemungkinan.</span>
              </h2>
            </div>
            <p className="landing-muted max-w-sm text-sm leading-6">
              Delapan contoh visual dari kategori berbeda—ditampilkan untuk
              menunjukkan rentang hasil yang bisa kamu eksplorasi.
            </p>
          </div>
          <div className="grid auto-rows-[180px] grid-flow-dense grid-cols-2 gap-2.5 sm:auto-rows-[230px] sm:gap-3 lg:grid-cols-4">
            {results.map((result, index) => (
              <article
                key={result.title}
                className={`group relative min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[.03] text-white ${index === 0 ? "col-span-2 row-span-2" : index === 2 || index === 4 || index === 6 ? "row-span-2" : ""}`}
              >
                <img
                  src={result.image}
                  alt={`${result.category}: ${result.title}`}
                  loading={index < 2 ? "eager" : "lazy"}
                  className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.035]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/5 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-3.5 sm:p-5">
                  <span className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#8ae3e7]">
                    {result.category}
                  </span>
                  <h3 className="mt-1 text-sm font-medium sm:text-base">
                    {result.title}
                  </h3>
                  <p className="mt-1 line-clamp-2 hidden text-xs leading-5 text-white/50 sm:block">
                    {result.prompt}
                  </p>
                </div>
              </article>
            ))}
          </div>
          <div className="mt-8 text-center">
            <a
              href={appUrl}
              className="landing-pill landing-hover inline-flex items-center rounded-full border px-5 py-3 text-sm font-medium transition hover:border-[#36d1dc]/50"
            >
              Buat versimu sendiri <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </div>
        </section>

        <section className="landing-border border-y py-8">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.22em] text-[var(--landing-accent)]">
                Model yang dipakai
              </p>
              <p className="landing-muted mt-2 text-sm">
                Pilih engine sesuai gaya dan kebutuhan visualmu.
              </p>
            </div>
            <a
              href={appUrl}
              className="landing-muted landing-hover hidden text-xs sm:block"
            >
              Lihat di Composer <ArrowRight className="ml-1 inline h-3 w-3" />
            </a>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {models.map((item) => (
              <div
                key={item.name}
                className="landing-surface rounded-xl border px-3 py-3"
              >
                <p className="text-xs font-medium">{item.name}</p>
                <p className="landing-subtle mt-1 text-[10px] leading-4">
                  {item.detail}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section id="features" className="py-24 sm:py-32">
          <div className="max-w-lg">
            <p className="mb-4 text-xs font-semibold uppercase tracking-[.22em] text-[var(--landing-accent)]">
              Satu ruang untuk semua ide
            </p>
            <h2 className="text-3xl font-semibold tracking-[-.04em] sm:text-5xl">
              Dari “gimana ya?”
              <br />
              ke “ini dia.”
            </h2>
          </div>
          <div className="mt-14 grid gap-3 md:grid-cols-3">
            {features.map(({ icon: Icon, image, title, text }, index) => (
              <article
                className="landing-feature-card group overflow-hidden rounded-3xl border"
                key={title}
              >
                <div className="relative h-52 overflow-hidden">
                  <img
                    src={image}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
                  />
                  <div className="landing-feature-gradient absolute inset-0" />
                  <span className="absolute left-5 top-5 grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-black/35 text-[#8ae3e7] backdrop-blur">
                    <Icon className="h-5 w-5" />
                  </span>
                </div>
                <div className="p-6 sm:p-7">
                  <div className="landing-subtle mb-4 text-xs">
                    0{index + 1}
                  </div>
                  <h3 className="text-lg font-medium">{title}</h3>
                  <p className="landing-muted mt-3 text-sm leading-6">{text}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section
          id="how-it-works"
          className="landing-border grid gap-12 border-t py-24 sm:py-32 lg:grid-cols-[.8fr_1.2fr] lg:items-center"
        >
          <div>
            <p className="mb-4 text-xs font-semibold uppercase tracking-[.22em] text-[var(--landing-accent)]">
              Cara kerja
            </p>
            <h2 className="text-3xl font-semibold tracking-[-.04em] sm:text-5xl">
              Kamu bawa idenya.
              <br />
              <span className="landing-subtle">Kami bantu wujudkan.</span>
            </h2>
            <p className="landing-muted mt-6 max-w-sm text-sm leading-6">
              Tidak perlu jago prompt atau desain. Pilih arah visual, tambahkan
              referensi bila perlu, lalu biarkan Composer mengerjakannya.
            </p>
            <div className="mt-8 flex -space-x-3">
              {[food, automotive, interior].map((image, index) => (
                <img
                  key={image}
                  src={image}
                  alt="Contoh hasil Kreasya"
                  loading="lazy"
                  className="landing-avatar h-14 w-14 rounded-full border-2 object-cover"
                  style={{ zIndex: 3 - index }}
                />
              ))}
              <span className="landing-subtle ml-5 self-center text-xs">
                Hasil nyata, siap dipakai
              </span>
            </div>
          </div>
          <div className="grid gap-3">
            {[
              "Tulis ide atau upload gambar referensi",
              "Pilih model, rasio, dan jumlah hasil",
              "Simpan, bagikan, atau buat variasi baru",
            ].map((step, index) => (
              <div
                className="landing-surface flex items-center gap-5 rounded-2xl border p-5 transition hover:border-[#36d1dc]/40"
                key={step}
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#36d1dc]/30 text-sm text-[var(--landing-accent)]">
                  0{index + 1}
                </span>
                <span className="text-sm">{step}</span>
                <ChevronDown className="landing-subtle ml-auto h-4 w-4 -rotate-90" />
              </div>
            ))}
          </div>
        </section>

        <section
          id="pricing"
          className="relative mb-24 overflow-hidden rounded-[2rem] border border-[#36d1dc]/20 bg-[#11161a] p-8 text-white sm:p-14"
        >
          <img
            src={perfume}
            alt="Contoh visual produk Kreasya"
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover object-center opacity-25"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#101017] via-[#101017]/90 to-[#101017]/25" />
          <div className="relative max-w-2xl">
            <p className="mb-4 text-xs font-semibold uppercase tracking-[.22em] text-[#8ae3e7]">
              Siap bikin sesuatu?
            </p>
            <h2 className="text-3xl font-semibold tracking-[-.04em] sm:text-5xl">
              Visual terbaikmu
              <br />
              dimulai dari satu ide.
            </h2>
            <p className="mt-5 max-w-md text-sm leading-6 text-white/55">
              Masuk ke Composer untuk melihat model, rasio, resolusi, dan biaya
              yang tersedia secara real-time.
            </p>
            <a
              href={appUrl}
              className="mt-8 inline-flex items-center rounded-full bg-white px-6 py-3.5 text-sm font-semibold text-[#18151d] transition hover:bg-[#d9fbfc]"
            >
              Buka Composer <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </div>
        </section>

        <footer className="landing-border landing-subtle flex flex-col gap-5 border-t py-8 text-xs sm:flex-row sm:items-center sm:justify-between">
          <span className="landing-muted font-medium">kreasya.</span>
          <span>© 2026 Kreasya. Made for curious minds.</span>
          <div className="flex gap-5">
            <a href={appUrl} className="landing-hover">
              Masuk
            </a>
            <a href={`${appUrl}/help`} className="landing-hover">
              Bantuan
            </a>
          </div>
        </footer>
      </div>
    </main>
  );
}
