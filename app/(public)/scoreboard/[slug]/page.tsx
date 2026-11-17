import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { accessCookieName, hasAccess } from "@/lib/scoreboard/access";
import { availability, loadPublicScoreboard, loadScoreboardBySlug } from "@/lib/scoreboard/data";
import { CenterCard, Stage } from "./shell";
import { PasscodeGate } from "./passcode-gate";
import { ScoreboardView } from "./scoreboard-view";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const board = await loadScoreboardBySlug((await params).slug);
  return {
    title: board && board.is_active ? `${board.title} · Scoreboard` : "Scoreboard",
    robots: { index: false, follow: false },
  };
}

export default async function PublicScoreboardPage({ params }: Props) {
  const { slug } = await params;
  const board = await loadScoreboardBySlug(slug);
  if (!board) notFound();

  const state = availability(board);
  if (state === "inactive") notFound();

  if (state === "not_open") {
    return (
      <Stage>
        <CenterCard title={board.title}>
          <p className="mt-4 text-sm text-white/60">This scoreboard opens on</p>
          <p className="mt-1 font-mono text-lg text-teal-200">
            {new Date(board.opens_at!).toLocaleString("en-GB", { dateStyle: "full", timeStyle: "short", timeZone: "UTC" })} UTC
          </p>
        </CenterCard>
      </Stage>
    );
  }
  if (state === "closed") {
    return (
      <Stage>
        <CenterCard title={board.title}>
          <p className="mt-4 text-sm text-white/60">This scoreboard is no longer available.</p>
        </CenterCard>
      </Stage>
    );
  }

  const cookieStore = await cookies();
  if (!hasAccess(board.id, board.passcode_hash, cookieStore.get(accessCookieName(board.id))?.value)) {
    return (
      <Stage>
        <PasscodeGate slug={board.slug} title={board.title} />
      </Stage>
    );
  }

  const data = await loadPublicScoreboard(board);
  return (
    <Stage>
      <ScoreboardView slug={board.slug} initial={data} />
    </Stage>
  );
}
