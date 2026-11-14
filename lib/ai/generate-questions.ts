import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

interface DocumentImageInput {
  id: number;
  label: string;
  /** Base64 JPEG without the data: prefix. */
  data: string;
}

interface DocumentUnitInput {
  label: string;
  text: string;
  images: DocumentImageInput[];
}

// Topic-only generation keeps the original model. Document generation needs
// accurate figure localisation, which gemini-2.5-flash is poor at (boxes drift
// by ~5% of the page and clip diagrams); current Flash models are precise.
const TOPIC_MODEL = "gemini-2.5-flash";
const DOCUMENT_MODEL = process.env.GEMINI_DOCUMENT_MODEL || "gemini-flash-latest";

const MAX_DOCUMENT_IMAGES = 16;
const MAX_DOCUMENT_BYTES = 4_000_000;

export interface GenerateRequest {
  count: number;
  discipline: string;
  questionType: "mcq_single" | "mcq_multi" | "mixed";
  difficulty: "easy" | "medium" | "hard" | "mixed";
  prompt: string;
  language?: string;
  /** Extracted document content to base the questions on. */
  units?: DocumentUnitInput[];
  /** "create" writes new questions; "import" lifts the ones already in the document. */
  mode?: "create" | "import";
}

export interface GenerateResult {
  status: number;
  body: { error: string } | { questions: unknown[] };
}

/**
 * Generate quiz questions with Gemini, either from a subject description or
 * from extracted document content (text plus page/picture images).
 */
