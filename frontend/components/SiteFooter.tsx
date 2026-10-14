"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

const sidebarRoutes = [
  "/acquisition-requests",
  "/activities",
  "/analytics",
  "/archive",
  "/books",
  "/dashboard",
  "/ebooks",
  "/faq",
  "/members",
  "/policies",
  "/profile",
  "/requests",
  "/student/dashboard",
  "/suggestions",
  "/transactions/lookup",
];

export default function SiteFooter() {
  const pathname = usePathname();
  const { isAuthenticated } = useAuth();
  const hasDesktopSidebar = isAuthenticated && sidebarRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );

  return (
    <footer
      className={`w-full shrink-0 border-t border-zinc-800 bg-zinc-950 text-zinc-400 ${
        hasDesktopSidebar ? "lg:hidden" : ""
      }`}
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
        <div className="flex items-center justify-center gap-3 lg:justify-start">
          <img src="/CPClogo.png" alt="Cordova Public College Logo" className="h-9 w-9 object-contain" />
          <div className="text-left">
            <p className="text-sm font-semibold text-white">Cordova Public College</p>
            <p className="text-xs text-zinc-500">Library Management System</p>
          </div>
        </div>

        <nav aria-label="Footer navigation" className="flex flex-wrap items-center justify-center gap-4 text-xs sm:text-sm">
          <Link href="/" className="transition hover:text-white">Home</Link>
          <Link href="/login" className="transition hover:text-white">Login</Link>
          <Link href="/register" className="transition hover:text-white">Register</Link>
        </nav>

        <p className="text-center text-xs text-zinc-500 lg:text-right">
          © 2026 Cordova Public College. All rights reserved.
        </p>
      </div>
    </footer>
  );
}