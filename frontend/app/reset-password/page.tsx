"use client";

import { FormEvent, Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import api from "@/lib/api";

function ResetPasswordForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!token) return setError("This password reset link is invalid or expired.");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirmPassword) return setError("Passwords do not match.");
    setSubmitting(true);
    try {
      const result = await api.resetPassword(token, password);
      if (result.success) router.replace("/login?reset=success");
      else setError(result.error || "This password reset link is invalid or expired.");
    } catch (requestError: any) {
      setError(requestError?.message || "Unable to reset password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-4">
      <section className="w-full max-w-md rounded-3xl border border-zinc-800 bg-zinc-900 p-8 sm:p-10 shadow-2xl shadow-black/40">
        <div className="flex flex-col items-center text-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/CPClogo.png" alt="Cordova Public College Logo" className="w-20 h-20 object-contain mb-4" />
          <h1 className="text-3xl font-bold text-white">Reset Password</h1>
          <p className="text-zinc-400 mt-2 text-sm">Choose a new password for your library account.</p>
        </div>
        {error && <div className="p-3 mb-4 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-400">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div><label htmlFor="password" className="block text-sm font-medium text-zinc-300 mb-1.5">New Password</label><input id="password" type="password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} className="w-full px-3 py-3 bg-zinc-950 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
          <div><label htmlFor="confirmPassword" className="block text-sm font-medium text-zinc-300 mb-1.5">Confirm New Password</label><input id="confirmPassword" type="password" required minLength={8} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="w-full px-3 py-3 bg-zinc-950 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500" /></div>
          <button disabled={submitting} className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl disabled:opacity-50">{submitting ? "Resetting..." : "Reset Password"}</button>
        </form>
        <Link href="/login" className="block text-center text-sm text-blue-400 hover:text-blue-300 mt-6">Back to Login</Link>
      </section>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-zinc-950" />}>
      <ResetPasswordForm />
    </Suspense>
  );
}