import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

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

  const body = await request.json();
  const imageBase64 = body.image as string | undefined;
  const mimeType = (body.mimeType as string) || "image/png";

  if (!imageBase64 || imageBase64.length > 5_000_000) {
    return NextResponse.json(
      { error: "image is required and must be under ~4MB" },
      { status: 400 }
    );
  }

  try {
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent([
      {
        inlineData: {
          data: imageBase64,
          mimeType,
        },
      },
      {
        text: `This image contains handwritten mathematics. Transcribe it into a single LaTeX/KaTeX expression.

Rules:
- Return ONLY the raw LaTeX expression, no delimiters (no $ or $$), no explanation, no markdown code fences.
- Use KaTeX-compatible syntax (\\frac, \\sqrt, ^{}, _{}, \\times, etc.).
- If the image contains no recognizable math, return an empty string.`,
      },
    ]);

    const latex = result.response
      .text()
      .trim()
      .replace(/^```(?:latex)?\s*/i, "")
      .replace(/```\s*$/, "")
      .replace(/^\$+|\$+$/g, "")
      .trim();

    return NextResponse.json({ latex });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Recognition failed" },
      { status: 500 }
    );
  }
}
