/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  async redirects() {
    // "Bygg lista" låg tidigare på /app/listor, som nu är sidan med kategorier och listor.
    // Gamla länkar med filter (leverantör, ort, telefon, sök) skickas vidare till den nya adressen.
    return [
      ...["supplier", "city", "phone", "q"].map((key) => ({
        source: "/app/listor",
        has: [{ type: "query", key }],
        destination: "/app/bygg-lista",
        permanent: false,
      })),
      // Adminportalen delades upp i egna sidor.
      { source: "/admin/organizations", destination: "/admin/bolag", permanent: false },
      { source: "/admin/users", destination: "/admin/anvandare", permanent: false },
    ];
  },
};
export default nextConfig;
