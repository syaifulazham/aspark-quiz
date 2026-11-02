/** URL value used for participants whose country is not set. */
export const NO_COUNTRY = "none";

const regionNames =
  typeof Intl !== "undefined" && "DisplayNames" in Intl
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null;

/** English country name for an ISO 3166-1 alpha-2 code, or the code itself if unknown. */
export function countryName(code: string) {
  try {
    const name = regionNames?.of(code.toUpperCase());
    return name && name !== code ? name : code;
  } catch {
    return code;
  }
}

/** "MY · Malaysia" for dropdowns; "Not set" for participants without a country. */
export function countryLabel(code: string) {
  if (code === NO_COUNTRY) return "Not set";
  const name = countryName(code);
  return name !== code ? `${code} · ${name}` : code;
}

export function normalizeCountry(nationality: string | null | undefined) {
  return nationality?.trim() || NO_COUNTRY;
}
