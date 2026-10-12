"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import NotificationBell from "@/components/NotificationBell";
import UserAvatar from "@/components/UserAvatar";

export default function HeaderUserActions({ showProfile = true }: { showProfile?: boolean }) {
  const { user } = useAuth();
  const pathname = usePathname();
  const shouldShowProfile = showProfile && !pathname.startsWith("/profile");

  if (!user) return null;

  return (
    <div className="authenticated-header-actions fixed right-3 top-2 z-50 flex items-center gap-2 sm:right-6 lg:right-8">
      <NotificationBell />
      {shouldShowProfile && (
        <Link
          href="/profile"
          aria-label="Profile"
          className="flex h-11 w-11 items-center justify-center rounded-xl transition-colors hover:bg-zinc-800"
        >
          <UserAvatar
            firstName={user.firstName}
            lastName={user.lastName}
            avatar={user.avatar}
            className="h-10 w-10"
          />
        </Link>
      )}
    </div>
  );
}
