import ExcelJS from "exceljs";
import { createAdminClient } from "@/lib/supabase/admin";

const PAGE = 1000;

// Palette taken from the admin theme (globals.css)
const C = {
  navy: "FF141C2B",
  navySoft: "FF263247",
  brand: "FFC8372D",
  brandSoft: "FFFBEAE8",
  ink: "FF1F2633",
  muted: "FF6B7383",
  border: "FFD9DDE3",
  zebra: "FFF6F7F9",
  white: "FFFFFFFF",
  gold: "FFF9DE7C",
  silver: "FFE1E5EA",
  bronze: "FFEFC09A",
  green: "FF63BE7B",
  amber: "FFFFEB84",
  red: "FFF8696B",
};
const FONT = "Calibri";

interface Attempt {
  id: string;
  participant_id: string;
  quiz_version_id: string;
  raw_score: number | string | null;
  max_score: number | string | null;
  percentage: number | string | null;
  correct_count: number | null;
  incorrect_count: number | null;
  unanswered_count: number | null;
  duration_ms: number | null;
  started_at: string | null;
  submitted_at: string | null;
  participants: {
    personal_id: string;
    full_name: string;
    grade: string | null;
    school: string | null;
    nationality: string | null;
    gender: string | null;
  } | null;
}

interface Ranked {
  rank: number;
  name: string;
  personalId: string;
  grade: string | null;
  school: string | null;
  country: string | null;
  gender: string | null;
  raw: number;
  max: number;
  pct: number;
  correct: number | null;
  incorrect: number | null;
  unanswered: number | null;
  durationMs: number | null;
  startedAt: string | null;
  submittedAt: string | null;
  attempts: number;
}

const num = (v: number | string | null) => (v == null ? 0 : Number(v));

