import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], display: "swap" });

export const metadata: Metadata = {
  title: "GATE AI",
  description: "Personal adaptive GATE CSE/IT preparation engine.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Matches the app surface so iOS Safari does not paint a white band when the
  // address bar collapses.
  themeColor: "#F8F6F2",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-surface text-ink min-h-screen antialiased`}>
        {children}
      </body>
    </html>
  );
}
