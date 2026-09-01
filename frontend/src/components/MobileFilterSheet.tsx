import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button } from "./ui/button";

interface MobileFilterSheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  onReset: () => void;
  onApply: () => void;
  children: ReactNode;
}

export function MobileFilterSheet({
  open,
  title,
  onClose,
  onReset,
  onApply,
  children,
}: MobileFilterSheetProps) {
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] md:hidden" role="presentation">
      <button
        type="button"
        aria-label="Tutup filter"
        className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-hidden rounded-t-3xl border border-b-0 border-border bg-card shadow-2xl"
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-muted-foreground/30" />
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-semibold">{title}</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Tutup filter"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="max-h-[calc(85dvh-8.5rem)] space-y-4 overflow-y-auto p-4">
          {children}
        </div>
        <div className="grid grid-cols-2 gap-3 border-t border-border bg-card p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Button variant="outline" className="min-h-11" onClick={onReset}>
            Reset
          </Button>
          <Button className="min-h-11" onClick={onApply}>
            Terapkan
          </Button>
        </div>
      </section>
    </div>
  );
}
