"use client";

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
    <footer className={`w-full shrink-0 border-t border-zinc-800 bg-zinc-950 px-4 py-5 text-center text-xs text-zinc-500 ${hasDesktopSidebar ? "lg:hidden" : ""}`}>
      © 2026 Cordova Public College. All rights reserved.
    </footer>
  );
}