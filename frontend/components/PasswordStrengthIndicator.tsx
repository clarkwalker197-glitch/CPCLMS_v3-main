import { analyzePassword } from "@/lib/password-strength";

export default function PasswordStrengthIndicator({ password }: { password: string }) {
  const status = analyzePassword(password);
  const textColor = status.level === "Strong"
    ? "text-emerald-400"
    : status.level === "Medium"
      ? "text-amber-400"
      : status.level === "Weak"
        ? "text-red-400"
        : "text-zinc-500";
  const barColor = status.level === "Strong"
    ? "bg-emerald-500"
    : status.level === "Medium"
  const passwordStatus = analyzePassword(password);
  const levelColor = passwordStatus.level === "Strong"
    ? "text-emerald-400"
    : passwordStatus.level === "Medium"
      ? "text-amber-400"
      : passwordStatus.level === "Weak"
        ? "text-red-400"
        : "text-zinc-500";
  const segmentColor = passwordStatus.level === "Strong"
    ? "bg-emerald-500"
    : passwordStatus.level === "Medium"
      ? "bg-amber-500"
      : "bg-red-500";

  return (
    <div className="mt-2 space-y-1.5" aria-live="polite">
      <div className="flex items-center justify-between text-xs">
        <span className="text-zinc-500">Password strength</span>
        <span className={textColor}>{status.level || "Enter a password"}</span>
        <span className={levelColor}>{passwordStatus.level || "Enter a password"}</span>
      </div>
      <div
        className="grid grid-cols-3 gap-1"
        role="meter"
        aria-label="Password strength"
        aria-valuemin={0}
        aria-valuemax={3}
        aria-valuenow={status.score}
        aria-valuenow={passwordStatus.score}
      >
        {[0, 1, 2].map((segment) => (
          <span
            key={segment}
            className={`h-1 rounded-full ${segment < status.score ? barColor : "bg-zinc-800"}`}
            className={`h-1 rounded-full ${segment < passwordStatus.score ? segmentColor : "bg-zinc-800"}`}
          />
        ))}
      </div>
      <p className="text-xs text-zinc-500">
        Use at least 8 characters and combine at least two: letters, numbers, or symbols.
      </p>
    </div>
  );
}
