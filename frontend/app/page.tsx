"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { ArrowRight, BarChart3, BookOpen, QrCode, Send } from "lucide-react";

const features = [
  { title: "QR-Based Borrowing", description: "Approve and confirm borrow requests quickly with secure QR codes.", icon: QrCode },
  { title: "Borrow Requests & Approvals", description: "Track incoming requests and manage approvals from one workspace.", icon: Send },
  { title: "Real-Time Dashboard & Analytics", description: "See circulation activity, trends, overdue items, and key library metrics.", icon: BarChart3 },
  { title: "E-Books and Physical Books", description: "Manage the complete collection across digital and physical formats.", icon: BookOpen },
];

export default function Home() {
  const { isAuthenticated, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && isAuthenticated) router.replace("/dashboard");
  }, [loading, isAuthenticated, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="relative overflow-hidden border-b border-zinc-800">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.18),transparent_42%),radial-gradient(circle_at_bottom_left,rgba(14,165,233,0.08),transparent_36%)]" />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <nav className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/CPClogo.png" alt="Cordova Public College Logo" className="w-11 h-11 object-contain" />
              <div>
                <p className="font-bold text-white leading-tight">Cordova Public College</p>
                <p className="text-xs text-blue-300">Library Management System</p>
              </div>
            </div>
            <Link href="/login" className="text-sm font-medium text-zinc-300 hover:text-white transition-colors">Sign In</Link>
          </nav>

          <div className="max-w-4xl py-24 sm:py-32">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/25 bg-blue-500/10 px-3 py-1.5 text-xs font-medium text-blue-300 mb-6">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
              Connected library operations
            </div>
            <h1 className="text-4xl sm:text-6xl font-bold tracking-tight leading-tight text-white">Cordova Public College <br></br> Library System</h1>
            <p className="mt-6 max-w-2xl text-base sm:text-lg leading-8 text-zinc-400">A modern library workspace for discovering books, managing borrow requests, coordinating approvals, and keeping academic resources accessible.</p>
            <div className="mt-9 flex flex-col sm:flex-row gap-3">
              <Link href="/login" className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition-colors">Sign In <ArrowRight className="w-4 h-4" /></Link>
              <Link href="/register" className="inline-flex items-center justify-center rounded-xl border border-zinc-700 bg-zinc-900/70 px-5 py-3 text-sm font-semibold text-zinc-200 hover:bg-zinc-800 hover:text-white transition-colors">Create Account</Link>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-400">System capabilities</p>
            <h2 className="mt-2 text-2xl sm:text-3xl font-bold text-white">Everything the library team needs</h2>
          </div>
          <p className="max-w-md text-sm leading-6 text-zinc-500">One place for librarians, students, and faculty to keep borrowing simple and visible.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <article key={feature.title} className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5 hover:border-blue-500/40 hover:bg-zinc-900 transition-colors">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center mb-5"><Icon className="w-5 h-5" /></div>
                <h3 className="font-semibold text-white">{feature.title}</h3>
                <p className="mt-2 text-sm leading-6 text-zinc-500">{feature.description}</p>
              </article>
            );
          })}
        </div>

        {/* Developers Section */}
        <section className="mt-20 sm:mt-24">
          <div className="text-center mb-10">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-400">
              The Team
            </p>
            <h2 className="mt-2 text-2xl sm:text-3xl font-bold text-white">
              Developers behind this system
            </h2>
            <p className="mt-3 max-w-xl mx-auto text-sm text-zinc-500">
              Built with care by the developers of Cordova Public College Library System.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {/* Example Developer Cards - replace with real names */}
            <div className="min-h-[260px] rounded-2xl border border-zinc-800 bg-zinc-900/70 p-8 text-center flex flex-col items-center justify-center hover:border-blue-500/40 transition-colors">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/sekey1.jpg"
                alt="Clark Kent Periño"
                className="w-24 h-24 rounded-full object-cover mx-auto mb-6 ring-1 ring-blue-500/20"
              />
              <h3 className="text-lg font-semibold text-white">Clark Kent Periño</h3>
              <p className="text-base text-zinc-500 mt-2">Full-stack Developer / Project Manager</p>
            </div>

            <div className="min-h-[260px] rounded-2xl border border-zinc-800 bg-zinc-900/70 p-8 text-center flex flex-col items-center justify-center hover:border-blue-500/40 transition-colors">
              <img
                src="/desay.jpg"
                alt="Desi Marie Birondo"
                className="w-24 h-24 rounded-full object-cover mx-auto mb-6 ring-1 ring-blue-500/20"
              />
              <h3 className="text-lg font-semibold text-white">Desi Marie Birondo</h3>
              <p className="text-base text-zinc-500 mt-2">Documentation Specialist</p>
            </div>

            <div className="min-h-[260px] rounded-2xl border border-zinc-800 bg-zinc-900/70 p-8 text-center flex flex-col items-center justify-center hover:border-blue-500/40 transition-colors">
              <img
                src="/aple.jpg"
                alt="Apple Jean Cabardo"
                className="w-24 h-24 rounded-full object-cover mx-auto mb-6 ring-1 ring-blue-500/20"
              />
              <h3 className="text-lg font-semibold text-white">Apple Jean Cabardo</h3>
              <p className="text-base text-zinc-500 mt-2">Documentation Specialist</p>
            </div>

            <div className="min-h-[260px] rounded-2xl border border-zinc-800 bg-zinc-900/70 p-8 text-center flex flex-col items-center justify-center hover:border-blue-500/40 transition-colors">
              <img
                src="/mel.jpg"
                alt="Melecio Paes"
                className="w-24 h-24 rounded-full object-cover mx-auto mb-6 ring-1 ring-blue-500/20"
              />
              <h3 className="text-lg font-semibold text-white">Melecio Paes</h3>
              <p className="text-base text-zinc-500 mt-2">Full Developer</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-800 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2 text-sm text-zinc-500">
          <p>© {new Date().getFullYear()} Cordova Public College Library</p>
          <p>Library Management System</p>
        </div>
      </footer>
    </div>
  );
}
