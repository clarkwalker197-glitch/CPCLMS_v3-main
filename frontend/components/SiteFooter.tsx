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
    <footer
      className={`hidden w-full shrink-0 border-t border-zinc-800 bg-zinc-950 text-zinc-400 lg:block ${
        hasDesktopSidebar ? "lg:hidden" : ""
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-center px-4 py-6 sm:px-6 lg:px-8">
        <p className="text-center text-xs text-zinc-500">
          © 2026 Cordova Public College. All rights reserved.
        </p>
      </div>
    </footer>
  );
}