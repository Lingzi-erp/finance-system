import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 启用 standalone 输出模式，用于 Electron 打包
  output: 'standalone',
  
  // 禁用图片优化（standalone 模式下需要）
  images: {
    unoptimized: true,
  },
  
  // 构建时忽略 ESLint 和 TypeScript 错误
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
