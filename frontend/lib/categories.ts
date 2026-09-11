export const LIBRARY_CATEGORIES = [
  { name: "Generalities", slug: "generalities", range: [1, 99] as const },
  { name: "Philosophy", slug: "philosophy", range: [100, 199] as const },
  { name: "Religion", slug: "religion", range: [200, 299] as const },
  { name: "Filipiniana", slug: "filipiniana", range: null },
  { name: "Social Science", slug: "social-science", range: [300, 399] as const },
  { name: "Languages", slug: "languages", range: [400, 499] as const },
  { name: "Natural Science", slug: "natural-science", range: [500, 599] as const },
  { name: "Applied Science", slug: "applied-science", range: [600, 699] as const },
  { name: "Arts and Recreation", slug: "arts-and-recreation", range: [700, 799] as const },
  { name: "Literature", slug: "literature", range: [800, 899] as const },
  { name: "Geography and History", slug: "geography-and-history", range: [900, 999] as const },
  { name: "Biology and Collective Biography", slug: "biology-and-collective-biography", range: null },
] as const;

export function normalizeClassificationNumber(value: string): string | null {
  if (!/^\d{1,3}$/.test(value)) return null;
  const number = Number(value);
  return number >= 1 && number <= 999 ? String(number).padStart(3, "0") : null;
}

export function categoryForClassification(value: string) {
  const normalized = normalizeClassificationNumber(value);
  if (!normalized) return null;
  const number = Number(normalized);
  return LIBRARY_CATEGORIES.find((category) => category.range && number >= category.range[0] && number <= category.range[1]) || null;
}
