export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function toNumber(value) {
  const cleaned = String(value || "").replace(/[$,%\s]/g, "").replace(/,/g, "");
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : 0;
}

export function hasAny(text, words) {
  const haystack = String(text || "").toLowerCase();
  return words.some((word) => haystack.includes(String(word).toLowerCase()));
}

export function makeId(keyword, index = 0) {
  return `${String(keyword || "keyword")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}-${index}`;
}

export function slugify(keyword) {
  return String(keyword || "seo-page")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function titleCase(text) {
  return String(text || "").replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}
