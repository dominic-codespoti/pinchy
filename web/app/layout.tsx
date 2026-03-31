import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Providers } from "./providers";
import { NotificationTriggers } from "@/features/notifications/components/notification-triggers";
import { Sidebar } from "@/shared/components/navigation/sidebar";
import { BottomNav } from "@/shared/components/navigation/bottom-nav";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Pinchy - Agent Operations Console",
    template: "%s | Pinchy",
  },
  description: "Manage and monitor your AI agents with Pinchy's powerful operations console",
  applicationName: "Pinchy",
  authors: [{ name: "Pinchy Team" }],
  creator: "Pinchy",
  publisher: "Pinchy",
  robots: "noindex, nofollow",
  keywords: ["AI agents", "agent operations", "AI management", "automation", "chatbot"],
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    siteName: "Pinchy",
    title: "Pinchy - Agent Operations Console",
    description: "Manage and monitor your AI agents with Pinchy's powerful operations console",
    images: [
      {
        url: "/icon?size=512",
        width: 512,
        height: 512,
        alt: "Pinchy Logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Pinchy - Agent Operations Console",
    description: "Manage and monitor your AI agents with Pinchy's powerful operations console",
    images: ["/icon?size=512"],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Pinchy",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
  colorScheme: "light dark",
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
      className={inter.variable}
    >
      <body className="min-h-screen bg-background font-sans antialiased lg:pb-0 pb-20">
        <Providers>
          <NotificationTriggers />
          <div className="flex h-screen overflow-hidden">
            <Sidebar />
            <main className="flex-1 overflow-auto">
              <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
                {children}
              </div>
            </main>
          </div>
          <BottomNav />
          <Toaster
            position="bottom-right"
            toastOptions={{
              className: "bg-background text-foreground border border-border",
            }}
          />
        </Providers>
      </body>
    </html>
  );
}
