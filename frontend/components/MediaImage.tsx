"use client";

import { useState, type ReactNode } from "react";
import { resolveMediaUrl } from "@/lib/api";

export default function MediaImage({
  src,
  alt,
  className,
  fallback,
}: {
  src?: string | null;
  alt: string;
  className: string;
  fallback: ReactNode;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (!src || failedSrc === src) return <>{fallback}</>;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={resolveMediaUrl(src)} alt={alt} className={className} onError={() => setFailedSrc(src)} />
  );
}
