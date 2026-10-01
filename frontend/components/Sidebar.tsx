"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { ModalLayer } from "@/components/ModalLayer";
import {
  LayoutDashboard,
  BookOpen,
  BookOpenText,
  Users,
  ClipboardList,
  ScrollText,
  Shield,
  Archive,
  BarChart3,
  ChevronDown,
  UserRound,
  MoreHorizontal,
  X,
  HelpCircle,
  MessageSquare,
  LibraryBig,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/analytics", label: "Report", icon: BarChart3, librarianOnly: true },
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
  { href: "/reservations", label: "Reservations", icon: BookOpenText },
  { href: "/faq", label: "FAQ", icon: HelpCircle },
  { href: "/suggestions", label: "Suggestions", icon: MessageSquare },
  { href: "/acquisition-requests", label: "Request a Book", icon: LibraryBig },
  { href: "/activities", label: "Activity Logs", icon: ScrollText },
  { href: "/policies", label: "Policies", icon: Shield },
  { href: "/archive", label: "Archive", icon: Archive },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(false);
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
    if (item.librarianOnly && user?.role !== "LIBRARIAN") return false;
    if (user?.role === "LIBRARIAN") return true;
    return !["Members", "Activity Logs", "Archive"].includes(item.label);
  });

  const renderNav = () => (
    <nav className="flex-1 overflow-y-auto px-3 py-6 space-y-1.5 transition-[padding] duration-300 ease-in-out">
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
                onClick={() => {
                  if (isCollapsed) {
                    setIsCollapsed(false);
                    setOpenMenus((prev) => ({ ...prev, [item.label]: true }));
                  } else {
                    toggleMenu(item.label);
                  }
                }}
                aria-label={item.label}
                title={isCollapsed ? item.label : undefined}
                className={`w-full flex items-center ${isCollapsed ? "gap-0" : "gap-3"} px-3 py-3 rounded-xl text-sm font-medium transition-[gap,color,background-color] duration-200 ease-in-out ${childActive ? "text-white" : "text-zinc-400 hover:bg-zinc-800 hover:text-white"}`}
                aria-expanded={isOpen && !isCollapsed}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span aria-hidden={isCollapsed} className={`min-w-0 flex-1 overflow-hidden whitespace-nowrap text-left transition-[max-width,opacity,transform] duration-200 ease-in-out ${isCollapsed ? "max-w-0 translate-x-1 opacity-0" : "max-w-48 translate-x-0 opacity-100"}`}>
                  {item.label}
                </span>
                <ChevronDown aria-hidden={isCollapsed} className={`h-4 w-4 shrink-0 transition-[width,opacity,transform] duration-200 ease-in-out ${isCollapsed ? "w-0 opacity-0" : isOpen ? "rotate-180 opacity-100" : "opacity-100"}`} />
              </button>
              {isOpen && !isCollapsed && (
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
          <Link key={item.label} href={item.href} aria-label={item.label} title={isCollapsed ? item.label : undefined} className={`flex items-center ${isCollapsed ? "gap-0" : "gap-3"} px-3 py-3 rounded-xl text-sm font-medium transition-[gap,color,background-color] duration-200 ease-in-out ${isActive ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30" : "text-zinc-400 hover:bg-zinc-800 hover:text-white"}`}>
            <Icon className="h-5 w-5 shrink-0" />
            <span aria-hidden={isCollapsed} className={`min-w-0 flex-1 overflow-hidden whitespace-nowrap transition-[max-width,opacity,transform] duration-200 ease-in-out ${isCollapsed ? "max-w-0 translate-x-1 opacity-0" : "max-w-48 translate-x-0 opacity-100"}`}>
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      <aside className={`hidden lg:flex ${isCollapsed ? "w-20" : "w-64"} shrink-0 flex-col border-r border-zinc-800 bg-zinc-900/60 sticky top-0 h-screen overflow-hidden transition-[width] duration-300 ease-in-out`}>
      <button
        type="button"
        onClick={() => setIsCollapsed((collapsed) => !collapsed)}
        aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-expanded={!isCollapsed}
        title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        className={`flex w-full shrink-0 items-center overflow-hidden border-b border-zinc-800 py-6 transition-[gap,padding] duration-300 ease-in-out ${isCollapsed ? "justify-center gap-0 px-4" : "gap-3 px-6"}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/CPClogo.png" alt="Cordova Public College Logo" className="h-11 w-11 shrink-0 object-contain" />
        <div aria-hidden={isCollapsed} className={`min-w-0 overflow-hidden text-left transition-[max-width,opacity,transform] duration-200 ease-in-out ${isCollapsed ? "max-w-0 translate-x-1 opacity-0" : "max-w-48 translate-x-0 opacity-100"}`}>
          <p className="font-bold leading-tight text-white">Cordova Public College</p>
          <p className="text-xs text-blue-300">Library Management System</p>
        </div>
      </button>

      {renderNav()}

      <div className="shrink-0 border-t border-zinc-800 px-5 py-4">
        <div className={`relative overflow-hidden transition-[height] duration-300 ease-in-out ${isCollapsed ? "h-5" : "h-10"}`}>
          <p className={`absolute inset-x-0 top-0 text-xs leading-5 text-zinc-500 transition-opacity duration-150 ${isCollapsed ? "opacity-0" : "opacity-100"}`}>
            © 2026 Cordova Public College. All rights reserved.
          </p>
          <p
            aria-hidden={!isCollapsed}
            className={`absolute inset-0 text-xs text-zinc-500 transition-opacity duration-150 ${isCollapsed ? "opacity-100 delay-100" : "opacity-0"}`}
            title="© 2026 Cordova Public College. All rights reserved."
          >
            ©
            <span className="sr-only"> 2026 Cordova Public College. All rights reserved.</span>
          </p>
        </div>
      </div>
      </aside>

      <nav className="fixed inset-x-3 bottom-[calc(0.75rem+min(env(safe-area-inset-bottom),2rem))] z-40 flex items-stretch justify-evenly gap-1 rounded-2xl border border-zinc-800 bg-zinc-900/95 p-2 shadow-2xl shadow-black/50 backdrop-blur lg:hidden" aria-label="Mobile navigation">
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
          className={`relative flex min-w-0 flex-1 flex-col items-center justify-start gap-1 rounded-xl px-0.5 py-2 text-[10px] font-medium leading-3 transition-colors ${moreOpen || ["/analytics", "/members", "/archive", "/activities", "/policies", "/profile", "/faq", "/suggestions", "/acquisition-requests"].some((href) => pathname === href || pathname.startsWith(href + "/")) ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30" : "text-zinc-400 hover:bg-zinc-800 hover:text-white"}`}
        >
          <MoreHorizontal className="h-5 w-5 shrink-0" />
          <span className="flex min-h-6 w-full items-start justify-center whitespace-normal text-center">More</span>
          {!moreOpen && ["/analytics", "/members", "/archive", "/activities", "/policies", "/profile", "/faq", "/suggestions", "/acquisition-requests"].some((href) => pathname === href || pathname.startsWith(href + "/")) && (
            <span className="absolute right-2 top-1 h-1.5 w-1.5 rounded-full bg-white" aria-hidden="true" />
          )}
        </button>
      </nav>

      {moreOpen && (
        <ModalLayer>
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
                  { href: "/analytics", label: "Report", icon: BarChart3 },
                    { href: "/members", label: "Members", icon: Users },
                    { href: "/archive", label: "Archive", icon: Archive },
                    { href: "/activities", label: "Activity Logs", icon: ScrollText },
                    { href: "/policies", label: "Policies", icon: Shield },
                    { href: "/faq", label: "FAQ Manager", icon: HelpCircle },
                    { href: "/suggestions", label: "Suggestions Inbox", icon: MessageSquare },
                    { href: "/acquisition-requests", label: "Acquisition Requests", icon: LibraryBig },
                    { href: "/profile", label: "Profile", icon: UserRound },
                  ]
                : [
                    { href: "/faq", label: "FAQ", icon: HelpCircle },
                    { href: "/suggestions", label: "Suggestions", icon: MessageSquare },
                    { href: "/acquisition-requests", label: "Request a Book", icon: LibraryBig },
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
        </ModalLayer>
      )}
    </>
  );
}
