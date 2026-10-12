import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Prospex | Prospektlistor på företag som redan köper webb och marknadsföring",
  description:
    "Prospektlistor på företag som redan köper webb och marknadsföring. Filtrera på leverantör, bransch och ort. Varje rad länkar till källan.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sv">
      <body>{children}</body>
    </html>
  );
}
