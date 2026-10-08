"use client";

import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  backHref: string;
  title: string;
  summary: string;
  toggle: { href: string; label: string } | null;
  canPrint: boolean;
}

export function ReportToolbar({ backHref, title, summary, toggle, canPrint }: Props) {
  return (
    <div className="sticky top-0 z-10 border-b border-zinc-200 bg-white/95 backdrop-blur print:hidden">
      <div className="mx-auto flex max-w-[210mm] flex-wrap items-center gap-3 px-4 py-3">
        <Link href={backHref} className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2")}>
          <ArrowLeft />
          Live
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{title}</p>
          <p className="truncate text-xs text-zinc-500">{summary}</p>
        </div>
        {toggle && (
          <Link href={toggle.href} className={buttonVariants({ variant: "outline", size: "sm" })}>
            {toggle.label}
          </Link>
        )}
        <Button size="sm" onClick={() => window.print()} disabled={!canPrint}>
          <Printer />
          Print / Save as PDF
        </Button>
      </div>
    </div>
  );
}
