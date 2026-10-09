import type { NextConfig } from "next";
import withPWA from "@ducanh2912/next-pwa";

const nextConfig: NextConfig = {
  turbopack: {},
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
        ],
      },
      {
        source: "/manifest.json",
        headers: [
          {
            key: "Content-Type",
            value: "application/manifest+json",
          },
          {
            key: "Cache-Control",
            value: "public, max-age=3600",
          },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
        ],
      },
      {
        source: "/icons/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400, immutable",
          },
        ],
      },
    ];
  },
};

export default withPWA({
  dest: "public",
  register: true,
  skipWaiting: true,
  clientsClaim: true,
  fallbacks: {
    document: "/offline.html",
  },
  cacheId: "cpclms-v1",
  disable: process.env.NODE_ENV === "development",
  cacheStartUrl: false,
  customWorkerSrc: "worker",
  workboxOptions: {
    runtimeCaching: [
      {
        urlPattern: ({ url }: { url: URL }) =>
          url.pathname.startsWith("/uploads/profiles/"),
        handler: "NetworkOnly",
      },
      {
        urlPattern: ({ request, url }: { request: Request; url: URL }) =>
          !url.pathname.startsWith("/api/") &&
          !url.pathname.startsWith("/uploads/profiles/") &&
          (
            request.destination === "image" ||
            request.destination === "font" ||
            request.destination === "script" ||
            request.destination === "style" ||
            /\.(?:png|jpe?g|gif|svg|webp|ico|css|js|woff2?)$/i.test(url.pathname)
          ),
        handler: "CacheFirst",
        options: {
          cacheName: "static-assets",
          expiration: {
            maxEntries: 200,
            maxAgeSeconds: 60 * 60 * 24 * 30,
          },
          cacheableResponse: {
            statuses: [0, 200],
          },
        },
      },
    ],
  },
})(nextConfig);
