import { initOpenNextCloudflareForDev } from '@opennextjs/cloudflare';

/**
 * Next.js configuration for the Cloudflare Workers deployment target.
 *
 * NOTE: This project runs Next.js v14, which only supports `next.config.js`
 * or `next.config.mjs`. TypeScript config files (`next.config.ts`) are a
 * Next.js v15 feature and would make `next build` throw, so this file is
 * intentionally written as plain ESM JavaScript with a JSDoc type hint.
 *
 * `images.unoptimized` is enabled because the Next.js Image Optimization
 * runtime is not available on Cloudflare Workers; assets are served as-is.
 *
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
};

// Required so that `getCloudflareContext()` resolves during local `next dev`.
// Without this, every API route that touches the Cloudflare bindings throws.
initOpenNextCloudflareForDev();

export default nextConfig;
