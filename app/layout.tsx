import type { Metadata } from "next";
import { Instrument_Sans, Geist_Mono } from "next/font/google";
import "./globals.css";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";

export const dynamic = 'force-dynamic';

const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "500"],
  style: ["normal", "italic"],
  variable: "--font-instrument-sans",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-geist-mono",
});

export const metadata: Metadata = {
  title: "lifeOS",
  description: "Your personal operating system",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const u = db.select().from(user).get();
  const dark = u?.darkMode ? 'dark' : '';
  return (
    <html lang="en" className={`${instrumentSans.variable} ${geistMono.variable} ${dark}`.trim()}>
      <body>{children}</body>
    </html>
  );
}
