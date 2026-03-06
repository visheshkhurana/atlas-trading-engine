/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: true,
  },
  images: {
    domains: ['xyqeawbuiqqcbhsnyojn.supabase.co'],
  },
}

module.exports = nextConfig
