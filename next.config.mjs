/** @type {import('next').NextConfig} */
const nextConfig = {
  // Solar har över 8 000 ikoner. Det här gör att bara de som används följer med.
  experimental: { optimizePackageImports: ["@solar-icons/react"], agentUpgrade: "security" },
  distDir: process.env.NEXT_DIST_DIR || ".next",
  async redirects() {
    return [
      // Företagsprofil för bolag heter Spaning och ligger på /app/spaning.
      { source: "/app/foretagsprofil", destination: "/app/spaning", permanent: false },
      { source: "/app/foretagsprofil/:id", destination: "/app/spaning/:id", permanent: false },
      // Adminportalen delades upp i egna sidor.
      { source: "/admin/organizations", destination: "/admin/bolag", permanent: false },
      { source: "/admin/users", destination: "/admin/anvandare", permanent: false },
    ];
  },
};
export default nextConfig;
