"use client";

import { useActionState } from "react";
import { createQuiz } from "@/lib/actions/quiz";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

type State = { error?: Record<string, string[] | undefined> } | null;

function formAction(_prevState: State, formData: FormData) {
  return createQuiz(formData) as Promise<State>;
}

export default function NewQuizPage() {
  const [state, action, pending] = useActionState(formAction, null);

  function handleSlugify(e: React.ChangeEvent<HTMLInputElement>) {
    const title = e.target.value;
    const slugInput = document.getElementById("slug") as HTMLInputElement;
    if (slugInput && !slugInput.dataset.manual) {
      slugInput.value = title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .slice(0, 100);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/admin/quizzes"
        className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to quizzes
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>Create a new quiz</CardTitle>
          <CardDescription>
            Set the basic details. You&apos;ll add questions next.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={action} className="flex flex-col gap-5">
            <div className="grid gap-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                name="title"
                required
                placeholder="e.g. Mathematics Paper 1"
                onChange={handleSlugify}
              />
              {state?.error?.title && (
                <p className="text-xs text-destructive">{state.error.title[0]}</p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                name="slug"
                required
                placeholder="mathematics-paper-1"
                onFocus={(e) => { (e.target as HTMLInputElement).dataset.manual = "true"; }}
              />
              <p className="text-xs text-muted-foreground">
                URL-friendly identifier. Only lowercase letters, numbers, and hyphens.
              </p>
              {state?.error?.slug && (
                <p className="text-xs text-destructive">{state.error.slug[0]}</p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                name="description"
                rows={3}
                placeholder="A brief description of this quiz..."
              />
            </div>

            {state?.error?._form && (
              <p className="text-sm text-destructive">{state.error._form[0]}</p>
            )}

            <div className="flex justify-end gap-3">
              <Link href="/admin/quizzes" className={buttonVariants({ variant: "outline" })}>
                Cancel
              </Link>
              <Button type="submit" disabled={pending}>
                {pending ? "Creating..." : "Create quiz"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
