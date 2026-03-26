import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { AppProviders } from "./providers";
import "./globals.css";

const uiSans = IBM_Plex_Sans({
  variable: "--font-ui-sans",
  display: "swap",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const uiMono = IBM_Plex_Mono({
  variable: "--font-ui-mono",
  display: "swap",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  metadataBase: new URL("http://localhost:3002"),
  title: {
    default: "MFG8APS Precision Lab",
    template: "%s | MFG8APS Precision Lab",
  },
  description:
    "Independent Next.js migration workspace for the MFG8APS Precision Lab desktop workbench.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${uiSans.variable} ${uiMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-[var(--pl-canvas)] text-[var(--pl-text-primary)]">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
