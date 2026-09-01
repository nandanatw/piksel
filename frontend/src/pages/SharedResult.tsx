import { useEffect, useState } from "react";
import { Download, Image, ShieldCheck, Sparkles } from "lucide-react";
import { useParams } from "react-router-dom";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";

interface SharedData {
  imageUrl: string;
  downloadUrl?: string | null;
  allowDownload: boolean;
  expiresAt: string;
  timestamp: string;
}

export default function SharedResult() {
  const { token = "" } = useParams();
  const [data, setData] = useState<SharedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/shared/${encodeURIComponent(token)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Share unavailable");
        return body;
      })
      .then(setData)
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error ? cause.message : "Share unavailable",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [token]);

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-background p-4 text-foreground sm:p-8">
      <div className="pointer-events-none absolute -right-20 -top-24 h-80 w-80 rounded-full bg-primary/15 blur-3xl" />
      <div className="relative w-full max-w-5xl">
        <div className="mb-5 flex items-center justify-center gap-2">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10">
            <Sparkles className="h-5 w-5 text-primary" />
          </span>
          <div>
            <p className="font-semibold">Piksel</p>
            <p className="text-xs text-muted-foreground">Private image share</p>
          </div>
        </div>
        {loading ? (
          <div className="grid min-h-[50vh] place-items-center">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : error || !data ? (
          <Card className="mx-auto max-w-lg border-dashed">
            <CardContent className="py-16 text-center">
              <Image className="mx-auto h-10 w-10 text-muted-foreground" />
              <h1 className="mt-4 text-xl font-semibold">
                Link tidak tersedia
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Link mungkin sudah kedaluwarsa, dicabut pemilik, atau gambar
                telah dihapus.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="overflow-hidden border-border bg-card shadow-2xl">
            <CardContent className="p-3 sm:p-5">
              <img
                src={data.imageUrl}
                alt="Privately shared Piksel creation"
                className="max-h-[72vh] w-full rounded-xl bg-muted object-contain"
              />
              <div className="mt-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  <span>
                    Private link · expires{" "}
                    {new Date(data.expiresAt).toLocaleString("id-ID")}
                  </span>
                </div>
                {data.allowDownload && data.downloadUrl && (
                  <Button asChild>
                    <a href={data.downloadUrl} download>
                      <Download className="h-4 w-4" />
                      Download
                    </a>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
