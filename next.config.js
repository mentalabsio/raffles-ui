/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config) => {
    /** Fallbacks for some reason @project-serum/anchor imports all these stuff */
    config.resolve.fallback = {
      fs: false,
      os: false,
      path: false,
      crypto: false,
      stream: false,
    }

    return config
  },
}

module.exports = nextConfig
