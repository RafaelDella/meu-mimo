import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import globals from 'globals';
import quality from '../eslint-rules/index.cjs';
import { clientBoundary } from './eslint-rules/client-boundary.mjs';

export default defineConfig([
  globalIgnores(['.next/**', '.artifacts/**', 'node_modules/**', 'next-env.d.ts', 'tests/fixtures/**', 'test-results/**', 'playwright-report/**']),
  ...nextVitals,
  ...nextTs,
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    plugins: { quality, boundary: { rules: { client: clientBoundary } } },
    rules: {
      'quality/max-lines': ['error', { max: 350, includeTests: true }],
      'boundary/client': 'error',
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'quality/no-direct-console': 'error',
      'quality/no-direct-data-access': ['error', {
        modules: ['@/server/db/client', '@prisma/client', 'prisma'],
        layers: ['/src/app/', '/src/components/'],
        bindings: ['db', 'prisma'],
      }],
    },
  },
  {
    files: ['src/components/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: ['node:*', '@prisma/*', 'prisma', '@/server/**', '**/server/**'],
      }],
    },
  },
  { files: ['**/*.mjs', '*.ts', 'tests/**/*.ts'], languageOptions: { globals: globals.node } },
]);
