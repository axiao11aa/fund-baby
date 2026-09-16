/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  reactCompiler: true,
  ...(process.env.GITHUB_PAGES === 'true' ? {
    output: 'export',
    basePath: '/fund-baby',
    images: { unoptimized: true },
    trailingSlash: true,
  } : {}),
};

module.exports = nextConfig;

