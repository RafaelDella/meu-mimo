import type { NextConfig } from 'next';
import { fileURLToPath } from 'node:url';

const webRoot = fileURLToPath(new URL('.', import.meta.url));

const nextConfig: NextConfig = {
  outputFileTracingRoot: webRoot,
  turbopack: { root: webRoot },
  poweredByHeader: false,
};

export default nextConfig;
