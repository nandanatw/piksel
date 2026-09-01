import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        element: HTMLElement,
        options: Record<string, unknown>,
      ) => string;
      remove: (widgetId: string) => void;
    };
  }
}

export function CloudflareTurnstile({
  siteKey,
  onToken,
}: {
  siteKey: string;
  onToken: (token: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<string | null>(null);

  useEffect(() => {
    let disposed = false;
    const renderWidget = () => {
      if (
        disposed ||
        !containerRef.current ||
        !window.turnstile ||
        widgetRef.current
      )
        return;
      widgetRef.current = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        theme: "auto",
        callback: (token: string) => onToken(token),
        "expired-callback": () => onToken(""),
        "error-callback": () => onToken(""),
      });
    };
    let script = document.querySelector<HTMLScriptElement>(
      'script[data-Piksel-turnstile="true"]',
    );
    if (!script) {
      script = document.createElement("script");
      script.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.dataset.PikselTurnstile = "true";
      document.head.appendChild(script);
    }
    script.addEventListener("load", renderWidget);
    renderWidget();
    return () => {
      disposed = true;
      script?.removeEventListener("load", renderWidget);
      if (widgetRef.current && window.turnstile)
        window.turnstile.remove(widgetRef.current);
      widgetRef.current = null;
    };
  }, [siteKey, onToken]);

  return (
    <div ref={containerRef} className="flex min-h-[65px] justify-center" />
  );
}
