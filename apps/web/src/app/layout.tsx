import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Geist, Geist_Mono } from "next/font/google";
import { t } from "@/i18n/messages";
import { BRAND } from "@/lib/brand";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const display = Bricolage_Grotesque({ variable: "--font-display", subsets: ["latin"], weight: ["600", "700", "800"] });

export const metadata: Metadata = {
  title: { default: `${BRAND.name}, des clips verticaux à partir de vos vidéos longues`, template: `%s | ${BRAND.name}` },
  description: "Repérez les meilleurs moments de vos vidéos, recadrés en vertical et sous-titrés, prêts pour TikTok et YouTube Shorts.",
  robots: process.env.APP_ENV === "production" ? undefined : { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaf8" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0f10" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${geistSans.variable} ${geistMono.variable} ${display.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-paper text-ink">
        <a href="#contenu" className="sr-only z-50 rounded-full bg-gold px-4 py-2 font-semibold text-on-gold focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
          {t("common.skip")}
        </a>
        {children}
      </body>
    </html>
  );
}
