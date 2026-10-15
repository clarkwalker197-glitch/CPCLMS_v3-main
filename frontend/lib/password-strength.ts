export type PasswordStrengthLevel = "Weak" | "Medium" | "Strong";

export function analyzePassword(password: string) {
  const categories = [
    /[A-Za-z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9\s]/.test(password),
  ].filter(Boolean).length;
  const meetsRequirements = password.length >= 8 && categories >= 2;
  const level: PasswordStrengthLevel | null = !password
    ? null
    : !meetsRequirements
      ? "Weak"
      : password.length >= 12 && categories === 3
        ? "Strong"
        : "Medium";

  return {
    level,
    score: level === "Strong" ? 3 : level === "Medium" ? 2 : level === "Weak" ? 1 : 0,
    meetsRequirements,
  };
}