function better(a: Attempt, b: Attempt) {
  const d = num(b.raw_score) - num(a.raw_score);
  if (d !== 0) return d < 0;
  return (a.duration_ms ?? Number.MAX_SAFE_INTEGER) < (b.duration_ms ?? Number.MAX_SAFE_INTEGER);
}

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });
function countryName(code: string) {
  try {
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
}

function sheetName(label: string, used: Set<string>) {
  // Excel tab names: max 31 chars, no \ / ? * [ ] :, unique (case-insensitive)
  const base =
    label
      .replace(/\s*\(v\d+\)\s*$/i, "")
      .replace(/[\\/?*[\]:]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 31)
      .trim() || "Quiz";
  let name = base;
  for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base.slice(0, 28).trim()} ${i}`;
  used.add(name.toLowerCase());
  return name;
}

const toDate = (iso: string | null) => (iso ? new Date(iso) : null);
// Excel durations are fractions of a day
const toDuration = (ms: number | null) => (ms == null ? null : ms / 86_400_000);

function thinBorder(color = C.border): Partial<ExcelJS.Borders> {
  const side = { style: "thin" as const, color: { argb: color } };
  return { top: side, left: side, bottom: side, right: side };
}

function titleBlock(ws: ExcelJS.Worksheet, title: string, subtitle: string, width: number) {
  ws.mergeCells(1, 1, 1, width);
  const t = ws.getCell(1, 1);
  t.value = title;
  t.font = { name: FONT, size: 18, bold: true, color: { argb: C.white } };
  t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.navy } };
  t.alignment = { vertical: "middle", indent: 1 };
  ws.getRow(1).height = 34;

  ws.mergeCells(2, 1, 2, width);
  const s = ws.getCell(2, 1);
  s.value = subtitle;
  s.font = { name: FONT, size: 10, color: { argb: "FFC9D1DD" } };
  s.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.navySoft } };
  s.alignment = { vertical: "middle", indent: 1 };
  ws.getRow(2).height = 20;

  // accent stripe
  for (let c = 1; c <= width; c++) {
    ws.getCell(3, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.brand } };
  }
  ws.getRow(3).height = 4;
}

function headerRow(ws: ExcelJS.Worksheet, rowNumber: number, headers: string[]) {
  const row = ws.getRow(rowNumber);
  headers.forEach((h, i) => {
    const cell = row.getCell(i + 1);
    cell.value = h;
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: C.white } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.navy } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = thinBorder(C.navySoft);
  });
  row.height = 30;
}

const RESULT_COLUMNS: Array<{ header: string; width: number; key: keyof Ranked | "quiz" | "countryName"; fmt?: string; align?: "left" | "center" | "right" }> = [
  { header: "Rank", width: 7, key: "rank", align: "center" },
  { header: "Participant", width: 30, key: "name" },
  { header: "Personal ID", width: 22, key: "personalId" },
  { header: "Grade", width: 10, key: "grade", align: "center" },
  { header: "School", width: 34, key: "school" },
  { header: "Country", width: 9, key: "country", align: "center" },
  { header: "Country name", width: 16, key: "countryName" },
  { header: "Gender", width: 11, key: "gender", align: "center" },
  { header: "Score", width: 8, key: "raw", fmt: "0.##", align: "right" },
  { header: "Max", width: 7, key: "max", fmt: "0.##", align: "right" },
  { header: "Percentage", width: 11, key: "pct", fmt: "0.00%", align: "right" },
  { header: "Correct", width: 8, key: "correct", align: "center" },
  { header: "Wrong", width: 8, key: "incorrect", align: "center" },
  { header: "Blank", width: 8, key: "unanswered", align: "center" },
  { header: "Time taken", width: 11, key: "durationMs", fmt: "[h]:mm:ss", align: "center" },
  { header: "Started (UTC)", width: 18, key: "startedAt", fmt: "yyyy-mm-dd hh:mm", align: "center" },
  { header: "Submitted (UTC)", width: 18, key: "submittedAt", fmt: "yyyy-mm-dd hh:mm", align: "center" },
  { header: "Attempts", width: 9, key: "attempts", align: "center" },
];

function cellValue(r: Ranked, key: (typeof RESULT_COLUMNS)[number]["key"], quiz?: string): ExcelJS.CellValue {
  switch (key) {
    case "quiz":
      return quiz ?? "";
    case "countryName":
      return r.country ? countryName(r.country) : "";
    case "pct":
      return r.pct / 100;
    case "durationMs":
      return toDuration(r.durationMs);
    case "startedAt":
      return toDate(r.startedAt);
    case "submittedAt":
      return toDate(r.submittedAt);
    case "gender":
      return r.gender ? r.gender[0]!.toUpperCase() + r.gender.slice(1) : "";
    default: {
      const v = r[key];
      return v == null ? "" : (v as ExcelJS.CellValue);
    }
  }
}

function writeResults(
  ws: ExcelJS.Worksheet,
  startRow: number,
  rows: Array<{ r: Ranked; quiz?: string }>,
  withQuiz: boolean
) {
  const columns = withQuiz
    ? [RESULT_COLUMNS[0]!, { header: "Quiz", width: 32, key: "quiz" as const }, ...RESULT_COLUMNS.slice(1)]
    : RESULT_COLUMNS;

  columns.forEach((c, i) => (ws.getColumn(i + 1).width = c.width));
  headerRow(ws, startRow, columns.map((c) => c.header));

  rows.forEach(({ r, quiz }, idx) => {
    const row = ws.getRow(startRow + 1 + idx);
    const medal = r.rank === 1 ? C.gold : r.rank === 2 ? C.silver : r.rank === 3 ? C.bronze : null;
    const zebra = idx % 2 === 1 ? C.zebra : C.white;
    columns.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      cell.value = cellValue(r, c.key, quiz);
      cell.font = {
        name: FONT,
        size: 10,
        color: { argb: C.ink },
        bold: c.key === "rank" || c.key === "name" || c.key === "pct" ? r.rank <= 3 : false,
      };
      if (c.key === "personalId") cell.font = { ...cell.font, color: { argb: C.muted } };
      if (c.fmt) cell.numFmt = c.fmt;
      cell.alignment = { vertical: "middle", horizontal: c.align ?? "left" };
      cell.border = thinBorder();
      const fill = c.key === "rank" && medal ? medal : medal && (c.key === "name" || c.key === "quiz") ? medal : zebra;
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
    });
    row.height = 18;
  });

  const lastRow = startRow + rows.length;
  if (rows.length) {
    ws.autoFilter = { from: { row: startRow, column: 1 }, to: { row: lastRow, column: columns.length } };
    const pctCol = columns.findIndex((c) => c.key === "pct") + 1;
    const letter = ws.getColumn(pctCol).letter;
    ws.addConditionalFormatting({
      ref: `${letter}${startRow + 1}:${letter}${lastRow}`,
      rules: [
        {
          type: "colorScale",
          priority: 1,
          cfvo: [{ type: "num", value: 0 }, { type: "num", value: 0.5 }, { type: "num", value: 1 }],
          color: [{ argb: C.red }, { argb: C.amber }, { argb: C.green }],
        },
      ],
    });
  }
  ws.views = [{ state: "frozen", xSplit: withQuiz ? 3 : 2, ySplit: startRow, showGridLines: false }];
}

export type TopScorersXlsxResult =
  | { ok: true; buffer: ArrayBuffer; filename: string }
  | { ok: false; status: number; error: string };

/** Build the styled Top Scorers workbook for one session (optionally limited to some countries). */
export async function buildTopScorersXlsx(
  orgId: string,
  sessionId: string,
  countries: string[]
): Promise<TopScorersXlsxResult> {
  const db = createAdminClient();
  const { data: sessionRow } = await db
    .from("competition_sessions")
    .select("id, title, slug, opens_at, closes_at")
    .eq("id", sessionId)
    .eq("org_id", orgId)
    .maybeSingle();
  const session = sessionRow as unknown as { id: string; title: string; slug: string; opens_at: string | null; closes_at: string | null } | null;
  if (!session) return { ok: false, status: 404, error: "Session not found" };

  const { data: setRows } = await db
    .from("session_quiz_sets")
    .select("quiz_version_id, label, position, quiz_version:quiz_versions!inner(version, quiz:quizzes(title))")
    .eq("competition_session_id", session.id)
    .order("position", { ascending: true });
  const quizzes = ((setRows ?? []) as unknown as Array<{
    quiz_version_id: string;
    label: string | null;
    quiz_version: { version: number; quiz: { title: string } | null };
  }>).map((s) => ({
    quizVersionId: s.quiz_version_id,
    label: s.label || `${s.quiz_version.quiz?.title ?? "Quiz"} (v${s.quiz_version.version})`,
  }));

  const attempts: Attempt[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = db
      .from("quiz_sessions")
      .select(
        "id, participant_id, quiz_version_id, raw_score, max_score, percentage, correct_count, incorrect_count, unanswered_count, duration_ms, started_at, submitted_at, participants!inner(personal_id, full_name, grade, school, nationality, gender), session_tokens!inner(competition_session_id)"
      )
      .eq("org_id", orgId)
      .eq("state", "submitted")
      .eq("session_tokens.competition_session_id", session.id)
      .order("id")
      .range(from, from + PAGE - 1);
    if (countries.length) q = q.in("participants.nationality", countries);
    const { data, error } = await q;
    if (error) return { ok: false, status: 500, error: error.message };
    const batch = (data ?? []) as unknown as Attempt[];
    attempts.push(...batch);
    if (batch.length < PAGE) break;
  }

  // Best attempt per participant per quiz, then rank: score desc, fastest first
  const best = new Map<string, Map<string, { a: Attempt; count: number }>>();
  for (const a of attempts) {
    const perQuiz = best.get(a.quiz_version_id) ?? new Map<string, { a: Attempt; count: number }>();
    const prev = perQuiz.get(a.participant_id);
    perQuiz.set(a.participant_id, { a: !prev || better(a, prev.a) ? a : prev.a, count: (prev?.count ?? 0) + 1 });
    best.set(a.quiz_version_id, perQuiz);
  }
  for (const v of best.keys()) if (!quizzes.some((q) => q.quizVersionId === v)) quizzes.push({ quizVersionId: v, label: "Unknown quiz" });

  const ranked = new Map<string, Ranked[]>();
  for (const q of quizzes) {
    const list = [...(best.get(q.quizVersionId)?.values() ?? [])]
      .sort((x, y) => (better(x.a, y.a) ? -1 : better(y.a, x.a) ? 1 : 0))
      .map(({ a, count }, i): Ranked => ({
        rank: i + 1,
        name: a.participants?.full_name ?? "Unknown",
        personalId: a.participants?.personal_id ?? "",
        grade: a.participants?.grade ?? null,
        school: a.participants?.school ?? null,
        country: a.participants?.nationality ?? null,
        gender: a.participants?.gender ?? null,
        raw: num(a.raw_score),
        max: num(a.max_score),
        pct: num(a.percentage),
        correct: a.correct_count,
        incorrect: a.incorrect_count,
        unanswered: a.unanswered_count,
        durationMs: a.duration_ms,
        startedAt: a.started_at,
        submittedAt: a.submitted_at,
        attempts: count,
      }));
    ranked.set(q.quizVersionId, list);
  }

  // ── Workbook ──────────────────────────────────────────────────────────────
  const wb = new ExcelJS.Workbook();
  wb.creator = "Quizzly";
  wb.created = new Date();
  wb.title = `${session.title} — Top Scorers`;

  const scope = countries.length ? countries.map((c) => `${c} (${countryName(c)})`).join(", ") : "All countries";
  const generated = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";
  const subtitle = `${scope}  ·  Generated ${generated}  ·  Best attempt per participant, ranked by score then time taken`;

  // Summary sheet
  const summary = wb.addWorksheet("Summary", { properties: { tabColor: { argb: C.brand } } });
  const sumHeaders = ["#", "Quiz", "Participants", "Average", "Highest", "Lowest", "Avg. time", "1st place", "2nd place", "3rd place"];
  titleBlock(summary, `${session.title} — Top Scorers`, subtitle, sumHeaders.length);
  [5, 38, 13, 11, 11, 11, 11, 30, 30, 30].forEach((w, i) => (summary.getColumn(i + 1).width = w));
  headerRow(summary, 5, sumHeaders);

  quizzes.forEach((q, i) => {
    const list = ranked.get(q.quizVersionId) ?? [];
    const pcts = list.map((r) => r.pct / 100);
    const times = list.map((r) => r.durationMs).filter((v): v is number => v != null);
    const podium = (n: number) => (list[n] ? `${list[n]!.name} (${list[n]!.pct}%)` : "—");
    const row = summary.getRow(6 + i);
    const values: ExcelJS.CellValue[] = [
      i + 1,
      q.label,
      list.length,
      pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null,
      pcts.length ? Math.max(...pcts) : null,
      pcts.length ? Math.min(...pcts) : null,
      times.length ? toDuration(times.reduce((a, b) => a + b, 0) / times.length) : null,
      podium(0),
      podium(1),
      podium(2),
    ];
    values.forEach((v, c) => {
      const cell = row.getCell(c + 1);
      cell.value = v;
      cell.font = { name: FONT, size: 10, color: { argb: list.length ? C.ink : C.muted }, bold: c === 1 };
      cell.border = thinBorder();
      cell.alignment = { vertical: "middle", horizontal: c === 1 || c >= 7 ? "left" : "center", wrapText: c >= 7 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: c === 7 && list[0] ? C.gold : c === 8 && list[1] ? C.silver : c === 9 && list[2] ? C.bronze : i % 2 ? C.zebra : C.white } };
      if (c >= 3 && c <= 5) cell.numFmt = "0.0%";
      if (c === 6) cell.numFmt = "[h]:mm:ss";
    });
    row.height = 20;
  });

  const totalRow = summary.getRow(6 + quizzes.length);
  const allPcts = [...ranked.values()].flat().map((r) => r.pct / 100);
  const totals: ExcelJS.CellValue[] = [
    "",
    "Total",
    new Set([...ranked.values()].flat().map((r) => r.personalId)).size,
    allPcts.length ? allPcts.reduce((a, b) => a + b, 0) / allPcts.length : null,
    allPcts.length ? Math.max(...allPcts) : null,
    allPcts.length ? Math.min(...allPcts) : null,
  ];
  for (let c = 1; c <= sumHeaders.length; c++) {
    const cell = totalRow.getCell(c);
    cell.value = totals[c - 1] ?? "";
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: C.ink } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.brandSoft } };
    cell.border = { top: { style: "medium", color: { argb: C.brand } }, bottom: { style: "thin", color: { argb: C.border } } };
    cell.alignment = { vertical: "middle", horizontal: c === 2 ? "left" : "center" };
    if (c >= 4 && c <= 6) cell.numFmt = "0.0%";
  }
  summary.getCell(7 + quizzes.length, 2).value = "Participants total counts each person once across all quizzes.";
  summary.getCell(7 + quizzes.length, 2).font = { name: FONT, size: 9, italic: true, color: { argb: C.muted } };
  summary.views = [{ state: "frozen", ySplit: 5, showGridLines: false }];

  // All results sheet
  const all = wb.addWorksheet("All Results", { properties: { tabColor: { argb: C.navy } } });
  const allRows = quizzes.flatMap((q) => (ranked.get(q.quizVersionId) ?? []).map((r) => ({ r, quiz: q.label })));
  titleBlock(all, "All results", `${session.title}  ·  ${subtitle}`, RESULT_COLUMNS.length + 1);
  writeResults(all, 5, allRows, true);

  // One sheet per quiz
  const used = new Set(["summary", "all results"]);
  for (const q of quizzes) {
    const list = ranked.get(q.quizVersionId) ?? [];
    const ws = wb.addWorksheet(sheetName(q.label, used), {
      properties: { tabColor: { argb: list.length ? C.gold : C.border } },
    });
    titleBlock(ws, q.label, `${session.title}  ·  ${list.length} ${list.length === 1 ? "participant" : "participants"}  ·  ${scope}`, RESULT_COLUMNS.length);
    writeResults(ws, 5, list.map((r) => ({ r })), false);
    if (!list.length) {
      ws.getCell(6, 2).value = "No submissions yet.";
      ws.getCell(6, 2).font = { name: FONT, size: 10, italic: true, color: { argb: C.muted } };
    }
  }

  wb.eachSheet((ws) => {
    ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
  });

  const buffer = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  const date = new Date().toISOString().slice(0, 10);
  const filename = `top-scorers_${session.slug}${countries.length ? `_${countries.join("-")}` : ""}_${date}.xlsx`;
  return { ok: true, buffer, filename };
}
