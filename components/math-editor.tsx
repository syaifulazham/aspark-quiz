"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { KaTeXRenderer } from "@/components/katex-renderer";
import { Eraser, Wand2, Undo2 } from "lucide-react";
import { toast } from "sonner";

interface MathEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialValue?: string;
  title?: string;
  onApply: (latex: string) => void;
}

interface PaletteButton {
  label: string;
  insert: string;
  hint?: string;
}

const PALETTE: Array<{ group: string; buttons: PaletteButton[] }> = [
  {
    group: "Structure",
    buttons: [
      { label: "a/b", insert: "\\frac{${1}}{${2}}", hint: "Fraction" },
      { label: "√x", insert: "\\sqrt{${1}}", hint: "Square root" },
      { label: "ⁿ√x", insert: "\\sqrt[${1}]{${2}}", hint: "Nth root" },
      { label: "x²", insert: "^{${1}}", hint: "Superscript" },
      { label: "xᵢ", insert: "_{${1}}", hint: "Subscript" },
      { label: "( )", insert: "\\left( ${1} \\right)", hint: "Parentheses" },
    ],
  },
  {
    group: "Operators",
    buttons: [
      { label: "×", insert: "\\times" },
      { label: "÷", insert: "\\div" },
      { label: "±", insert: "\\pm" },
      { label: "·", insert: "\\cdot" },
      { label: "=", insert: "=" },
      { label: "≠", insert: "\\neq" },
      { label: "≈", insert: "\\approx" },
      { label: "≤", insert: "\\leq" },
      { label: "≥", insert: "\\geq" },
      { label: "%", insert: "\\%" },
      { label: "°", insert: "^{\\circ}", hint: "Degrees" },
    ],
  },
  {
    group: "Greek",
    buttons: [
      { label: "π", insert: "\\pi" },
      { label: "θ", insert: "\\theta" },
      { label: "α", insert: "\\alpha" },
      { label: "β", insert: "\\beta" },
      { label: "γ", insert: "\\gamma" },
      { label: "Δ", insert: "\\Delta" },
      { label: "λ", insert: "\\lambda" },
      { label: "μ", insert: "\\mu" },
      { label: "σ", insert: "\\sigma" },
      { label: "φ", insert: "\\phi" },
      { label: "ω", insert: "\\omega" },
    ],
  },
  {
    group: "Advanced",
    buttons: [
      { label: "∑", insert: "\\sum_{${1}}^{${2}}", hint: "Sum" },
      { label: "∫", insert: "\\int_{${1}}^{${2}}", hint: "Integral" },
      { label: "log", insert: "\\log_{${1}}{${2}}" },
      { label: "ln", insert: "\\ln{${1}}" },
      { label: "|x|", insert: "\\left| ${1} \\right|", hint: "Absolute value" },
      { label: "lim", insert: "\\lim_{${1} \\to ${2}}" },
      { label: "→", insert: "\\rightarrow" },
      { label: "∞", insert: "\\infty" },
    ],
  },
];

