import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "China → India Freight Tracker · iKargos",
  description:
    "Indicative ocean freight spot rates from China to India — Nhava Sheva, Chennai, Kolkata. Updated when carriers revise pricing.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
