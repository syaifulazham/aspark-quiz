"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { KeyRound, Copy, Check, Trash2, Sparkles } from "lucide-react";
import { createApiKey, revokeApiKey } from "@/lib/actions/api-key";
import { AVAILABLE_SCOPES } from "@/lib/api-key-scopes";
import { toast } from "sonner";

interface ApiKeyRow {
  id: string;
  name: string;
  key_prefix: string;
  environment: string;
  scopes: string[];
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

interface Props {
  keys: ApiKeyRow[];
  canManage: boolean;
  origin: string;
}

const API_REFERENCE: Array<{ method: string; path: string; scope: string; description: string }> = [
  {
    method: "POST",
    path: "/api/v1/participants",
    scope: "participants:write",
    description: "Register a participant",
  },
  {
    method: "GET",
    path: "/api/v1/competition-sessions",
    scope: "sessions:read",
    description: "List competition sessions",
  },
  {
    method: "GET",
    path: "/api/v1/competition-sessions/{id}/quizzes",
    scope: "sessions:read",
    description: "List quizzes in a session",
  },
  {
    method: "POST",
    path: "/api/v1/sessions/tokens",
    scope: "tokens:write",
    description: "Create a one-time login token for a participant",
  },
];

export function DevelopersClient({ keys, canManage, origin }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Create key dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [environment, setEnvironment] = useState<"live" | "test">("live");
  const [scopes, setScopes] = useState<string[]>([
    "participants:write",
    "tokens:write",
    "results:read",
  ]);
  const [expiresAt, setExpiresAt] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);

  // Revoke dialog
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyRow | null>(null);

  function toggleScope(scope: string) {
    setScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  }