export function MathEditor({ open, onOpenChange, initialValue = "", title = "Math editor", onApply }: MathEditorProps) {
  const [latex, setLatex] = useState(initialValue);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) setLatex(initialValue);
  }, [open, initialValue]);

  function insertSnippet(snippet: string) {
    const ta = textareaRef.current;
    if (!ta) {
      setLatex((v) => v + snippet);
      return;
    }
    const start = ta.selectionStart ?? latex.length;
    const end = ta.selectionEnd ?? latex.length;
    const before = latex.slice(0, start);
    const after = latex.slice(end);

    // Support ${1}, ${2} placeholders — first placeholder becomes selection
    const placeholderMatch = snippet.match(/\$\{1\}/);
    let finalSnippet = snippet;
    let cursorPos = start + snippet.length;
    if (placeholderMatch) {
      const idx = placeholderMatch.index!;
      finalSnippet = snippet.replace(/\$\{\d+\}/g, "");
      cursorPos = start + idx;
    }
    setLatex(before + finalSnippet + after);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(cursorPos, cursorPos);
    });
  }

  function handleApply() {
    const trimmed = latex.trim();
    if (!trimmed) {
      toast.error("Enter a math expression first");
      return;
    }
    onApply(trimmed);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Write KaTeX directly, build it with buttons, or draw it by hand.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="build">
          <TabsList className="w-full">
            <TabsTrigger value="write" className="flex-1">Write</TabsTrigger>
            <TabsTrigger value="build" className="flex-1">Build</TabsTrigger>
            <TabsTrigger value="draw" className="flex-1">Draw</TabsTrigger>
          </TabsList>

          <TabsContent value="write" className="space-y-2 pt-3">
            <p className="text-xs text-muted-foreground">
              Type LaTeX/KaTeX directly, e.g. <code className="rounded bg-muted px-1">\frac{"{3}{4}"}</code> or <code className="rounded bg-muted px-1">x^2 + y^2</code>
            </p>
          </TabsContent>

          <TabsContent value="build" className="max-h-56 space-y-3 overflow-auto pt-3">
            {PALETTE.map((group) => (
              <div key={group.group}>
                <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {group.group}
                </p>
                <div className="flex flex-wrap gap-1">
                  {group.buttons.map((btn) => (
                    <Button
                      key={btn.label}
                      variant="outline"
                      size="sm"
                      className="h-7 min-w-8 px-2 text-xs"
                      title={btn.hint}
                      onClick={() => insertSnippet(btn.insert)}
                    >
                      {btn.label}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="draw" className="pt-3">
            <HandwritingCanvas
              onRecognized={(recognized) => {
                setLatex(recognized);
                toast.success("Recognized — check the preview");
              }}
            />
          </TabsContent>
        </Tabs>

        {/* Shared expression field (used by Write & Build) */}
        <textarea
          ref={textareaRef}
          value={latex}
          onChange={(e) => setLatex(e.target.value)}
          rows={2}
          className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          placeholder="KaTeX expression, e.g. \frac{a}{b} + c^2"
        />

        {/* Live preview */}
        <div className="min-h-[44px] rounded-md border border-border bg-muted/30 px-3 py-2">
          {latex.trim() ? (
            <KaTeXRenderer text={`$${latex.trim()}$`} className="text-lg" />
          ) : (
            <span className="text-sm text-muted-foreground">Preview</span>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleApply}>Insert</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HandwritingCanvas({ onRecognized }: { onRecognized: (latex: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasStrokes = useRef(false);
  const strokes = useRef<ImageData[]>([]);
  const [recognizing, setRecognizing] = useState(false);

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "currentColor";
  }, []);

  useEffect(() => {
    setupCanvas();
  }, [setupCanvas]);

  function getPos(e: React.PointerEvent) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function startDraw(e: React.PointerEvent) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    // Save for undo
    strokes.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (strokes.current.length > 20) strokes.current.shift();
    drawing.current = true;
    hasStrokes.current = true;
    canvas.setPointerCapture(e.pointerId);
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function draw(e: React.PointerEvent) {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function stopDraw() {
    drawing.current = false;
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasStrokes.current = false;
    strokes.current = [];
  }

  function undo() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const prev = strokes.current.pop();
    if (!canvas || !ctx || !prev) return;
    ctx.putImageData(prev, 0, 0);
    if (strokes.current.length === 0) hasStrokes.current = false;
  }

  async function recognize() {
    const canvas = canvasRef.current;
    if (!canvas || !hasStrokes.current) {
      toast.error("Draw something first");
      return;
    }
    setRecognizing(true);
    try {
      // Render onto white background for better recognition
      const exportCanvas = document.createElement("canvas");
      exportCanvas.width = canvas.width;
      exportCanvas.height = canvas.height;
      const ectx = exportCanvas.getContext("2d")!;
      ectx.fillStyle = "#ffffff";
      ectx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
      ectx.drawImage(canvas, 0, 0);
      const dataUrl = exportCanvas.toDataURL("image/png");
      const base64 = dataUrl.split(",")[1];

      const res = await fetch("/api/internal/ai/recognize-math", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64, mimeType: "image/png" }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Recognition failed");
        return;
      }
      if (!data.latex) {
        toast.error("Could not recognize any math — try again");
        return;
      }
      onRecognized(data.latex);
    } catch {
      toast.error("Recognition failed");
    } finally {
      setRecognizing(false);
    }
  }

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        className="h-44 w-full touch-none cursor-crosshair rounded-md border border-border bg-white dark:bg-background"
        onPointerDown={startDraw}
        onPointerMove={draw}
        onPointerUp={stopDraw}
        onPointerLeave={stopDraw}
      />
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Draw the math expression above</p>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" className="h-7 gap-1" onClick={undo}>
            <Undo2 className="h-3 w-3" /> Undo
          </Button>
          <Button variant="ghost" size="sm" className="h-7 gap-1" onClick={clear}>
            <Eraser className="h-3 w-3" /> Clear
          </Button>
          <Button variant="outline" size="sm" className="h-7 gap-1" disabled={recognizing} onClick={recognize}>
            <Wand2 className="h-3 w-3" /> {recognizing ? "Recognizing..." : "Recognize"}
          </Button>
        </div>
      </div>
    </div>
  );
}
