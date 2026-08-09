"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { GraduationCap } from "lucide-react";
import { updateQuizGrades } from "@/lib/actions/quiz";
import { toast } from "sonner";

const ALL_GRADES = Array.from({ length: 12 }, (_, i) => i + 1);

export function QuizGrades({
  quizId,
  grades: initialGrades,
}: {
  quizId: string;
  grades: number[];
}) {
  const [grades, setGrades] = useState<number[]>(initialGrades);
  const [isPending, startTransition] = useTransition();

  function toggle(grade: number) {
    const next = grades.includes(grade)
      ? grades.filter((g) => g !== grade)
      : [...grades, grade].sort((a, b) => a - b);
    setGrades(next);
    startTransition(async () => {
      const result = await updateQuizGrades(quizId, next);
      if (result.error) {
        toast.error(result.error);
        setGrades(grades);
      }
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            disabled={isPending}
          >
            <GraduationCap className="h-3.5 w-3.5" />
            {grades.length === 0 ? (
              "All grades"
            ) : grades.length <= 3 ? (
              grades.map((g) => (
                <Badge key={g} variant="secondary" className="px-1 py-0 text-[10px]">
                  G{g}
                </Badge>
              ))
            ) : (
              `${grades.length} grades`
            )}
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Target grades</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {ALL_GRADES.map((g) => (
          <DropdownMenuCheckboxItem
            key={g}
            checked={grades.includes(g)}
            onCheckedChange={() => toggle(g)}
            onSelect={(e) => e.preventDefault()}
          >
            Grade {g}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <p className="px-2 py-1 text-[10px] text-muted-foreground">
          No selection = all grades
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
