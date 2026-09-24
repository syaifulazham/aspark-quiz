# Quizzly API Integration Guide

This guide is for third-party systems (school portals, registration systems, CRMs, competition back-offices) that want to integrate with Quizzly: register participants, hand them a login to a quiz, and read back their results.

- **Base URL:** the origin your Quizzly admin portal runs on, e.g. `https://quizzly.asia-spark.org`. It is shown under **Admin → Developers → API reference**.
- **API version:** all public endpoints are under `/api/v1/`.
- **Format:** JSON in, JSON out (`Content-Type: application/json`).

---

## 1. Core concepts

| Term | Meaning |
|---|---|
| **Organisation (org)** | Your tenant. Every API key belongs to exactly one org, and every request is automatically scoped to that org. You can never see or touch another org's data. |
| **Participant** | A person who takes quizzes. Identified in *your* system by `personal_id` (student ID, IC number, etc.), which is unique per org. Quizzly assigns its own UUID `id`. |
| **Quiz / Quiz version** | A quiz is a container; each *published* version is an immutable set of questions and settings. Participants always sit a specific version. |
| **Competition session** | A named event (e.g. "Online Qualifying Round") that groups a set of quiz versions. Recommended for competitions so results can be reported per event. |
| **Session token** | A **6-digit, single-use** login code that binds *one participant* to *one quiz version* (optionally within *one competition session*). Issuing a token is how you "schedule" someone to take a quiz. |
| **Quiz session** | The actual attempt. Created when a token is redeemed. Moves through `issued → active → submitted` (or `voided`). Scores live here. |

The relationship is: **1 participant + 1 quiz + 1 competition session = 1 token = 1 attempt**.

---

## 2. Authentication

### 2.1 Getting an API key

1. Sign in to the admin portal as an **owner** or **admin**.
2. Go to **Developers → Create API key**.
3. Give it a name, pick an environment (`live` or `test`), tick the **scopes** you need, optionally set an expiry date.
4. **Copy the key immediately.** It is shown once and never again (only a SHA-256 hash is stored).

Keys look like:

```
qz_live_3f9a1c2b_<43-char secret>
qz_test_7d2e0f11_<43-char secret>
```

### 2.2 Sending the key

Every request must carry a Bearer token:

```http
Authorization: Bearer qz_live_3f9a1c2b_...
```

Missing, malformed, revoked or expired keys return **401**.

### 2.3 Scopes

A key only works on endpoints whose scope it has; otherwise you get **403**.

| Scope | Grants |
|---|---|
| `participants:read` | Check whether a participant exists, list participants |
| `participants:write` | Create / upsert participants (single and batch); also implies `participants:read` for the existence check |
| `tokens:write` | Issue login tokens (single and batch); also implies `tokens:read`; required (with `results:read`) to void a session |
| `tokens:read` | Read token status |
| `results:read` | Read quiz sessions, per-participant results, leaderboards |
| `quizzes:read` | List quizzes and quiz versions |
| `sessions:read` | List competition sessions and the quizzes inside them |

A key may additionally be restricted to a **quiz allow-list** (`quiz_ids`). If set, token issuance, quiz detail and leaderboard calls for other quizzes return **403**. `GET /api/v1/ping` shows you the effective scopes and allow-list of your key.

### 2.4 Key lifecycle

- Revoking a key in the admin portal takes effect immediately.
- `last_used_at` is recorded on every successful authentication so you can spot unused keys.
- Rotate by creating a new key, switching your integration, then revoking the old one.

---

## 3. Conventions

### 3.1 Errors

Errors are JSON objects in an RFC 7807-style shape. `type` may be a URL or a short code depending on the endpoint; always branch on the HTTP **status** and, where present, `errors[].field` / `errors[].code`.

```json
{
  "type": "https://docs.quizzly.app/errors/validation",
  "title": "Validation failed",
  "status": 400,
  "detail": "Request body failed schema validation.",
  "errors": [
    { "field": "nationality", "code": "invalid_string", "message": "Invalid" }
  ]
}
```

| Status | Meaning |
|---|---|
| `400` | Validation failed / malformed body |
| `401` | Bad or missing API key |
| `403` | Key lacks the scope, or the quiz is outside the key's allow-list |
| `404` | Resource does not exist **in your org** |
| `409` | Conflict (duplicate `personal_id`, already voided, …) |
| `422` | Semantically invalid (quiz has no published version, quiz not in the given session) |
| `500` | Server error — safe to retry with back-off |

