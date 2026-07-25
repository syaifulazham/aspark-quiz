import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface QuizRow {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  created_at: string;
  quiz_versions: Array<{
    id: string;
    version: number;
    status: string;
    published_at: string | null;
  }>;
}

export default async function QuizzesPage() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("quizzes")
    .select("*, quiz_versions(id, version, status, published_at)")
    .order("created_at", { ascending: false });

  const quizzes = (data ?? []) as unknown as QuizRow[];

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Quizzes
        </h1>
        <Link
          href="/admin/quizzes/new"
          className={cn(buttonVariants({ variant: "default" }), "gap-2")}
        >
          <Plus className="h-4 w-4" />
          New Quiz
        </Link>
      </div>

      <div className="mt-6 grid gap-4">
        {quizzes.length > 0 ? (
          quizzes.map((quiz) => {
            const versions = (quiz.quiz_versions || []) as Array<{
              id: string;
              version: number;
              status: string;
              published_at: string | null;
            }>;
            const latestVersion = versions[0];
            return (
              <Card key={quiz.id}>
                <CardContent className="flex items-center justify-between py-4">
                  <div>
                    <h2 className="font-medium">{quiz.title}</h2>
                    <p className="mt-0.5 flex items-center gap-2 text-sm text-muted-foreground">
                      {quiz.slug}
                      {latestVersion && (
                        <>
                          <span>·</span>
                          <Badge variant={latestVersion.status === "published" ? "default" : "secondary"}>
                            v{latestVersion.version} {latestVersion.status}
                          </Badge>
                        </>
                      )}
                    </p>
                  </div>
                  <Link
                    href={`/admin/quizzes/${quiz.id}/edit`}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                  >
                    Edit
                  </Link>
                </CardContent>
              </Card>
            );
          })
        ) : (
          <div className="py-12 text-center">
            <p className="font-display text-lg text-muted-foreground">
              No quizzes yet
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create your first quiz to get started.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
