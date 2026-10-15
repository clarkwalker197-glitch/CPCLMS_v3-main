import type { ReactNode } from "react";
import Link from "next/link";

interface StatCardProps {
  title: ReactNode;
  value: string | number;
  icon: any;
  description?: string;
  accent?: string;
  href?: string;
}

export function StatCard({ title, value, icon: Icon, description, accent = "bg-blue-500/15 text-blue-400", href }: StatCardProps) {
  const content = (
    <>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${accent} sm:h-11 sm:w-11`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-3 truncate text-2xl font-bold text-white sm:mt-4 sm:text-3xl">{value}</p>
      <div className="mt-1 break-words text-xs leading-5 text-zinc-400 sm:text-sm">{title}</div>
      {description && <p className="mt-1 break-words text-xs text-zinc-500">{description}</p>}
    </>
  );
  return (
    <div className={`relative min-w-0 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 backdrop-blur transition-colors hover:border-zinc-700 sm:p-5 ${href ? "mobile-stat-card" : ""}`}>
      {href && <Link href={href} aria-label="View related library records" className="mobile-stat-card-link absolute inset-0 z-10 rounded-2xl" />}
      {content}
    </div>
  );
}
