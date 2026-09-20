export const COUNTRIES_PARAM = "countries";

export function parseCountries(raw: string | undefined | null): string[] {
  return (raw ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
}
