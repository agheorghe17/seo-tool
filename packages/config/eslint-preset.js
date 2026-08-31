import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

/**
 * Shared flat ESLint config. Consume from a package with:
 *
 *   import preset from 'config/eslint-preset.js';
 *   export default preset;
 */
export default tseslint.config(
  { ignores: ['dist/**', '.next/**', '.turbo/**', 'node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'warn',
      'no-console': 'off',
    },
  },
);
