/** @type {import('next').NextConfig} */

const prefix =
  process.env.NODE_ENV === "production" ? "https://trondi.github.io/" : "";

const nextConfig = {
  reactStrictMode: true,
  output: "export",
  assetPrefix: prefix,
  typescript: {
    ignoreBuildErrors: true, // ✅ 빌드 시 TypeScript 오류 무시
  },
};

module.exports = nextConfig;
