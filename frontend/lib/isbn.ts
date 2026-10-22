export function sanitizeIsbnInput(value: string): string {
  return value.replace(/[^0-9-]/g, "");
}
