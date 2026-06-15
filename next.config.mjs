import { createMDX } from 'fumadocs-mdx/next';

const apiProxyTarget = process.env.API_PROXY_TARGET;

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  turbopack: {},
  allowedDevOrigins: ['192.168.1.228'],
  // Ship the OG/Twitter card fonts (read at runtime via fs) with their routes.
  outputFileTracingIncludes: {
    '/opengraph-image': ['./app/_og/*.ttf'],
    '/twitter-image': ['./app/_og/*.ttf'],
  },
  async rewrites() {
    const rewrites = [
      {
        source: '/docs/:path*.mdx',
        destination: '/llms.mdx/docs/:path*',
      },
    ];

    if (apiProxyTarget) {
      rewrites.unshift({
        source: '/api/v1/:path*',
        destination: `${apiProxyTarget.replace(/\/$/, '')}/api/v1/:path*`,
      });
    }

    return rewrites;
  },
  webpack: (webpackConfig, { dev }) => {
    if (dev) {
      webpackConfig.watchOptions = {
        poll: 1000,
        aggregateTimeout: 300,
      };
    }
    return webpackConfig;
  },
};

const withMDX = createMDX();

export default withMDX(config);
