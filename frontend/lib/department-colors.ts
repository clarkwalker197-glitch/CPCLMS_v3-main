export const DEPARTMENT_COLORS: Record<string, string> = {
  BSIT: "#FACC15",
  BSHM: "#F97316",
  BSED: "#3B82F6",
  BEED: "#22D3EE",
};

export const FALLBACK_DEPARTMENT_COLOR = "#94A3B8";

export function getDepartmentColor(code?: string | null): string {
  if (!code) return FALLBACK_DEPARTMENT_COLOR;
  return DEPARTMENT_COLORS[code.toUpperCase()] || FALLBACK_DEPARTMENT_COLOR;
}
