# Partner Integration — Action Items

For the teams running integrations against the Quizzly API (API keys `aspark-quiz-3` and `MT-2026`).
Full API reference: [`QUIZZLY-API_GUIDE.md`](./QUIZZLY-API_GUIDE.md).

All Quizzly changes below are **backwards compatible**: existing calls keep working and every code already sent to a student stays valid. Nothing breaks if you change nothing — but the problems in section 1 will keep happening until the items in section 2 are done.

---

## 1. What we observed in production (as of 3 Oct 2026)

| # | Issue | Impact |
|---|---|---|
| 1 | **Codes issued into several sessions for the same student.** When a quiz is used by more than one competition session (e.g. *Online Qualifying Round Vietnam* and *Bangladesh Round* share the same quiz versions), a code was created in **each** session within seconds — e.g. Vietnamese students received Bangladesh Round codes, and every Bangladeshi student received codes in the Vietnam session and the main round. | Students hold valid logins for rounds they don't belong to; their result is recorded under whichever round they open. Per-session results, stats and leaderboards include the wrong students. 43 such unused codes were revoked by the Quizzly team on 3 Oct. |
| 2 | **Several unused codes for the same student, session and quiz.** e.g. 305 student/quiz pairs in *Online Qualifying Round* hold 2+ unused codes at once. | Confusing for students and support ("which code is mine?"); inflates "issued" counts. |
| 3 | **Codes expire before the round opens.** `aspark-quiz-3` uses the default `expires_in` of 24h, and codes were issued days before the round (Vietnam round: all codes had expired at opening; Bangladesh Round on 7 Oct has the same problem). 83% of `aspark-quiz-3` codes expired unused. | Students cannot log in. The Quizzly team manually extended the Vietnam codes on 3 Oct. |
| 4 | **Code status is never checked.** `aspark-quiz-3` does not have the `tokens:read` scope, so it cannot ask Quizzly whether a code is still valid; it appears to rely on the expiry it stored at issue time. | After the Quizzly team extended codes, the partner app may still have shown them as expired. |
| 5 | **Duplicate student records.** The same student exists twice with different `personal_id`s (e.g. `ASC26127` and `ASCVN26127`), each with their own codes. | Results split across two records; counts and searches show the student twice. |

---

## 2. Required changes

### 2.1 Issue each code for the student's OWN session only — use `session_quiz_set_id`  *(fixes #1)*

A quiz is unique **within a session**. Identify it with `session_quiz_set_id`, which you get per session from:

```http
GET /api/v1/competition-sessions/{session_id}/quizzes
```

```json
{ "data": [ { "session_quiz_set_id": "…", "quiz": { "id": "…", "title": "Online English Grade 5" }, "version": 1 } ] }
```

Then issue **one** code, in the student's session only:

```http
POST /api/v1/sessions/tokens
{ "personal_id": "ASCVN26122", "session_quiz_set_id": "<from the student's own session>", "expires_in": 2592000 }
```

**Do not** look up "every session that contains this quiz" and issue a code in each. Decide the session from the student (their country / round), then pick the quiz inside that session.

Batch works the same way:

```http
POST /api/v1/sessions/tokens/batch
{ "tokens": [ { "participant_id": "<uuid>", "session_quiz_set_id": "<uuid>", "expires_in": 2592000 } ] }
```

> If you keep sending `quiz_id` + `competition_session_id`, that still works and is equivalent — just make sure `competition_session_id` is the student's own round.
> If a request has **no** session at all, the code is still issued but the response now carries
> `"warnings": [{ "code": "no_competition_session", … }]` — treat that as a bug in your request.

### 2.2 Make codes last until the round closes  *(fixes #3)*

Send `expires_in` so the code is valid until the session's `closes_at` (returned by `GET /api/v1/competition-sessions`), not the 24h default:

```
expires_in = seconds from now until closes_at   (min 60, max 2 592 000 = 30 days)
```

If you issue codes before a round opens, also set `not_before` to the round's `opens_at` so links can be sent early but not used early.

### 2.3 Don't create a new code if the student already has a working one  *(fixes #2)*

Before issuing, check the student's existing code for that session quiz:

- **Valid and unused** → re-send the code/link you already have. Do not issue another.
- **Expired and unused** (`status: "expired"`) → issue a new one.
- **Used** (`status: "redeemed"`) → do not issue; the student has already started/finished.
- **Revoked** → do not issue; an admin revoked it on purpose. Contact the Quizzly admin.

Use the batch status endpoint (needs `tokens:read`, see 2.4):

```http
POST /api/v1/sessions/tokens/status
{ "token_ids": ["…", "…"] }
```

### 2.4 Read code status from Quizzly, not from your stored expiry  *(fixes #4)*

- Ask the Quizzly admin to add the **`tokens:read`** scope to the `aspark-quiz-3` key (or create a new key with it).
- Whenever you display "valid / expired / used" to a student or admin, get it from `GET /api/v1/sessions/tokens/{token_id}` or `POST /api/v1/sessions/tokens/status`. Expiry can be changed by Quizzly admins (e.g. extended for a whole round), so a stored `expires_at` goes stale.

### 2.5 One record per student  *(fixes #5)*

- Keep one stable `personal_id` per student across rounds.
- Before registering, call `GET /api/v1/participants/lookup?personal_id=…` (or `?email=…`) and reuse the existing record; use `POST /api/v1/participants?upsert=true` to update details.
- Send the Quizzly team the list of old/new ID pairs (e.g. `ASC26127` → `ASCVN26127`) so duplicate records can be merged.

### 2.6 Read results per session  *(recommended)*

Results now carry the session and can be filtered by it:

```http
GET /api/v1/sessions?competition_session_id=<id>&state=submitted&submitted_after=<last_sync>
GET /api/v1/participants/{id}/results?competition_session_id=<id>
GET /api/v1/quizzes/{quiz_id}/leaderboard?competition_session_id=<id>
```

Each result includes `"competition_session": { "id", "title", "slug" }`. Without `competition_session_id`, a quiz shared by several sessions returns results from all of them.

---

## 3. Checklist

- [ ] Code requests send `session_quiz_set_id` (or `quiz_id` + the student's own `competition_session_id`) — never a code per session that contains the quiz
- [ ] Responses with `warnings: no_competition_session` are logged and fixed
- [ ] `expires_in` covers the round until `closes_at`; `not_before` set when issuing before `opens_at`
- [ ] No new code while the student has a valid unused one for the same session quiz
- [ ] `tokens:read` scope added to the key; code status read from Quizzly
- [ ] One `personal_id` per student; old/new ID pairs sent to the Quizzly team
- [ ] Results fetched with `competition_session_id`

## 4. Urgent before 7 Oct 2026 — Bangladesh Round (11:00–13:00 UTC)

The Bangladeshi students' Bangladesh Round codes have already expired. Either:
- re-issue them with `session_quiz_set_id` from the **Bangladesh Round** and `expires_in` covering 7 Oct 13:00 UTC, **or**
- ask the Quizzly admin to extend the existing codes (they can also regenerate individual codes from **Admin → Live**).

Do **not** issue Bangladesh students codes in any other session.

## 5. Contact

Questions about these changes, scopes or data clean-up: the Quizzly admin team.
