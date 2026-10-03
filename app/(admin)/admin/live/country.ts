/** URL value used for participants whose country is not set. */
export const NO_COUNTRY = "none";

const regionNames =
  typeof Intl !== "undefined" && "DisplayNames" in Intl
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null;

export function countryLabel(code: string) {
  if (code === NO_COUNTRY) return "Not set";
  try {
    const name = regionNames?.of(code.toUpperCase());
    return name && name !== code ? `${code} · ${name}` : code;
  } catch {
    return code;
  }
}

export function normalizeCountry(nationality: string | null | undefined) {
  return nationality?.trim() || NO_COUNTRY;
}
