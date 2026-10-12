import type { MetadataRoute } from "next";

/** Gör att portalen går att installera på telefonens hemskärm och öppnas som en egen app, direkt i ringläget. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Prospex",
    short_name: "Prospex",
    description: "Ring företag som redan köper det du säljer.",
    start_url: "/app/ring",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "sv",
    background_color: "#F5F4F0",
    theme_color: "#0E1116",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/brand/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
