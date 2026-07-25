"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface GeneratedQuestion {
  kind: "mcq_single" | "mcq_multi";
  stem: string;
  options: Array<{ label: string; is_correct: boolean; position: number }>;
  explanation: string | null;
  points: number;
}

interface Props {
  onGenerated: (questions: GeneratedQuestion[]) => void;
}

export function AIGenerateModal({ onGenerated }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState({
    count: 5,
    discipline: "",
    questionType: "mcq_single" as "mcq_single" | "mcq_multi" | "mixed",
    difficulty: "medium" as "easy" | "medium" | "hard" | "mixed",
    prompt: "",
    language: "English",
  });

  async function handleGenerate() {
    if (!config.discipline.trim()) {
      toast.error("Please specify a discipline/subject");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/internal/ai/generate-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || "Generation failed");
        return;
      }

      const data = await res.json();
      if (data.questions?.length) {
        onGenerated(data.questions);
        setOpen(false);
        toast.success(`Generated ${data.questions.length} questions`);
      } else {
        toast.error("No questions generated");
      }
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <Sparkles className="mr-2 h-4 w-4" />
            AI Generate
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Generate Questions with AI</DialogTitle>
          <DialogDescription>
            Configure the AI assistant to generate quiz questions automatically using Gemini.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="ai-count" className="text-xs">
                Number of Questions
              </Label>
              <Input
                id="ai-count"
                type="number"
                min={1}
                max={50}
                value={config.count}
                onChange={(e) =>
                  setConfig({ ...config, count: parseInt(e.target.value) || 5 })
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ai-language" className="text-xs">
                Language
              </Label>
              <Input
                id="ai-language"
                value={config.language}
                onChange={(e) =>
                  setConfig({ ...config, language: e.target.value })
                }
                placeholder="English"
              />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="ai-discipline" className="text-xs">
              Discipline / Subject
            </Label>
            <Input
              id="ai-discipline"
              value={config.discipline}
              onChange={(e) =>
                setConfig({ ...config, discipline: e.target.value })
              }
              placeholder="e.g. Physics, Biology, Mathematics, History..."
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs">Question Type</Label>
              <Select
                value={config.questionType}
                onValueChange={(v) =>
                  setConfig({
                    ...config,
                    questionType: v as "mcq_single" | "mcq_multi" | "mixed",
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mcq_single">Single Answer</SelectItem>
                  <SelectItem value="mcq_multi">Multiple Answer</SelectItem>
                  <SelectItem value="mixed">Mixed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Difficulty</Label>
              <Select
                value={config.difficulty}
                onValueChange={(v) =>
                  setConfig({
                    ...config,
                    difficulty: v as "easy" | "medium" | "hard" | "mixed",
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="easy">Easy</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="hard">Hard</SelectItem>
                  <SelectItem value="mixed">Mixed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="ai-prompt" className="text-xs">
              Additional Prompt (optional)
            </Label>
            <textarea
              id="ai-prompt"
              className="min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={config.prompt}
              onChange={(e) =>
                setConfig({ ...config, prompt: e.target.value })
              }
              placeholder="e.g. Focus on kinematics and Newton's laws. Include questions with formulas..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleGenerate} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Generate
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
