import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { ThemeProvider } from "@/components/theme-provider";
import { SWSelfHeal } from "@/components/SWSelfHeal";
import { OfflineIndicator } from "@/components/OfflineIndicator";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PWA-based CPC Library System",
  description:
    "A modern, smart library management system for Colegio de Porta Coeli. Manage books, borrow requests, reservations, and more.",
  keywords: [
    "library",
    "management",
    "CPC",
    "Colegio de Porta Coeli",
    "books",
    "catalog",
  ],
  manifest: "/manifest.json",
  themeColor: "#041dc2",
  appleWebApp: {
    capable: true,
    title: "PWA-based CPC Library System",
    statusBarStyle: "default",
  },
  icons: {
    icon: "/icons/icon-192.png",
    shortcut: "/icons/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "default",
    "apple-mobile-web-app-title": "PWA-based CPC Library System",
  },
  openGraph: {
    title: "PWA-based CPC Library System",
    description: "Smart Library Management System for Colegio de Porta Coeli",
    type: "website",
    locale: "en_PH",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#059669",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
<html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-950">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          disableTransitionOnChange
        >
          <AuthProvider>
            <SWSelfHeal />
            <OfflineIndicator />
            <main className="flex-1">{children}</main>
            <footer className="w-full shrink-0 border-t border-zinc-800 bg-zinc-950 px-4 py-5 text-center text-xs text-zinc-500">
              © 2026 Cordova Public College. All rights reserved.
            </footer>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