### 3.2 Lists and pagination

List endpoints return `{ "data": [...] }`. Paginated ones add:

```json
"pagination": { "next_cursor": "…", "has_more": true, "limit": 50 }
```

Pass `?cursor=<next_cursor>` to fetch the next page. `limit` defaults to 50 and is capped at 200 (leaderboard: 100 / 500).

### 3.3 Batch endpoints

Batch endpoints (`/participants/batch`, `/sessions/tokens/batch`) accept up to **500 items** and always return **207 Multi-Status** with a per-item `results` array. Check each item's `status`; never assume the whole batch succeeded.

### 3.4 Identifiers and timestamps

- All Quizzly IDs are UUIDs.
- All timestamps are ISO 8601 in UTC (`2026-09-20T10:19:49.082Z`).
- `nationality` is ISO 3166-1 alpha-2, upper-case (`MY`, `MN`, `TH`).
- `date_of_birth` is `YYYY-MM-DD`.

### 3.5 Idempotency

- Participant creation is idempotent when you add `?upsert=true` (or `"upsert": true` in batch).
- Token issuance is **not** idempotent — each call mints a new token. Store the returned `token_id` so you can check status instead of re-issuing.

---

## 4. Quickstart: the typical competition flow

```
┌─────────────┐   1  ┌──────────────┐   2/3   ┌──────────────┐   4   ┌──────────┐
│ Your system │ ───▶ │ Participants │  ────▶  │ Session+Quiz │ ───▶ │  Token   │
└─────────────┘      └──────────────┘         └──────────────┘      └────┬─────┘
       ▲                                                                  │ 5 start_url
       │ 6/7 poll status, fetch results                                   ▼
       └──────────────────────────────────────────────────────── Participant sits quiz
```

**Step 0 – (Optional) Check whether the participant already exists** (`participants:read` or `participants:write`)

```bash
curl "$BASE/api/v1/participants/lookup?personal_id=STU001" -H "Authorization: Bearer $KEY"
# → {"exists": false, "matched_by": "personal_id", "participant": null}
```

**Step 1 – Register participants** (`participants:write`)

```bash
curl -X POST "$BASE/api/v1/participants?upsert=true" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"personal_id":"STU001","full_name":"Ahmad Faiz","grade":"Grade 5","school":"SK Example","nationality":"MY"}'
```

**Step 2 – Find the competition session** (`sessions:read`)

```bash
curl "$BASE/api/v1/competition-sessions" -H "Authorization: Bearer $KEY"
# → pick the "id" of e.g. "Online Qualifying Round"
```

**Step 3 – Find the quiz inside that session** (`sessions:read`)

```bash
curl "$BASE/api/v1/competition-sessions/$SESSION_ID/quizzes" -H "Authorization: Bearer $KEY"
# → each item has quiz.id (use as quiz_id) and version
```

**Step 4 – Issue a token per participant + quiz** (`tokens:write`)

```bash
curl -X POST "$BASE/api/v1/sessions/tokens" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"personal_id":"STU001","quiz_id":"'$QUIZ_ID'","competition_session_id":"'$SESSION_ID'","expires_in":172800}'
```

Response (201):

```json
{
  "token": "482913",
  "token_id": "0b1c…",
  "participant": { "id": "…", "personal_id": "STU001", "full_name": "Ahmad Faiz" },
  "quiz": { "id": "…", "title": "Mathematics Grade 5", "version": 1, "question_count": 30, "time_limit_seconds": 3600 },
  "mode": "solo",
  "competition_session_id": "…",
  "start_url": "https://quizzly.example.org/quiz/online-qualifying-round/<quiz_version_id>?token=482913",
  "expires_at": "2026-09-22T10:00:00.000Z",
  "not_before": null,
  "single_use": true
}
```

**Step 5 – Deliver the `start_url` (or the 6-digit `token` + their `personal_id`) to the participant.** Treat both as credentials.

**Step 6 – Poll token status** (`tokens:read`)

```bash
curl "$BASE/api/v1/sessions/tokens/$TOKEN_ID" -H "Authorization: Bearer $KEY"
# status: active | not_yet_valid | redeemed | expired | revoked
# once redeemed, "session" carries state and score
```

**Step 7 – Pull results** (`results:read`)

