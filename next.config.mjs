// Sent with every page. The policy only restricts what cannot break the
// public site or the embedded Sanity Studio: no framing by other sites, no
// plugins, no <base> or form posts to other origins.
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'self'; base-uri 'self'; object-src 'none'; form-action 'self'",
  },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  // Browsers ignore this over plain http, so it does not affect local development.
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
]

// The workspace and sign-in pages are private: keep them out of search engines.
const privatePaths = ["/dashboard/:path*", "/login", "/signup/:path*", "/pending", "/forgot-password", "/reset-password", "/auth/:path*"]

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      ...privatePaths.map((source) => ({ source, headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] })),
    ]
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  experimental: {
    // Federation Excel imports (the legacy .xlsm is ~1.1 MB). Kept under
    // Vercel's 4.5 MB request limit; the upload action enforces 4 MB.
    serverActions: { bodySizeLimit: "4.5mb" },
  },


}

export default nextConfig
