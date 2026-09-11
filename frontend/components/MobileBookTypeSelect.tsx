"use client";

import { usePathname, useRouter } from "next/navigation";

export default function MobileBookTypeSelect({ current, className = "" }: { current: "physical" | "ebook"; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();

  return (
    <select
      value={current}
      onChange={(event) => {
        const nextPath = event.target.value === "ebook" ? "/ebooks" : "/books";
        if (pathname !== nextPath) router.push(nextPath);
      }}
      className={`w-full appearance-none rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white outline-none transition focus:border-transparent focus:ring-2 focus:ring-blue-500 sm:hidden ${className}`}
      aria-label="Book type"
    >
      <option value="physical">Physical Books</option>
      <option value="ebook">E-Books</option>
    </select>
  );
}
