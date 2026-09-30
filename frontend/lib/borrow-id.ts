export function normalizeBorrowId(input: string): string | null {
  let value = input.trim();

  try {
    const url = new URL(value, "http://borrow-id.local");
    value = url.searchParams.get("transactionId") || url.searchParams.get("borrowId") || value;
  } catch {
    // Treat non-URL scanner input as a Borrow ID.
  }

  const normalized = value.trim().toUpperCase();
  if (/^\d{8}$/.test(normalized)) return normalized;

  const formatted = /^BRW-(\d{4})-(\d{4})$/.exec(normalized);
  return formatted ? `${formatted[1]}${formatted[2]}` : null;
}

export function formatBorrowId(input: string): string {
  const transactionId = normalizeBorrowId(input);
  return transactionId
    ? `BRW-${transactionId.slice(0, 4)}-${transactionId.slice(4)}`
    : input;
}