  function resetCreateForm() {
    setName("");
    setEnvironment("live");
    setScopes(["participants:write", "tokens:write", "results:read"]);
    setExpiresAt("");
    setCreatedKey(null);
    setCopied(false);
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await createApiKey({
        name,
        environment,
        scopes,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      });

      if (result.error) {
        toast.error(result.error);
      } else if (result.key) {
        setCreatedKey(result.key);
        router.refresh();
      }
    });
  }

  function handleRevoke() {
    if (!revokeTarget) return;
    startTransition(async () => {
      const result = await revokeApiKey(revokeTarget.id);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(`Key "${revokeTarget.name}" revoked`);
        setRevokeTarget(null);
        router.refresh();
      }
    });
  }

  async function copyKey() {
    if (!createdKey) return;
    await navigator.clipboard.writeText(createdKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function keyStatus(k: ApiKeyRow) {
    if (k.revoked_at) return <Badge variant="destructive">Revoked</Badge>;
    if (k.expires_at && new Date(k.expires_at) < new Date())
      return <Badge variant="secondary">Expired</Badge>;
    return <Badge>Active</Badge>;
  }

  function buildAiPrompt(): string {
    return `You are integrating with the Quizzly quiz platform REST API.

## Base URL
${origin}

## Authentication
Every request must include the header:
  Authorization: Bearer <API_KEY>

API keys look like "qz_live_..." or "qz_test_...". Keys are scoped — a request fails with 403 if the key lacks the required scope. Ask me for the key if you don't have it.

## Conventions
- All request/response bodies are JSON (Content-Type: application/json).
- List endpoints return { "data": [...] }.
- Errors follow RFC 7807-ish shape: { "type", "title", "status", "detail", "errors"? }.

## Endpoints

### 1. Register a participant
POST /api/v1/participants        (scope: participants:write)

Body:
{
  "personal_id": "STU001",        // required, unique per org (string, max 64)
  "full_name": "Ahmad Faiz",      // required (string, max 160)
  "grade": "Grade 5",             // optional, e.g. "Grade 1" .. "Grade 12"
  "email": "a@example.com",       // optional
  "phone": "+60123456789",        // optional
  "school": "SK Example",         // optional
  "agency": "...",                // optional
  "nationality": "MY",            // optional, ISO 3166-1 alpha-2
  "date_of_birth": "2014-05-01",  // optional, YYYY-MM-DD
  "gender": "male",               // optional: male|female|other|undisclosed
  "external_ref": "crm-123",      // optional
  "metadata": {}                  // optional object
}

Add ?upsert=true to update on duplicate personal_id (200), otherwise duplicates return 409. Success: 201 with the participant object.

### 2. List competition sessions
GET /api/v1/competition-sessions  (scope: sessions:read)

Returns { "data": [{ "id", "slug", "title", "description", "session_type", "is_active", "opens_at", "closes_at", "quiz_count" }] }.
"session_type" is one of: public, live_tournament, online_competition.

### 3. List quizzes in a session
GET /api/v1/competition-sessions/{sessionId}/quizzes   (scope: sessions:read)

Returns { "session": { "id", "title", "slug" }, "data": [{ "session_quiz_set_id", "position", "label", "quiz_version_id", "quiz": { "id", "slug", "title" }, "version", "status", "time_limit_seconds" }] }.
404 if the session does not exist in the key's organisation.

### 4. Create a one-time login token for a participant
POST /api/v1/sessions/tokens      (scope: tokens:write)

Body:
{
  "participant_id": "uuid",              // OR "personal_id": "STU001"
  "quiz_id": "uuid",                     // required
  "quiz_version": "latest_published",    // or a version number
  "competition_session_id": "uuid",      // optional but recommended: binds the token to participant + session + quiz set. The quiz version must belong to this session (422 otherwise).
  "expires_in": 86400,                   // seconds until expiry
  "mode": "solo",                        // "solo" | "live"
  "not_before": null                     // optional ISO timestamp
}

Each token is specific to ONE participant + ONE session + ONE quiz — e.g. Jamil / "Asia Spark Test 1" / "Mathematics for Grade 7" = 1 token. Pass competition_session_id (from endpoint #2) together with the quiz_id (from endpoint #3) so the binding is validated and recorded.

Success: 201 with { "token", "token_id", "participant", "quiz", "mode", "competition_session_id", "start_url", "expires_at", "single_use": true }.
The "start_url" is a ready-to-open link that logs the participant straight into the quiz. Tokens are single-use — once redeemed they cannot be reused.

## Typical flow
1. POST /api/v1/participants to register each participant (use ?upsert=true for idempotent imports).
2. GET /api/v1/competition-sessions to find the session id.
3. GET /api/v1/competition-sessions/{id}/quizzes to find the quiz_id (and latest published version) in that session.
4. POST /api/v1/sessions/tokens per participant+quiz, then distribute each "start_url" to the right participant.

## Guidelines
- Never log or commit the API key.
- Treat "start_url" as a credential — it logs someone in directly.
- Handle 401 (bad/revoked key), 403 (missing scope), 404 (not found), 409 (duplicate personal_id without upsert), 422 (quiz has no published version).
`;
  }

  async function copyAiPrompt() {
    await navigator.clipboard.writeText(buildAiPrompt());
    setPromptCopied(true);
    toast.success("AI prompt copied — paste it into your AI assistant");
    setTimeout(() => setPromptCopied(false), 2000);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            Developers
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create and manage API keys for the Quizzly REST API.
          </p>
        </div>
        {canManage && (
          <Button
            onClick={() => {
              resetCreateForm();
              setCreateOpen(true);
            }}
          >
            <KeyRound className="mr-2 h-4 w-4" />
            Create API key
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">API keys</CardTitle>
          <CardDescription>
            Authenticate with{" "}
            <code className="text-xs">Authorization: Bearer &lt;key&gt;</code>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Prefix</TableHead>
                <TableHead>Env</TableHead>
                <TableHead>Scopes</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Status</TableHead>
                {canManage && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={canManage ? 8 : 7}
                    className="py-12 text-center text-muted-foreground"
                  >
                    No API keys yet.
                  </TableCell>
                </TableRow>
              ) : (
                keys.map((k) => (
                  <TableRow key={k.id}>
                    <TableCell className="font-medium">{k.name}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {k.key_prefix}…
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          k.environment === "live" ? "default" : "outline"
                        }
                      >
                        {k.environment}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {k.scopes.join(", ")}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {k.last_used_at
                        ? new Date(k.last_used_at).toLocaleDateString()
                        : "Never"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {k.expires_at
                        ? new Date(k.expires_at).toLocaleDateString()
                        : "Never"}
                    </TableCell>
                    <TableCell>{keyStatus(k)}</TableCell>
                    {canManage && (
                      <TableCell>
                        {!k.revoked_at && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setRevokeTarget(k)}
                            title="Revoke key"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">API reference</CardTitle>
            <CardDescription>
              Base URL: <code className="text-xs">{origin}</code>
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={copyAiPrompt}>
            {promptCopied ? (
              <Check className="mr-2 h-4 w-4 text-green-600" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            {promptCopied ? "Copied!" : "Copy AI prompt"}
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Endpoint</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {API_REFERENCE.map((ep) => (
                <TableRow key={ep.path}>
                  <TableCell className="font-mono text-xs">
                    <span className="mr-2 font-semibold">{ep.method}</span>
                    {ep.path}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {ep.scope}
                  </TableCell>
                  <TableCell className="text-sm">{ep.description}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="mt-4 rounded-md bg-muted p-3">
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              Example
            </p>
            <pre className="overflow-x-auto font-mono text-xs">
{`curl -X POST ${origin}/api/v1/participants \\
  -H "Authorization: Bearer qz_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{"personal_id": "STU001", "full_name": "Ahmad", "grade": "Grade 5"}'`}
            </pre>
          </div>
        </CardContent>
      </Card>

      {/* Create key dialog */}
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!open) setCreateOpen(false);
          else setCreateOpen(true);
        }}
      >
        <DialogContent>
          {createdKey ? (
            <>
              <DialogHeader>
                <DialogTitle>API key created</DialogTitle>
                <DialogDescription>
                  Copy this key now — it will not be shown again.
                </DialogDescription>
              </DialogHeader>
              <div className="flex items-center gap-2">
                <Input readOnly value={createdKey} className="font-mono text-xs" />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={copyKey}
                  title="Copy key"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <DialogFooter>
                <Button onClick={() => setCreateOpen(false)}>Done</Button>
              </DialogFooter>
            </>
          ) : (
            <form onSubmit={handleCreate}>
              <DialogHeader>
                <DialogTitle>Create API key</DialogTitle>
                <DialogDescription>
                  The raw key is shown only once after creation.
                </DialogDescription>
              </DialogHeader>
              <div className="mt-4 flex flex-col gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="key-name">Name</Label>
                  <Input
                    id="key-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    placeholder="e.g. School portal integration"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Environment</Label>
                  <Select
                    value={environment}
                    onValueChange={(v) => setEnvironment(v as "live" | "test")}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="live">Live</SelectItem>
                      <SelectItem value="test">Test</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Scopes</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {AVAILABLE_SCOPES.map((scope) => (
                      <label
                        key={scope}
                        className="flex items-center gap-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={scopes.includes(scope)}
                          onChange={() => toggleScope(scope)}
                          className="rounded border-border"
                        />
                        <code className="text-xs">{scope}</code>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="key-expiry">Expires on (optional)</Label>
                  <Input
                    id="key-expiry"
                    type="date"
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter className="mt-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCreateOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isPending}>
                  {isPending ? "Creating..." : "Create key"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Revoke confirm dialog */}
      <Dialog
        open={!!revokeTarget}
        onOpenChange={(open) => !open && setRevokeTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revoke API key?</DialogTitle>
            <DialogDescription>
              Any integration using &quot;{revokeTarget?.name}&quot; (
              {revokeTarget?.key_prefix}…) will stop working immediately. This
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRevokeTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={isPending}
              onClick={handleRevoke}
            >
              {isPending ? "Revoking..." : "Revoke key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
