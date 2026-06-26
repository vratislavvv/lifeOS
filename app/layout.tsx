import type { Metadata } from "next";
import { Instrument_Sans, Geist_Mono } from "next/font/google";
import "./globals.css";

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
  return (
    <html lang="en" className={`${instrumentSans.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