export async function generateQuestions(body: GenerateRequest): Promise<GenerateResult> {
  if (!process.env.GEMINI_API_KEY) {
    return { status: 500, body: { error: "GEMINI_API_KEY is not configured" } };
  }

  const { count, discipline, questionType, difficulty, prompt, language } = body;
  const mode = body.mode === "import" ? "import" : "create";

  const units = (Array.isArray(body.units) ? body.units : [])
    .map((u) => ({
      label: String(u?.label || "Document"),
      text: typeof u?.text === "string" ? u.text : "",
      images: (Array.isArray(u?.images) ? u.images : []).filter(
        (i) =>
          Number.isInteger(i?.id) &&
          typeof i?.data === "string" &&
          /^[A-Za-z0-9+/=]+$/.test(i.data)
      ),
    }))
    .filter((u) => u.text.trim() || u.images.length > 0);
  const hasDocuments = units.length > 0;
  const imageIds = new Set(units.flatMap((u) => u.images.map((i) => i.id)));
  const documentBytes = units.reduce(
    (n, u) => n + u.text.length + u.images.reduce((m, i) => m + i.data.length, 0),
    0
  );
  if (imageIds.size > MAX_DOCUMENT_IMAGES || documentBytes > MAX_DOCUMENT_BYTES) {
    return { status: 413, body: { error: "Too much document content in one request" } };
  }

  if (!count || count < 1 || count > 50) {
    return { status: 400, body: { error: "count must be between 1 and 50" } };
  }

  const typeInstruction =
    questionType === "mcq_single"
      ? 'All questions must be "mcq_single" (exactly one correct answer).'
      : questionType === "mcq_multi"
      ? 'All questions must be "mcq_multi" (two or more correct answers).'
      : 'Mix of "mcq_single" (one correct) and "mcq_multi" (multiple correct).';

  const difficultyInstruction =
    difficulty === "mixed"
      ? "Mix easy, medium, and hard questions."
      : `All questions should be ${difficulty} difficulty.`;

  const languageInstruction = language
    ? `Generate questions in ${language}.`
    : "Generate questions in English.";

  const taskInstruction = !hasDocuments
    ? `Generate exactly ${count} quiz questions about "${discipline}".`
    : mode === "import"
    ? `The attached document content already contains quiz/exam questions. Extract them faithfully (up to ${count}), keeping the original wording, options and order. Convert each to the JSON structure below. If the document marks or lists the correct answers, use them; otherwise work out the correct answer yourself. Skip items that cannot be expressed as a multiple-choice question.`
    : `Generate exactly ${count} quiz questions based ONLY on the attached document content${
        discipline ? ` (subject: "${discipline}")` : ""
      }. Every question must be answerable from the material in the document. Spread the questions across the content.`;

  const figureInstruction = imageIds.size
    ? `
PICTURES: The document content includes images, each introduced by a line "IMAGE ID <n>". Some are full page scans, some are individual pictures.
When a question depends on a diagram, graph, chart, map, table, photo or other figure from the document (the student must see it to answer), add a "figure" object so that region can be snapshotted and shown with the question:
  "figure": { "image_id": <n>, "box_2d": [ymin, xmin, ymax, xmax] }
- box_2d uses coordinates normalised to 0-1000 relative to that image (every image is a square; pages sit at its top-left with white padding), origin at the top-left.
- Draw the box tightly around the figure itself, including its axis labels, legend and caption, but EXCLUDING the question text and answer options.
- If the whole image is the figure, use [0, 0, 1000, 1000].
- Do not describe the figure in the stem instead of attaching it; refer to it as "the diagram"/"the figure".
- Use "figure": null when no picture is needed. Never invent an image_id.
${mode === "create" ? "- Where the document has useful figures, write some questions that use them." : "- Every extracted question that has an accompanying figure in the document must reference it."}
`
    : "";

  const systemPrompt = `You are an expert quiz question generator. ${taskInstruction}

${typeInstruction}
${mode === "import" && hasDocuments ? "" : difficultyInstruction}
${languageInstruction}

${
  mode === "import" && hasDocuments
    ? "Keep the options each question has in the document (2 to 6 options)."
    : "Each question must have 4 options. Mark the correct option(s)."
}
Do not prefix option text with letters such as "A." or "(a)".
Questions should be clear, accurate, and educational.
Support LaTeX math notation using $...$ for inline math where appropriate.
${figureInstruction}
${prompt ? `Additional instructions: ${prompt}` : ""}

Respond ONLY with a valid JSON array. Each element must have this exact structure:
[
  {
    "kind": "mcq_single" or "mcq_multi",
    "stem": "The question text (can include $math$ notation)",
    "options": [
      { "label": "Option text", "is_correct": true/false },
      { "label": "Option text", "is_correct": true/false },
      { "label": "Option text", "is_correct": true/false },
      { "label": "Option text", "is_correct": true/false }
    ],
    "explanation": "Brief explanation of the correct answer",
    "points": 1${imageIds.size ? `,
    "figure": null or { "image_id": 1, "box_2d": [ymin, xmin, ymax, xmax] }` : ""}
  }
]

For mcq_single: exactly one option has is_correct: true.
For mcq_multi: two or more options have is_correct: true.
Do NOT include any markdown formatting, code fences, or text outside the JSON array.`;

  // Document content goes in after the instructions: text first, then each
  // image preceded by the ID the model must use to refer to it.
  const parts: Array<
    { text: string } | { inlineData: { mimeType: string; data: string } }
  > = [{ text: systemPrompt }];
  for (const unit of units) {
    parts.push({
      text: `\n===== DOCUMENT CONTENT: ${unit.label} =====\n${unit.text || "(no extractable text — read the image)"}`,
    });
    for (const image of unit.images) {
      parts.push({ text: `IMAGE ID ${image.id} (${image.label}):` });
      parts.push({ inlineData: { mimeType: "image/jpeg", data: image.data } });
    }
  }

  try {
    const model = genAI.getGenerativeModel({
      model: hasDocuments ? DOCUMENT_MODEL : TOPIC_MODEL,
      generationConfig: {
        responseMimeType: "application/json",
      },
    });
    const result = await model.generateContent(parts);
    const responseText = result.response.text();

    // Parse the JSON response — strip any accidental markdown fences
    const cleaned = responseText
      .replace(/^```json?\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    let questions: unknown[];
    try {
      questions = JSON.parse(cleaned);
    } catch (parseErr) {
      console.error("JSON parse error. Raw response:", responseText.slice(0, 500));
      return { status: 500, body: { error: "AI returned invalid JSON. Please try again." } };
    }

    if (!Array.isArray(questions)) {
      return { status: 500, body: { error: "AI returned invalid format" } };
    }

    // Validate and normalize
    const validated = questions.slice(0, count).map((q: unknown) => {
      const item = q as Record<string, unknown>;
      return {
        kind: item.kind === "mcq_multi" ? "mcq_multi" : "mcq_single",
        stem: String(item.stem || ""),
        options: Array.isArray(item.options)
          ? (item.options as Array<{ label: string; is_correct: boolean }>).map((o, i) => ({
              label: String(o.label || ""),
              is_correct: Boolean(o.is_correct),
              position: i + 1,
            }))
          : [],
        explanation: item.explanation ? String(item.explanation) : null,
        points: typeof item.points === "number" ? item.points : 1,
        figure: normalizeFigure(item.figure, imageIds),
      };
    });

    return { status: 200, body: { questions: validated } };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Gemini generation error:", message);
    return { status: 500, body: { error: `Generation failed: ${message}` } };
  }
}

/** Turn the model's 0-1000 [ymin, xmin, ymax, xmax] box into a 0-1 x/y/w/h rect. */
function normalizeFigure(raw: unknown, imageIds: Set<number>) {
  if (!raw || typeof raw !== "object") return null;
  const figure = raw as { image_id?: unknown; box_2d?: unknown };
  const imageId = Number(figure.image_id);
  if (!imageIds.has(imageId)) return null;

  const full = { imageId, box: { x: 0, y: 0, w: 1, h: 1 } };
  const b = figure.box_2d;
  if (!Array.isArray(b) || b.length !== 4 || b.some((n) => typeof n !== "number")) {
    return full;
  }
  const clamp = (n: number) => Math.min(1, Math.max(0, n / 1000));
  const [y0, x0, y1, x1] = (b as number[]).map(clamp) as [number, number, number, number];
  const x = Math.min(x0, x1);
  const y = Math.min(y0, y1);
  const w = Math.abs(x1 - x0);
  const h = Math.abs(y1 - y0);
  if (w < 0.02 || h < 0.02) return full;
  return { imageId, box: { x, y, w, h } };
}

/**
 * Second pass: find one question's figure on a single page image. Locating a
 * figure among many pages at once is imprecise; with one image the model's
 * box is accurate to about 1% of the page.
 */
export async function locateFigure(body: {
  image?: unknown;
  stem?: unknown;
}): Promise<{ status: number; body: { error: string } | { box: ReturnType<typeof toBox> } }> {
  if (!process.env.GEMINI_API_KEY) {
    return { status: 500, body: { error: "GEMINI_API_KEY is not configured" } };
  }
  const image = typeof body.image === "string" ? body.image : "";
  if (!image || image.length > 3_000_000 || !/^[A-Za-z0-9+/=]+$/.test(image)) {
    return { status: 400, body: { error: "image is required" } };
  }
  const stem = String(body.stem || "").slice(0, 2000);

  const prompt = `This image is one page of a document. A quiz question refers to a figure on this page.
Question: "${stem}"

Return the bounding box of that figure only: the diagram, chart, graph, map, table, photo or illustration, together with its own labels, axis titles, legend and caption. The box must contain the WHOLE figure and must EXCLUDE the question text, the question number and the answer options.
Respond with JSON: {"box_2d": [ymin, xmin, ymax, xmax]} with coordinates normalised to 0-1000 (origin top-left), or {"box_2d": null} if the page has no such figure.`;

  try {
    const model = genAI.getGenerativeModel({
      model: DOCUMENT_MODEL,
      generationConfig: { responseMimeType: "application/json" },
    });
    const result = await model.generateContent([
      { text: prompt },
      { inlineData: { mimeType: "image/jpeg", data: image } },
    ]);
    let parsed: unknown = JSON.parse(result.response.text());
    if (Array.isArray(parsed)) parsed = parsed[0];
    return { status: 200, body: { box: toBox((parsed as { box_2d?: unknown })?.box_2d) } };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Gemini locate-figure error:", message);
    return { status: 500, body: { error: `Locate failed: ${message}` } };
  }
}

/** 0-1000 [ymin, xmin, ymax, xmax] to a 0-1 x/y/w/h rect; null if unusable. */
function toBox(b: unknown) {
  if (!Array.isArray(b) || b.length !== 4 || b.some((n) => typeof n !== "number")) {
    return null;
  }
  const clamp = (n: number) => Math.min(1, Math.max(0, n / 1000));
  const [y0, x0, y1, x1] = (b as number[]).map(clamp) as [number, number, number, number];
  const box = {
    x: Math.min(x0, x1),
    y: Math.min(y0, y1),
    w: Math.abs(x1 - x0),
    h: Math.abs(y1 - y0),
  };
  return box.w < 0.02 || box.h < 0.02 ? null : box;
}

/**
 * Count the quiz questions already present in document content, per unit
 * (page), so the generator can be asked for exactly that many.
 */
export async function countQuestions(body: {
  units?: unknown;
}): Promise<{ status: number; body: { error: string } | { counts: number[] } }> {
  if (!process.env.GEMINI_API_KEY) {
    return { status: 500, body: { error: "GEMINI_API_KEY is not configured" } };
  }
  const units = (Array.isArray(body.units) ? (body.units as DocumentUnitInput[]) : []).map(
    (u) => ({
      text: typeof u?.text === "string" ? u.text : "",
      images: (Array.isArray(u?.images) ? u.images : []).filter(
        (i) => typeof i?.data === "string" && /^[A-Za-z0-9+/=]+$/.test(i.data)
      ),
    })
  );
  const bytes = units.reduce(
    (n, u) => n + u.text.length + u.images.reduce((m, i) => m + i.data.length, 0),
    0
  );
  const images = units.reduce((n, u) => n + u.images.length, 0);
  if (units.length === 0 || units.length > 200) {
    return { status: 400, body: { error: "units are required" } };
  }
  if (images > MAX_DOCUMENT_IMAGES || bytes > MAX_DOCUMENT_BYTES) {
    return { status: 413, body: { error: "Too much document content in one request" } };
  }

  const prompt = `Below is document content split into numbered units (pages). Count the quiz/exam questions it contains: items a student is expected to answer, such as numbered questions with answer options or exercises.
- Count each item that would become one separate quiz question. Sub-parts that each need their own answer count separately.
- Attribute a question to the unit where it STARTS, so a question that continues onto the next unit is counted once.
- Do not count worked examples, headings, instructions, answer keys or marking schemes.
- Explanatory material with no questions counts as 0.

Respond with a JSON array with exactly one entry per unit, in order:
[{"unit": 1, "questions": 0}, ...]`;

  const parts: Array<
    { text: string } | { inlineData: { mimeType: string; data: string } }
  > = [{ text: prompt }];
  units.forEach((unit, index) => {
    parts.push({
      text: `\n===== UNIT ${index + 1} =====\n${unit.text || "(no extractable text — read the image)"}`,
    });
    for (const image of unit.images) {
      parts.push({ inlineData: { mimeType: "image/jpeg", data: image.data } });
    }
  });

  try {
    const model = genAI.getGenerativeModel({
      model: DOCUMENT_MODEL,
      generationConfig: { responseMimeType: "application/json" },
    });
    const result = await model.generateContent(parts);
    const parsed: unknown = JSON.parse(result.response.text());
    const counts = new Array<number>(units.length).fill(0);
    if (Array.isArray(parsed)) {
      for (const entry of parsed as Array<{ unit?: unknown; questions?: unknown }>) {
        const index = Number(entry?.unit) - 1;
        const n = Number(entry?.questions);
        if (Number.isInteger(index) && index >= 0 && index < counts.length && n > 0) {
          counts[index] = Math.min(200, Math.round(n));
        }
      }
    }
    return { status: 200, body: { counts } };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Gemini count-questions error:", message);
    return { status: 500, body: { error: `Count failed: ${message}` } };
  }
}
