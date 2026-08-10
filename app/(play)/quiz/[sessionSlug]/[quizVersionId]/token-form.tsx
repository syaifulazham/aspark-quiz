"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface Props {
  competitionSessionId: string;
  quizVersionId: string;
  sessionTitle: string;
  quizTitle: string;
  quizVersion: number;
  timeLimitSeconds: number | null;
  initialToken?: string;
}

export function TokenForm({
  competitionSessionId,
  quizVersionId,
  sessionTitle,
  quizTitle,
  quizVersion,
  timeLimitSeconds,
  initialToken = "",
}: Props) {
  const [token, setToken] = useState(initialToken);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleRedeem(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/internal/sessions/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: token.trim(),
          quiz_version_id: quizVersionId,
          competition_session_id: competitionSessionId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.detail || "Invalid token.");
        setLoading(false);
        return;
      }

      router.push(`/play/${data.session_id}`);
    } catch {
      setError("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <Card className="w-full shadow-lg">
      <CardHeader className="text-center">
        <CardDescription>{sessionTitle}</CardDescription>
        <CardTitle className="font-display text-2xl font-semibold tracking-tight">
          {quizTitle}
        </CardTitle>
        <CardDescription>
          v{quizVersion}
          {timeLimitSeconds
            ? ` · ${Math.floor(timeLimitSeconds / 60)} min`
            : " · No time limit"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleRedeem} className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label htmlFor="token">Access token</Label>
            <Input
              id="token"
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={token}
              onChange={(e) => setToken(e.target.value.replace(/\D/g, ""))}
              required
              autoComplete="off"
              spellCheck={false}
              className="font-mono text-center text-xl tracking-[0.5em]"
              placeholder="••••••"
            />
            <p className="text-xs text-muted-foreground">
              Enter the 6-digit code given to you by your organiser.
            </p>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" disabled={loading} size="lg" className="mt-2 w-full">
            {loading ? "Verifying..." : "Start quiz →"}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center">
        <p className="text-xs text-muted-foreground">
          Trouble? Contact your organiser.
        </p>
      </CardFooter>
    </Card>
  );
}
