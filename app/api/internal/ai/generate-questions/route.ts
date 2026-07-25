import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

interface GenerateRequest {
  count: number;
  discipline: string;
  questionType: "mcq_single" | "mcq_multi" | "mixed";
  difficulty: "easy" | "medium" | "hard" | "mixed";
  prompt: string;
  language?: string;
}

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not configured" },
      { status: 500 }
    );
  }

  const body: GenerateRequest = await request.json();
  const { count, discipline, questionType, difficulty, prompt, language } = body;

  if (!count || count < 1 || count > 50) {
    return NextResponse.json(
      { error: "count must be between 1 and 50" },
      { status: 400 }
    );
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

  const systemPrompt = `You are an expert quiz question generator. Generate exactly ${count} quiz questions about "${discipline}".

${typeInstruction}
${difficultyInstruction}
${languageInstruction}

Each question must have 4 options (labeled A, B, C, D). Mark the correct option(s).
Questions should be clear, accurate, and educational.
Support LaTeX math notation using $...$ for inline math where appropriate.

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
    "points": 1
  }
]

For mcq_single: exactly one option has is_correct: true.
For mcq_multi: two or more options have is_correct: true.
Do NOT include any markdown formatting, code fences, or text outside the JSON array.`;

  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      generationConfig: {
        responseMimeType: "application/json",
      },
    });
    const result = await model.generateContent(systemPrompt);
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
      return NextResponse.json(
        { error: "AI returned invalid JSON. Please try again." },
        { status: 500 }
      );
    }

    if (!Array.isArray(questions)) {
      return NextResponse.json(
        { error: "AI returned invalid format" },
        { status: 500 }
      );
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
      };
    });

    return NextResponse.json({ questions: validated });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Gemini generation error:", message);
    return NextResponse.json(
      { error: `Generation failed: ${message}` },
      { status: 500 }
    );
  }
}
