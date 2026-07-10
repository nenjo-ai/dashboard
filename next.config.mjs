import { createMDX } from 'fumadocs-mdx/next';

const apiProxyTarget = process.env.API_PROXY_TARGET;
const distDir = process.env.NEXT_DIST_DIR;
const ogFontFiles = ['./app/_og/*.ttf'];

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  ...(distDir ? { distDir } : {}),
  turbopack: {},
  allowedDevOrigins: ['192.168.1.228'],
  // Next resolves the root OG/Twitter metadata image module while rendering
  // dynamic dashboard pages, so those serverless functions also read these fonts.
  outputFileTracingIncludes: {
    '/opengraph-image': ogFontFiles,
    '/twitter-image': ogFontFiles,
    '/dashboard/**': ogFontFiles,
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: '/dashboard/invitations/:token',
        destination: '/dashboard/invitations?token=:token',
        permanent: false,
      },
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www.nenjo.ai' }],
        destination: 'https://nenjo.ai/:path*',
        permanent: true,
      },
    ];
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
