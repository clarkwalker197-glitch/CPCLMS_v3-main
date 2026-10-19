"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { ModalLayer } from "@/components/ModalLayer";
import api from "@/lib/api";
import {
  LayoutDashboard,
  BookOpen,
  BookOpenText,
  BookMarked,
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
  Search,
  ArrowUp,
  QrCode,
  RefreshCw,
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
  { href: "/requests", label: "Requests", icon: ClipboardList },
  { href: "/reservations", label: "Reservations", icon: BookOpenText },
  { href: "/faq", label: "FAQ", icon: HelpCircle },
  { href: "/suggestions", label: "Suggestions", icon: MessageSquare },
  { href: "/acquisition-requests", label: "Request a Book", icon: LibraryBig },
  { href: "/activities", label: "Activity Logs", icon: ScrollText },
  { href: "/policies", label: "Policies", icon: Shield },
  { href: "/archive", label: "Archive", icon: Archive },
];

export default function Sidebar({ showCopyright = true }: { showCopyright?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isCompactMobile, setIsCompactMobile] = useState(false);
  const [pullRefreshReady, setPullRefreshReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
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

  useEffect(() => {
    const updateOnline = () => setIsOnline(navigator.onLine);
    updateOnline();
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);

  useEffect(() => {
    let active = true;
    let interval: number | undefined;
    const refreshUnreadCount = async () => {
      if (!user) return;
      try {
        const response = await api.getUnreadCount();
        if (active && response.success) {
          setUnreadCount(Number((response.data as { unreadCount?: number } | undefined)?.unreadCount || 0));
        }
      } catch {
        // Keep navigation available when notifications cannot be refreshed.
      }
    };

    const media = window.matchMedia("(max-width: 768px)");
    const syncPolling = () => {
      setIsCompactMobile(media.matches);
      if (interval !== undefined) {
        window.clearInterval(interval);
        interval = undefined;
      }
      if (media.matches) {
        void refreshUnreadCount();
        interval = window.setInterval(refreshUnreadCount, 30000);
      }
    };
    syncPolling();
    media.addEventListener("change", syncPolling);
    return () => {
      active = false;
      media.removeEventListener("change", syncPolling);
      if (interval !== undefined) window.clearInterval(interval);
    };
  }, [user?.id]);

  useEffect(() => {
    let startY = 0;
    let active = false;
    const handleScroll = () => setShowScrollTop(window.scrollY > 320);
    const handleTouchStart = (event: TouchEvent) => {
      const target = event.target;
      if (window.scrollY > 0 || !(target instanceof Element) || target.closest("input, textarea, select, [role='dialog']")) {
        active = false;
        return;
      }
      startY = event.touches[0]?.clientY || 0;
      active = startY > 0;
    };
    const handleTouchMove = (event: TouchEvent) => {
      if (!active) return;
      const distance = (event.touches[0]?.clientY || startY) - startY;
      setPullRefreshReady(distance > 72);
    };
    const handleTouchEnd = (event: TouchEvent) => {
      if (!active) return;
      const distance = (event.changedTouches[0]?.clientY || startY) - startY;
      active = false;
      setPullRefreshReady(false);
      if (isCompactMobile && distance > 96 && !refreshing) {
        setRefreshing(true);
        window.setTimeout(() => window.location.reload(), 180);
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchmove", handleTouchMove, { passive: true });
    document.addEventListener("touchend", handleTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [isCompactMobile, refreshing]);

  const visibleNavItems = navItems.filter((item) => {
    if (item.librarianOnly && user?.role !== "LIBRARIAN") return false;
    if (user?.role === "LIBRARIAN") return true;
    return !["Members", "Activity Logs", "Archive"].includes(item.label);
  });

  const mobileNavItems = isCompactMobile
    ? user?.role === "LIBRARIAN"
      ? [
          { href: "/dashboard", label: "Home", icon: LayoutDashboard },
          { href: "/books", label: "Search", icon: Search },
          { href: "/requests", label: "Requests", icon: ClipboardList },
          { href: "/members", label: "Manage", icon: Users },
          { href: "/profile", label: "Profile", icon: UserRound },
        ]
      : user?.role === "FACULTY"
        ? [
            { href: "/student/dashboard", label: "Home", icon: LayoutDashboard },
            { href: "/books", label: "Search", icon: Search },
            { href: "/requests", label: "Approvals", icon: ClipboardList },
            { href: "/acquisition-requests", label: "Manage", icon: LibraryBig },
            { href: "/profile", label: "Profile", icon: UserRound },
          ]
        : [
            { href: "/student/dashboard", label: "Home", icon: LayoutDashboard },
            { href: "/books", label: "Search", icon: Search },
            { href: "/requests", label: "My Books", icon: BookMarked },
            { href: "/reservations", label: "Reservations", icon: ClipboardList },
            { href: "/profile", label: "Profile", icon: UserRound },
          ]
    : [
        { href: user?.role === "LIBRARIAN" ? "/dashboard" : "/student/dashboard", label: "Dashboard", icon: LayoutDashboard },
        { href: "/books", label: "Books", icon: BookOpen },
        { href: "/requests", label: "Borrow Requests", icon: ClipboardList },
      ];

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
                    const childClassName = `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${isChildActive ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30" : "text-zinc-400 hover:bg-zinc-800 hover:text-white"}`;
                    if (!isOnline && ["/books", "/ebooks"].includes(child.href)) {
                      return (
                        <a key={child.label} href={child.href} className={childClassName}>
                          <ChildIcon className="w-4 h-4" />
                          {child.label}
                        </a>
                      );
                    }
                    return (
                      <Link key={child.label} href={child.href} className={childClassName}>
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
      <aside className={`hidden lg:flex ${user ? "has-global-header" : ""} ${isCollapsed ? "w-20" : "w-64"} shrink-0 flex-col border-r border-zinc-800 bg-zinc-900/60 sticky top-0 h-screen overflow-hidden transition-[width] duration-300 ease-in-out`}>
      <button
        type="button"
        onClick={() => setIsCollapsed((collapsed) => !collapsed)}
        aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-expanded={!isCollapsed}
        title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        className={`flex w-full shrink-0 items-center overflow-hidden border-b border-zinc-800 py-4 transition-[gap,padding] duration-300 ease-in-out ${isCollapsed ? "justify-center gap-0 px-3" : "gap-2.5 px-4"}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/CPClogo.png" alt="Cordova Public College Logo" className="h-10 w-10 shrink-0 object-contain" />
        <div aria-hidden={isCollapsed} className={`min-w-0 overflow-hidden text-left leading-none transition-[max-width,opacity,transform] duration-200 ease-in-out ${isCollapsed ? "max-w-0 translate-x-1 opacity-0" : "max-w-48 translate-x-0 opacity-100"}`}>
          <p className="font-bold leading-tight text-white">Cordova Public College</p>
          <p className="mt-0.5 text-[11px] text-blue-300">Library Management System</p>
        </div>
      </button>

      {renderNav()}

      {showCopyright && (
        <div className="mt-auto shrink-0 border-t border-zinc-800 px-4 py-3">
          <div className={`relative overflow-hidden transition-[height] duration-300 ease-in-out ${isCollapsed ? "h-4" : "h-10"}`}>
            <p className={`absolute inset-x-0 top-0 text-[11px] leading-5 text-zinc-500 transition-opacity duration-150 ${isCollapsed ? "opacity-0" : "opacity-100"}`}>
              © 2026 Cordova Public College. All rights reserved.
            </p>
            <p
              aria-hidden={!isCollapsed}
              className={`absolute inset-0 flex items-center justify-center text-[11px] text-zinc-500 transition-opacity duration-150 ${isCollapsed ? "opacity-100 delay-100" : "opacity-0"}`}
              title="© 2026 Cordova Public College. All rights reserved."
            >
              ©
              <span className="sr-only"> 2026 Cordova Public College. All rights reserved.</span>
            </p>
          </div>
        </div>
      )}
      </aside>

      <nav className="fixed inset-x-3 bottom-[calc(0.75rem+min(env(safe-area-inset-bottom),2rem))] z-40 flex items-stretch justify-evenly gap-1 rounded-2xl border border-zinc-800 bg-zinc-900/95 p-2 shadow-2xl shadow-black/50 backdrop-blur lg:hidden" aria-label="Mobile navigation">
        {mobileNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/") || (["Search", "Books"].includes(item.label) && pathname.startsWith("/ebooks"));
          const showUnreadBadge = isCompactMobile && (item.label === "Requests" || item.label === "Approvals");
          const mobileLinkClassName = `relative flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-0.5 py-1 text-[10px] font-medium leading-3 transition-colors ${isActive ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30" : "text-zinc-400 hover:bg-zinc-800 hover:text-white"}`;
          if (!isOnline && ["/books", "/ebooks"].includes(item.href)) {
            return (
              <a key={item.href} href={item.href} aria-label={item.label} title={item.label} className={mobileLinkClassName}>
                <Icon className="h-5 w-5 shrink-0" />
                <span className="w-full whitespace-nowrap text-center">{item.label}</span>
                {showUnreadBadge && unreadCount > 0 && (
                  <span className="absolute right-1 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white ring-2 ring-zinc-900" aria-label={`${unreadCount} unread notifications`}>
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </a>
            );
          }
          return (
            <Link key={item.href} href={item.href} aria-label={item.label} title={item.label} className={mobileLinkClassName}>
              <Icon className="h-5 w-5 shrink-0" />
              <span className="w-full whitespace-nowrap text-center">{item.label}</span>
              {showUnreadBadge && unreadCount > 0 && (
                <span className="absolute right-1 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white ring-2 ring-zinc-900" aria-label={`${unreadCount} unread notifications`}>
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-expanded={moreOpen}
          aria-controls="mobile-more-menu"
          className={`relative flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-0.5 py-1 text-[10px] font-medium leading-3 transition-colors ${moreOpen || ["/analytics", "/members", "/archive", "/activities", "/policies", "/faq", "/suggestions", "/acquisition-requests"].some((href) => pathname === href || pathname.startsWith(href + "/")) ? "bg-blue-600 text-white shadow-lg shadow-blue-600/30" : "text-zinc-400 hover:bg-zinc-800 hover:text-white"}`}
        >
          <MoreHorizontal className="h-5 w-5 shrink-0" />
          <span className="w-full whitespace-nowrap text-center">More</span>
          {!moreOpen && ["/analytics", "/members", "/archive", "/activities", "/policies", "/faq", "/suggestions", "/acquisition-requests"].some((href) => pathname === href || pathname.startsWith(href + "/")) && (
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
                  ]
                : [
                    { href: "/faq", label: "FAQ", icon: HelpCircle },
                    { href: "/suggestions", label: "Suggestions", icon: MessageSquare },
                    { href: "/acquisition-requests", label: "Request a Book", icon: LibraryBig },
                    { href: "/policies", label: "Policies", icon: Shield },
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

      {isCompactMobile && (
        <>
          {!isOnline && (
            <div className="fixed inset-x-3 top-[calc(0.5rem+env(safe-area-inset-top))] z-50 flex items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-zinc-900/95 px-4 py-3 text-sm text-amber-200 shadow-lg" role="status">
              <span>You’re offline. Cached data may be shown.</span>
              <button type="button" onClick={() => window.location.reload()} className="min-h-11 rounded-lg bg-amber-500/15 px-3 text-xs font-semibold text-amber-100">Retry</button>
            </div>
          )}
          {(pullRefreshReady || refreshing) && (
            <div className="fixed inset-x-0 top-0 z-[60] flex justify-center pt-[calc(0.5rem+env(safe-area-inset-top))]" role="status">
              <span className="inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-900/95 px-4 py-2 text-xs font-medium text-zinc-200 shadow-lg">
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                {refreshing ? "Refreshing…" : "Release to refresh"}
              </span>
            </div>
          )}
          {showScrollTop && (
            <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="Scroll to top" className="fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom))] right-4 z-30 flex h-11 w-11 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-zinc-200 shadow-xl">
              <ArrowUp className="h-5 w-5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (user?.role === "STUDENT" || user?.role === "FACULTY") {
                if (pathname === "/requests") window.dispatchEvent(new Event("cpc:open-qr"));
                else router.push("/requests?mobileScan=1");
                return;
              }
              router.push("/requests");
            }}
            aria-label={user?.role === "STUDENT" || user?.role === "FACULTY" ? "Scan QR code" : "Open approvals"}
            className="fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom))] left-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-xl shadow-blue-600/30 transition-transform active:scale-95"
          >
            {user?.role === "STUDENT" || user?.role === "FACULTY" ? <QrCode className="h-6 w-6" /> : <ClipboardList className="h-6 w-6" />}
          </button>
        </>
      )}
    </>
  );
}
