interface Embedded {
  token?:
    | { competition_session: { id: string; title: string; slug: string } | null }
    | Array<{ competition_session: { id: string; title: string; slug: string } | null }>
    | null;
}

/** The competition session an attempt belongs to, from a `token:session_tokens(competition_session:...)` embed. */
export function competitionSessionOf(row: unknown) {
  const token = (row as Embedded).token;
  const t = Array.isArray(token) ? token[0] : token;
  return t?.competition_session ?? null;
}

/** PostgREST select fragment that embeds the attempt's competition session via its login code. */
export function competitionSessionEmbed(inner: boolean) {
  return `token:session_tokens${inner ? "!inner" : ""}(competition_session_id, competition_session:competition_sessions(id, title, slug))`;
}
