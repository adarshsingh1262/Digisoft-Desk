/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The shared Zod schemas ship as TypeScript-built CommonJS from the workspace.
  transpilePackages: ['@digisoft/shared'],
  poweredByHeader: false,
};

export default nextConfig;
