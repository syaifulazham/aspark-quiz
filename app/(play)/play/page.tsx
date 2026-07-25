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

export default function PlayEntryPage() {
  const [personalId, setPersonalId] = useState("");
  const [token, setToken] = useState("");
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
          personal_id: personalId.trim(),
          token: token.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.detail || "Invalid ID or token.");
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
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center">
          <CardTitle className="font-display text-2xl font-semibold tracking-tight">
            Ready when you are
          </CardTitle>
          <CardDescription>
            Enter your ID and access token to begin.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleRedeem} className="flex flex-col gap-4">
            <div className="grid gap-2">
              <Label htmlFor="personal-id">Participant ID</Label>
              <Input
                id="personal-id"
                type="text"
                value={personalId}
                onChange={(e) => setPersonalId(e.target.value)}
                required
                autoComplete="off"
                className="font-mono"
                placeholder="S2024-1187"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="token">Access token</Label>
              <Input
                id="token"
                type="text"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                required
                autoComplete="off"
                spellCheck={false}
                className="font-mono tracking-wider"
                placeholder="qzt_••••••••••••••••"
              />
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <Button type="submit" disabled={loading} size="lg" className="mt-2 w-full">
              {loading ? "Verifying..." : "Continue →"}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center">
          <p className="text-xs text-muted-foreground">
            Trouble? Contact your organiser.
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
