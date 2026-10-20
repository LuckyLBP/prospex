import type { Metadata, Viewport } from "next";
import { Caveat, Geist } from "next/font/google";
import "./globals.css";

// Geist: skarp och neutral, med tydliga siffror för tabellerna. Läses in av Next, utan extra anrop från webbläsaren.
const geist = Geist({ subsets: ["latin", "latin-ext"], variable: "--font-geist", display: "swap" });

// Caveat: handskriven stil, bara för de små anteckningarna på startsidan.
const hand = Caveat({ subsets: ["latin", "latin-ext"], variable: "--font-hand", display: "swap" });

const SITE = process.env.NEXT_PUBLIC_APP_URL ?? "https://prospex.se";
const DESCRIPTION = "Prospektlistor på företag som redan köper webb och marknadsföring. Filtrera på leverantör, bransch och ort. Varje rad länkar till källan.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: "Prospex | Ring företag som redan köper det du säljer", template: "%s | Prospex" },
  description: DESCRIPTION,
  applicationName: "Prospex",
  openGraph: { type: "website", siteName: "Prospex", locale: "sv_SE", title: "Prospex | Ring företag som redan köper det du säljer", description: DESCRIPTION },
  twitter: { card: "summary_large_image", title: "Prospex | Ring företag som redan köper det du säljer", description: DESCRIPTION },
  appleWebApp: { capable: true, title: "Prospex", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#0E1116", colorScheme: "light" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv" className={`${geist.variable} ${hand.variable}`}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
