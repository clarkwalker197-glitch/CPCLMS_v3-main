"use client";

import MediaImage from "@/components/MediaImage";

export default function UserAvatar({
  firstName,
  lastName,
  avatar,
  className = "h-9 w-9",
}: {
  firstName?: string | null;
  lastName?: string | null;
  avatar?: string | null;
  className?: string;
}) {
  const initials = `${firstName?.trim().charAt(0) || "U"}${lastName?.trim().charAt(0) || ""}`.toUpperCase();
  const fullName = `${firstName || ""} ${lastName || ""}`.trim() || "User";

  return (
    <div className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-500/15 text-xs font-semibold text-blue-300 ${className}`}>
      <MediaImage
        src={avatar}
        alt={`${fullName} profile picture`}
        className="h-full w-full object-cover"
        fallback={<span aria-label={`${fullName} initials`}>{initials}</span>}
      />
    </div>
  );
}