```bash
curl "$BASE/api/v1/sessions?quiz_id=$QUIZ_ID&state=submitted&sort=percentage&order=desc" \
  -H "Authorization: Bearer $KEY"
```

---

## 5. What the participant experiences

1. Opening `start_url` lands on the quiz entry page with the token pre-filled (session-bound URLs also fix the quiz; generic URLs are `/play?pid=…&token=…`). The participant may be asked to confirm their `personal_id` (case-insensitive match).
2. Redeeming the token creates a **quiz session** and sets a 4-hour browser cookie. The token is now `redeemed` and cannot be used again on another device. If the browser is closed, re-opening the same link on the **same browser** resumes the attempt.
3. The attempt becomes `active` when the participant presses Start; a `deadline_at` is set from the version's `time_limit_seconds`.
4. On submit, answers are graded server-side and the session becomes `submitted` with `raw_score`, `max_score`, `percentage`, `passed`, `correct_count`, `incorrect_count`, `unanswered_count`, `duration_ms`.

Failure cases the participant may see: token expired (`410`), revoked (`410`), not yet valid (`422`, when `not_before` is in the future), already redeemed (`409`), wrong quiz/session for this token (`403`).

> **Note on `passed`:** it is only computed when the quiz version has a `passing_score`. If the organiser has not set one, `passed` is `null` — do not treat `null` as a fail.

---

## 6. Endpoint reference

All paths are relative to the base URL. `[scope]` is the required scope.

### 6.1 Health

#### `GET /api/v1/ping` — any valid key

Verifies the key and returns its context.

```json
{ "status": "ok", "org_id": "…", "scopes": ["participants:write", "tokens:write"], "quiz_ids": null }
```

---

### 6.2 Participants

#### `GET /api/v1/participants/lookup` — `[participants:read]` (or `participants:write`)

Check whether a participant exists and, if so, get their record. Pass **exactly one** of:

| Query | Notes |
|---|---|
| `personal_id` | Your identifier (case-insensitive, literal match) |
| `external_ref` | Your secondary reference |
| `email` | Case-insensitive |

The response is always `200` for a valid request — branch on `exists`:

```json
{ "exists": true, "matched_by": "personal_id",
  "participant": { "id": "…", "personal_id": "STU001", "full_name": "Ahmad Faiz", "grade": "Grade 5", "school": "SK Example",
                   "agency": null, "nationality": "MY", "gender": null, "email": null, "external_ref": null,
                   "created_at": "…", "updated_at": "…" } }
```

```json
{ "exists": false, "matched_by": "personal_id", "participant": null }
```

`400` if zero or more than one lookup parameter is supplied. Typical uses: pre-flight before `POST /participants` to avoid `409`s, or resolving a `personal_id` to the Quizzly `id` required by `/sessions/tokens/batch` and `/participants/{id}/results`.

#### `GET /api/v1/participants` — `[participants:read]`

List participants, newest first. Query: `personal_id` (exact, case-insensitive), `school`, `agency` (substring), `limit` (≤ 200), `cursor`. Returns `{ data: [...full participant rows], pagination }`.

#### `POST /api/v1/participants` — `[participants:write]`

Create a participant. Add `?upsert=true` to update an existing one matched on `personal_id`.

| Field | Type | Required | Notes |
|---|---|---|---|
| `personal_id` | string ≤ 64 | **yes** | Your identifier; unique per org |
| `full_name` | string ≤ 160 | **yes** | |
| `grade` | string ≤ 50 | no | Free text, e.g. `"Grade 5"`. Used by the admin filters — keep it consistent |
| `school` | string ≤ 200 | no | |
| `agency` | string ≤ 200 | no | Sponsoring body / centre |
| `nationality` | `[A-Z]{2}` | no | ISO 3166-1 alpha-2 |
| `date_of_birth` | `YYYY-MM-DD` | no | |
| `age` | int 3–120 | no | |
| `gender` | enum | no | `male` \| `female` \| `other` \| `undisclosed` |
| `email` | email | no | |
| `phone` | string ≤ 20 | no | |
| `external_ref` | string ≤ 128 | no | Your own secondary reference |
| `metadata` | object | no | Arbitrary JSON, default `{}` |

Responses: `201` created (or `200` when updated via upsert) with the full participant record including `id`; `400` validation; `409` duplicate `personal_id` without upsert.

#### `POST /api/v1/participants/batch` — `[participants:write]`

