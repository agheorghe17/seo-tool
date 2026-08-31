import preset from './packages/config/eslint-preset.js';

export default [
  ...preset,
  { ignores: ['apps/web/**', '**/dist/**', '**/.next/**', '**/.turbo/**'] },
];
