"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import PasswordStrengthIndicator from "@/components/PasswordStrengthIndicator";
import { analyzePassword } from "@/lib/password-strength";

type Step = "request" | "verify" | "reset";

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");
  const [resendAvailableAt, setResendAvailableAt] = useState("");
  const [clock, setClock] = useState(0);

  useEffect(() => {
    if (step !== "verify") return;
    const interval = window.setInterval(() => setClock(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [step]);

  const secondsUntilExpiry = Math.max(0, Math.ceil((Date.parse(expiresAt) - clock) / 1000));
  const secondsUntilResend = Math.max(0, Math.ceil((Date.parse(resendAvailableAt) - clock) / 1000));

  const submitRequest = async (event: FormEvent) => {
    event.preventDefault(); setError(""); setMessage(""); setSubmitting(true);
    try {
      const result = await api.forgotPassword(email.trim());
      if (result.success && result.data?.expiresAt && result.data?.resendAvailableAt) {
        setEmail(result.data.email || email.trim());
        setExpiresAt(result.data.expiresAt);
        setResendAvailableAt(result.data.resendAvailableAt);
        setClock(Date.now());
        setStep("verify");
      }
      else if (result.success) setError("Unable to start verification. Please try again.");
      else setError(result.error || "User account not found.");
    } catch (requestError: unknown) { setError(getErrorMessage(requestError, "Unable to request a password reset.")); }
    finally { setSubmitting(false); }
  };

  const verifyCode = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    if (!/^\d{6}$/.test(code)) { setError("Enter the 6-digit verification code."); return; }
    if (Date.now() >= Date.parse(expiresAt)) {
      setError("That code has expired. Request a new one.");
      return;
    }
    setSubmitting(true);
    try {
      const result = await api.verifyPasswordReset(email, code);
      if (result.success) { setResetToken(result.data?.resetToken || ""); setStep("reset"); }
      else setError(result.error || "Invalid or expired verification code.");
    } catch (requestError: unknown) { setError(getErrorMessage(requestError, "Unable to verify code.")); }
    finally { setSubmitting(false); }
  };

  const resetPassword = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    if (!analyzePassword(password).meetsRequirements) {
      setError("Password must be at least 8 characters and include at least two of letters, numbers, or symbols.");
      return;
    }
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }
    setSubmitting(true);
    try {
      const result = await api.resetPassword(resetToken, password);
      if (result.success) router.replace("/login?reset=success");
      else setError(result.error || "This reset session is invalid or expired.");
    } catch (requestError: unknown) { setError(getErrorMessage(requestError, "Unable to reset password.")); }
    finally { setSubmitting(false); }
  };

  const resend = async () => {
    if (Date.now() < Date.parse(resendAvailableAt)) return;
    setCode(""); setError(""); setMessage(""); setSubmitting(true);
    try {
      const result = await api.forgotPassword(email);
      if (result.success && result.data?.expiresAt && result.data?.resendAvailableAt) {
        setExpiresAt(result.data.expiresAt);
        setResendAvailableAt(result.data.resendAvailableAt);
        setClock(Date.now());
        setMessage("A new verification code has been sent.");
      }
      else if (result.success) setError("Unable to update verification. Please try again.");
      else setError(result.error || "Unable to resend code.");
    } catch (requestError: unknown) { setError(getErrorMessage(requestError, "Unable to resend code.")); }
    finally { setSubmitting(false); }
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-4">
      <section className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-900 p-8 sm:p-10 shadow-2xl shadow-black/40">
        <div className="flex flex-col items-center text-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/CPClogo.png" alt="Cordova Public College Logo" className="w-20 h-20 object-contain mb-4" />
          <h1 className="text-3xl font-bold text-white">{step === "request" ? "Forgot Password?" : step === "verify" ? "Check your email" : "Set a new password"}</h1>
          <p className="text-zinc-400 mt-2 text-sm">{step === "request" ? "Enter your registered email to receive a verification code." : step === "verify" ? `We sent a 6-digit code to ${email}.` : "Your code is verified. Choose a new password."}</p>
        </div>
        {error && <div className="p-3 mb-4 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-400">{error}</div>}
        {message && <div className="p-3 mb-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-sm text-emerald-400">{message}</div>}
        {step === "request" && <form onSubmit={submitRequest} className="space-y-5"><div><label htmlFor="email" className="block text-sm font-medium text-zinc-300 mb-1.5">Registered Email</label><input id="email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="w-full px-3 py-3 bg-zinc-950 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="name@example.com" /></div><button disabled={submitting} className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl disabled:opacity-50">{submitting ? "Sending..." : "Send Verification Code"}</button></form>}
        {step === "verify" && (
          <form onSubmit={verifyCode} className="space-y-5">
            <div>
              <label htmlFor="code" className="block text-sm font-medium text-zinc-300 mb-1.5">Verification Code</label>
              <input id="code" inputMode="numeric" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} className="w-full px-3 py-3 bg-zinc-950 border border-zinc-700 rounded-xl text-white text-center tracking-[0.5em] text-xl focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="000000" />
              <p aria-live="polite" className="mt-2 text-sm text-zinc-400">
                {secondsUntilExpiry > 0 ? `Code expires in ${formatCountdown(secondsUntilExpiry)}` : "Code expired."}
              </p>
            </div>
            <button disabled={submitting || secondsUntilExpiry === 0} className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl disabled:opacity-50">{submitting ? "Verifying..." : "Verify"}</button>
            <button type="button" onClick={resend} disabled={submitting || secondsUntilResend > 0} className="w-full text-sm text-blue-400 hover:text-blue-300 disabled:opacity-50">
              Didn&apos;t get a code? {secondsUntilResend > 0 ? `Resend in ${formatCountdown(secondsUntilResend)}` : "Resend"}
            </button>
          </form>
        )}
        {step === "reset" && (
          <form onSubmit={resetPassword} className="space-y-5">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-zinc-300 mb-1.5">New Password</label>
              <input id="password" type="password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} className="w-full px-3 py-3 bg-zinc-950 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <PasswordStrengthIndicator password={password} />
            </div>
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-zinc-300 mb-1.5">Confirm New Password</label>
              <input id="confirmPassword" type="password" minLength={8} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="w-full px-3 py-3 bg-zinc-950 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <button disabled={submitting} className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl disabled:opacity-50">{submitting ? "Saving..." : "Reset Password"}</button>
          </form>
        )}
        <Link href="/login" className="block text-center text-sm text-blue-400 hover:text-blue-300 mt-6">Back to Login</Link>
      </section>
    </main>
  );
}
