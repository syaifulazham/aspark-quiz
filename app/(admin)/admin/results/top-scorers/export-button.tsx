"use client";

import { useState } from "react";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function ExportButton({ sessionId, countries }: { sessionId: string; countries: string[] }) {
  const [loading, setLoading] = useState(false);

  async function download() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ session: sessionId });
      if (countries.length) params.set("countries", countries.join(","));
      const res = await fetch(`/api/internal/exports/top-scorers?${params}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Export failed (${res.status})`);
      }
      const blob = await res.blob();
      const name =
        /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "top-scorers.xlsx";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Results downloaded");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button onClick={download} disabled={loading} variant="outline" className="gap-2">
      {loading ? <Loader2 className="animate-spin" /> : <FileSpreadsheet className="text-[var(--color-success-500)]" />}
      {loading ? "Preparing…" : "Download results (.xlsx)"}
    </Button>
  );
}
