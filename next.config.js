/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Server actions are only used in local dev; on Vercel the origin is the
    // deployment URL, so hardcoding localhost breaks actions in production.
    serverActions: {
      allowedOrigins: ["localhost:3000", ...(process.env.NEXT_PUBLIC_APP_URL ? [process.env.NEXT_PUBLIC_APP_URL.replace(/^https?:\/\//, "")] : [])],
    },
  },
};

module.exports = nextConfig;