```json
{
  "upsert": true,
  "participants": [
    { "personal_id": "STU001", "full_name": "Ahmad Faiz", "school": "SK Example" },
    { "personal_id": "STU002", "full_name": "Nur Aina" }
  ]
}
```

Max 500 items. Always returns `207`:

```json
{
  "created": 1, "updated": 1, "failed": 0,
  "results": [
    { "index": 0, "status": "created", "id": "…", "personal_id": "STU001" },
    { "index": 1, "status": "updated", "id": "…", "personal_id": "STU002" }
  ]
}
```

Per-item `status` is `created` / `updated` / `failed`; failures carry `error: { code, detail }` with codes `missing_required`, `duplicate`, `db_error`.

> The batch endpoint currently accepts the same fields as the single endpoint **except `grade`**. If you need `grade`, use the single endpoint or follow up with `?upsert=true`.

#### `GET /api/v1/participants/{id}/results` — `[results:read]`

All **submitted** attempts for one participant (`{id}` is the Quizzly UUID).

Query: `quiz_id` (filter to one quiz), `include=answers` (attach per-question answers).

```json
{
  "participant": { "id": "…", "personal_id": "STU001", "full_name": "…", "school": "…", "agency": null },
  "summary": { "sessions_completed": 2, "best_percentage": 93.33, "total_time_seconds": 1140 },
  "data": [
    {
      "session_id": "…",
      "quiz": { "id": "…", "title": "Mathematics Grade 5", "version": 1 },
      "mode": "solo",
      "state": "submitted",
      "score": { "raw": 28, "max": 30, "percentage": 93.33, "passed": null, "correct": 28, "incorrect": 1, "unanswered": 1 },
      "timing": { "started_at": "…", "submitted_at": "…", "duration_ms": 315000, "time_limit_seconds": 3600 },
      "integrity_flags": [],
      "answers": [ { "question_id": "…", "selected_option_id": "…", "numeric_response": null, "is_correct": true, "points_awarded": 1, "time_taken_ms": 12000, "revision_count": 0 } ]
    }
  ]
}
```

---

### 6.3 Competition sessions

#### `GET /api/v1/competition-sessions` — `[sessions:read]`

```json
{ "data": [ { "id": "…", "slug": "online-qualifying-round", "title": "Online Qualifying Round", "description": null,
              "session_type": "online_competition", "is_active": true, "opens_at": "…", "closes_at": "…", "quiz_count": 34 } ] }
```

`session_type` ∈ `public` | `live_tournament` | `online_competition`.

#### `GET /api/v1/competition-sessions/{id}/quizzes` — `[sessions:read]`

Quizzes attached to the session, in display order.

```json
{
  "session": { "id": "…", "title": "Online Qualifying Round", "slug": "online-qualifying-round" },
  "data": [ { "session_quiz_set_id": "…", "position": 0, "label": null, "quiz_version_id": "…",
              "quiz": { "id": "…", "slug": "mathematics-grade-5", "title": "Mathematics Grade 5" },
              "version": 1, "status": "published", "time_limit_seconds": 3600 } ]
}
```

Use `quiz.id` as `quiz_id` when issuing tokens. `404` if the session is not in your org.

---

### 6.4 Quizzes

#### `GET /api/v1/quizzes` — `[quizzes:read]`

