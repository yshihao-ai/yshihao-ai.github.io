import type { NextConfig } from "next";

const [repositoryOwner = "", repositoryName = ""] = process.env.GITHUB_REPOSITORY?.split("/") ?? [];
const isUserSiteRepository =
  Boolean(repositoryOwner && repositoryName) &&
  repositoryName.toLowerCase() === `${repositoryOwner.toLowerCase()}.github.io`;
const basePath = repositoryName && !isUserSiteRepository ? `/${repositoryName}` : "";

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  basePath,
  assetPrefix: basePath || undefined,
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
      },
    ],
  },
  /* config options here */
  webpack: (config) => {
    config.module.rules.push({
      test: /\.bib$/,
      type: 'asset/source',
    });
    return config;
  },
};

export default nextConfig;
