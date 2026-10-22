import js from '@eslint/js';
import globals from 'globals';
import quality from './eslint-rules/index.cjs';

export default [
  {
    ignores: [
      '**/node_modules/**', '.artifacts/**', '.agents/**', '.claude/**',
      '.codex/**', '**/.sites-local/**', '**/qa/**', '**/coverage/**', 'web/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs}'],
    plugins: { quality },
    rules: {
      'quality/max-lines': ['error', { max: 350, includeTests: true }],
    },
  },
  {
    files: ['**/*.{mjs,cjs}', 'prototype/tests/**/*.js'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['prototype/dist/**/*.js'],
    languageOptions: { globals: globals.browser },
    rules: {
      'quality/no-direct-console': 'error',
      'no-restricted-imports': ['error', {
        paths: ['@prisma/client', 'prisma'],
        patterns: ['node:*'],
      }],
    },
  },
];