All quizzes in your org (filtered to the key's allow-list if any), with the latest published version summary.

```json
{ "data": [ { "id": "…", "slug": "…", "title": "…", "latest_published_version": 1, "time_limit_seconds": 3600, "published_at": "…" } ] }
```

#### `GET /api/v1/quizzes/{id}` — `[quizzes:read]`

Quiz detail with every version and its settings (`status`, `time_limit_seconds`, `per_question_seconds`, `shuffle_questions`, `shuffle_options`, `allow_backtrack`, `max_attempts`, `passing_score`, `published_at`).

#### `GET /api/v1/quizzes/{id}/leaderboard` — `[results:read]`

Best submitted attempt per participant on the **latest published version**, ranked by percentage desc, then duration asc.

Query: `school`, `agency` (exact match), `limit` (default 100, max 500).

```json
{
  "quiz": { "id": "…", "title": "Mathematics Grade 2", "version": 1 },
  "scope": { "school": "Erdem nova" },
  "generated_at": "…",
  "data": [ { "rank": 1, "participant_id": "…", "personal_id": "…", "full_name": "…", "school": "…", "percentage": 95.92, "duration_seconds": 3566 } ]
}
```

---

### 6.5 Session tokens (participant logins)

#### `POST /api/v1/sessions/tokens` — `[tokens:write]`

| Field | Type | Default | Notes |
|---|---|---|---|
| `participant_id` **or** `personal_id` | uuid / string | — | One is required. `personal_id` match is case-insensitive |
| `quiz_id` | uuid | — | **Required** |
| `quiz_version` | `"latest_published"` \| int | `latest_published` | Must be a *published* version |
| `competition_session_id` | uuid | null | **Strongly recommended.** Validates that the quiz version belongs to the session (`422` otherwise) and produces a session-scoped `start_url`. Required for results to appear under that session in the admin Results/Stats/Top Scorers pages |
| `expires_in` | int seconds | `86400` | 60 … 2 592 000 (30 days) |
| `not_before` | ISO datetime | null | Token cannot be redeemed before this time |
| `mode` | `solo` \| `live` | `solo` | `live` requires a `live_room_id` |
| `live_room_id` | uuid | null | |

`redirect_url` and `create_if_missing` are accepted for forward compatibility but currently have no effect.

Success `201` — see the Quickstart for the full payload. Key fields: `token` (6-digit code), `token_id` (use for status polling), `start_url`, `expires_at`.

Errors: `400` validation, `403` quiz not in key allow-list, `404` participant / version / session not found, `422` no published version or quiz not in session.

#### `POST /api/v1/sessions/tokens/batch` — `[tokens:write]`

```json
{ "tokens": [ { "participant_id": "<uuid>", "quiz_id": "<uuid>", "personal_id": "STU001", "expires_in": 172800 } ] }
```

- `participant_id` (Quizzly UUID) and `quiz_id` are required per item; `personal_id` is optional and only used to prefill the `start_url`.
- Always uses the **latest published** version.
- Does **not** accept `competition_session_id`; if you need session binding, use the single endpoint in a loop.
- Max 500 items. Returns `207` with `{ issued, failed, results[] }`; each successful item has `status: "issued"`, `token`, `token_id`, `start_url`, `expires_at`.

#### `GET /api/v1/sessions/tokens/{token_id}` — `[tokens:read]` (or `tokens:write`)

```json
{
  "token_id": "…", "token_prefix": "482913", "status": "redeemed", "mode": "solo",
  "participant": { "id": "…", "personal_id": "STU001", "full_name": "…" },
  "quiz": { "id": "…", "title": "…", "version": 1 },
  "competition_session_id": "…",
  "not_before": null, "expires_at": "…", "redeemed_at": "…", "revoked_at": null, "created_at": "…",
  "session": { "session_id": "…", "state": "submitted", "started_at": "…", "deadline_at": "…", "submitted_at": "…",
               "raw_score": 28, "max_score": 30, "percentage": 93.33, "passed": null }
}
```

`status` ∈ `active` | `not_yet_valid` | `redeemed` | `expired` | `revoked`. `session` is `null` until redeemed.

---

### 6.6 Quiz sessions (attempts & results)

#### `GET /api/v1/sessions` — `[results:read]`

List attempts across the org.

| Query | Notes |
|---|---|
| `quiz_id` | Any version of this quiz |
| `state` | `issued` \| `active` \| `submitted` \| `voided` \| `expired` \| `abandoned` |
| `school`, `agency` | Exact match on participant |
| `submitted_after`, `submitted_before` | ISO datetime |
| `min_percentage` | number |
| `passed` | `true` \| `false` |
| `sort` | `submitted_at` (default) \| `percentage` \| `duration_ms` |
| `order` | `desc` (default) \| `asc` |
| `limit`, `cursor` | Pagination (max 200) |

```json
{
  "data": [ { "session_id": "…", "participant_id": "…",
              "participant": { "personal_id": "…", "full_name": "…", "school": "…", "agency": null },
              "mode": "solo", "state": "submitted",
              "score": { "raw": 94, "max": 98, "percentage": 95.92, "passed": null, "correct": 25, "incorrect": 1, "unanswered": 0 },
              "timing": { "started_at": "…", "submitted_at": "…", "duration_ms": 3566000 },
              "integrity_flags": [] } ],
  "pagination": { "next_cursor": "…", "has_more": true, "limit": 50 }
}
```

#### `GET /api/v1/sessions/{session_id}` — `[results:read]`

One attempt in full, including `quiz`, `timing.time_limit_seconds` and every answer (`question_id`, `selected_option_id`, `numeric_response`, `is_correct`, `points_awarded`, `time_taken_ms`, `revision_count`, `displayed_at`, `answered_at`).

#### `POST /api/v1/sessions/{session_id}/void` — `[results:read]` **and** `[tokens:write]`

Invalidate an attempt (e.g. proven misconduct, technical fault). Body is optional: `{ "reason": "Duplicate account" }`. The session becomes `voided` and the reason is written to `integrity_flags`. Returns `204`; `409` if already voided.

---

### 6.7 Live rooms (host-controlled quizzes)

`POST /api/v1/rooms`, `GET /api/v1/rooms/{id}`, `POST /api/v1/rooms/{id}/advance|lock|end` exist for real-time hosted play and require the `rooms:write` scope. **That scope cannot currently be granted from the admin portal**, so these endpoints are not available to third parties yet. Contact the Quizzly team if you need live-room control.

---

## 7. Integration patterns

### Idempotent nightly sync of participants
1. `POST /participants/batch` with `"upsert": true` in chunks of ≤ 500.
2. Persist the returned `id` per `personal_id`; you will need the UUID for batch token issuance and for `/participants/{id}/results`. If you lose the mapping, `GET /participants/lookup?personal_id=…` recovers it.

### Registration form with duplicate detection
1. When a user submits your form, call `GET /participants/lookup?personal_id=…` (or `?email=…`).
2. If `exists` is `true`, show the existing record / offer to update via `POST /participants?upsert=true`; otherwise `POST /participants`.

### Scheduling a competition
1. Resolve `competition_session_id` and each `quiz_id` once (steps 2–3 of the Quickstart) and cache them.
2. For each participant × quiz, `POST /sessions/tokens` with `competition_session_id`, a sensible `expires_in` (cover the whole competition window) and, if needed, `not_before` set to the opening time so links can be distributed early but not used early.
3. Store `token_id` ↔ participant ↔ quiz in your database.

### Result collection
- **Push-style is not available (no webhooks yet).** Poll `GET /sessions?quiz_id=…&state=submitted&submitted_after=<last_sync>` on an interval; paginate with `cursor`.
- Or poll `GET /sessions/tokens/{token_id}` per outstanding token — fine for small cohorts.
- Detect no-shows: tokens whose `status` is still `active` after `expires_at` become `expired`; tokens `redeemed` but whose `session.state` never reaches `submitted` were abandoned mid-attempt.

### Re-issuing a login
Tokens are single-use. If a participant loses their link *before* redeeming, simply issue a new token (the old one expires naturally, or ask an admin to revoke it). If they have *already redeemed* it and need to restart, an admin must void the attempt first, then you issue a new token.

---

## 8. Security checklist

- Store API keys in a secrets manager or environment variable — never in source control, client-side code, or logs.
- Use a `qz_test_…` key against a staging org while developing; switch to `qz_live_…` for production.
- Grant the **minimum scopes** needed. A registration portal typically needs only `participants:write` + `tokens:write` + `tokens:read`; a read-only reporting job needs `participants:read` + `results:read`.
- Treat `start_url` and the 6-digit `token` as credentials: send them over authenticated channels (portal login, email to the registered address), never publish them in bulk.
- Set an expiry date on keys and rotate periodically.
- Handle `401` by alerting an operator (the key was revoked or expired) rather than retrying.
- Retry only on `5xx` and network errors, with exponential back-off.

---

## 9. Reference: enumerations

| Enum | Values |
|---|---|
| Token `status` | `active`, `not_yet_valid`, `redeemed`, `expired`, `revoked` |
| Quiz session `state` | `issued`, `active`, `submitted`, `voided` (also `expired`, `abandoned` — defined but not currently set automatically) |
| Session `mode` | `solo`, `live` |
| Competition `session_type` | `public`, `live_tournament`, `online_competition` |
| Quiz version `status` | `draft`, `published`, `archived` |
| Participant `gender` | `male`, `female`, `other`, `undisclosed` |
| Question `kind` (in answers) | `mcq_single`, `true_false`, `numeric` |

---

## 10. Support

- Endpoint list and a ready-made prompt for AI assistants: **Admin → Developers → API reference → "Copy AI prompt"**.
- For scope requests (`rooms:write`), webhooks, or higher batch limits, contact the Quizzly team.
