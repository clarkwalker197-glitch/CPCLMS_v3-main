"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  LayoutDashboard,
  BookOpen,
  BookOpenText,
  Users,
  ClipboardList,
  ScrollText,
  Shield,
  Archive,
  ChevronDown,
  UserRound,
  MoreHorizontal,
  X,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  {
    label: "Books",
    icon: BookOpen,
    children: [
      { href: "/books", label: "Physical Books", icon: BookOpen },
      { href: "/ebooks", label: "E-Books", icon: BookOpenText },
    ],
  },
  { href: "/members", label: "Members", icon: Users },
  { href: "/requests", label: "Borrow Requests", icon: ClipboardList },
  { href: "/activities", label: "Activity Logs", icon: ScrollText },
  { href: "/policies", label: "Policies", icon: Shield },
  { href: "/archive", label: "Archive", icon: Archive },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>(() => {
    // Auto-open parent if a child route is active on first render
    const booksActive =
      pathname === "/books" ||
      pathname.startsWith("/books/") ||
      pathname === "/ebooks" ||
      pathname.startsWith("/ebooks/");
    return { Books: booksActive };
  });

  const toggleMenu = (label: string) => {
    setOpenMenus((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const visibleNavItems = navItems.filter((item) => {
    if (user?.role === "LIBRARIAN") return true;
    return !["Members", "Activity Logs", "Archive"].includes(item.label);
  });

  const renderNav = () => (
    <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
      {visibleNavItems.map((item) => {
        const Icon = item.icon;
        const hasChildren = !!item.children;

        if (hasChildren) {
          const isOpen = !!openMenus[item.label];
          const childActive = item.children.some(
            (c: any) => pathname === c.href || pathname.startsWith(c.href + "/")
          );
          return (
            <div key={item.label}>
              <button
                onClick={() => toggleMenu(item.label)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${childActive ? "text-white" : "text-zinc-400 hover:bg-zinc-800 hover:text-white"}`}
                aria-expanded={isOpen}
              >
                <Icon className="w-5 h-5" />
                <span className="flex-1 text-left">{item.label}</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </button>
              {isOpen && (
                <div className="mt-1 mb-1 ml-4 pl-3 border-l border-zinc-800 space-y-0.5">
                  {item.children.map((child: any) => {
                    const ChildIcon = child.icon;
                    const isChildActive = pathname === child.href || pathname.startsWith(child.href + "/");
                    return (
                      <Link key={child.label} href={child.href} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${isChildActive ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30" : "text-zinc-400 hover:bg-zinc-800 hover:text-white"}`}>
                        <ChildIcon className="w-4 h-4" />
                        {child.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        }

        const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link key={item.label} href={item.href} className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${isActive ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30" : "text-zinc-400 hover:bg-zinc-800 hover:text-white"}`}>
            <Icon className="w-5 h-5" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900/60 sticky top-0 h-screen">
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-6 border-b border-zinc-800">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/CPClogo.png" alt="Cordova Public College Logo" className="w-11 h-11 object-contain" />
        <div>
          <p className="font-bold text-white leading-tight">Cordova Public College</p>
          <p className="text-xs text-blue-300">Library Management System</p>
        </div>
      </div>

      {renderNav()}

      {/* Footer */}
      <div className="px-6 py-5 border-t border-zinc-800">
        <p className="text-xs text-zinc-500">© 2026 Cordova Public College</p>
        <p className="text-xs text-zinc-600 mt-1">All rights reserved.</p>
      </div>
      </aside>

      <nav className="fixed inset-x-3 bottom-3 z-40 flex items-stretch justify-evenly gap-1 rounded-2xl border border-zinc-800 bg-zinc-900/95 p-2 shadow-2xl shadow-black/50 backdrop-blur lg:hidden" aria-label="Mobile navigation">
        {[
          { href: user?.role === "LIBRARIAN" ? "/dashboard" : "/student/dashboard", label: "Dashboard", icon: LayoutDashboard },
          { href: "/books", label: "Books", icon: BookOpen },
          { href: "/requests", label: "Borrow Requests", icon: ClipboardList },
        ].map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/") || (item.label === "Books" && pathname.startsWith("/ebooks"));
          return (
            <Link key={item.label} href={item.href} className={`flex min-w-0 flex-1 flex-col items-center justify-start gap-1 rounded-xl px-0.5 py-2 text-[10px] font-medium leading-3 transition-colors ${isActive ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30" : "text-zinc-400 hover:bg-zinc-800 hover:text-white"}`}>
              <Icon className="h-5 w-5 shrink-0" />
              <span className="flex min-h-6 w-full items-start justify-center whitespace-normal text-center">{item.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-expanded={moreOpen}
          aria-controls="mobile-more-menu"
          className={`relative flex min-w-0 flex-1 flex-col items-center justify-start gap-1 rounded-xl px-0.5 py-2 text-[10px] font-medium leading-3 transition-colors ${moreOpen || ["/members", "/archive", "/activities", "/policies", "/profile"].some((href) => pathname === href || pathname.startsWith(href + "/")) ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30" : "text-zinc-400 hover:bg-zinc-800 hover:text-white"}`}
        >
          <MoreHorizontal className="h-5 w-5 shrink-0" />
          <span className="flex min-h-6 w-full items-start justify-center whitespace-normal text-center">More</span>
          {!moreOpen && ["/members", "/archive", "/activities", "/policies", "/profile"].some((href) => pathname === href || pathname.startsWith(href + "/")) && (
            <span className="absolute right-2 top-1 h-1.5 w-1.5 rounded-full bg-white" aria-hidden="true" />
          )}
        </button>
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-labelledby="mobile-more-title">
          <button
            type="button"
            aria-label="Close more menu"
            onClick={() => setMoreOpen(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
          />
          <div id="mobile-more-menu" className="mobile-more-sheet absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-zinc-700 bg-zinc-900 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl shadow-black/60">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p id="mobile-more-title" className="text-lg font-semibold text-white">More</p>
                <p className="text-sm text-zinc-500">Library workspace</p>
              </div>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                aria-label="Close more menu"
                className="rounded-xl p-2 text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-1">
              {(user?.role === "LIBRARIAN"
                ? [
                    { href: "/members", label: "Members", icon: Users },
                    { href: "/archive", label: "Archive", icon: Archive },
                    { href: "/activities", label: "Activity Logs", icon: ScrollText },
                    { href: "/policies", label: "Policies", icon: Shield },
                    { href: "/profile", label: "Profile", icon: UserRound },
                  ]
                : [
                    { href: "/policies", label: "Policies", icon: Shield },
                    { href: "/profile", label: "Profile", icon: UserRound },
                  ]
              ).map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    className={`flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-sm font-medium transition-colors ${isActive ? "bg-blue-600 text-white" : "text-zinc-300 hover:bg-zinc-800 hover:text-white"}`}
                  >
                    <Icon className="h-5 w-5" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
