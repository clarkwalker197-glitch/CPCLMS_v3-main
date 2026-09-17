const NAME_PATTERN = /^\p{L}+(?:[ '\u2019-]\p{L}+)*$/u;

export function sanitizeNameInput(value: string): string {
  return value.replace(/[^\p{L}' \u2019-]/gu, '');
}

export function isValidName(value: string): boolean {
  return NAME_PATTERN.test(value.trim());
}

export function nameValidationMessage(label: string): string {
  return `${label} can only contain letters, spaces, hyphens, and apostrophes.`;
}