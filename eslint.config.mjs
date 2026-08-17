import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['out/**', 'dist/**', 'release/**', 'node_modules/**', 'build/*.mjs'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Build scripts and tooling config: plain JS run by Node, so it needs the
    // Node globals declared (the .ts ones are provided by @types/node via
    // tsconfig). The `.cjs` files (e.g. commitlint.config.cjs) use `module.exports`.
    files: ['scripts/**/*.{js,mjs}', '*.config.{js,mjs,cjs}'],
    languageOptions: {
      globals: { process: 'readonly', console: 'readonly', module: 'readonly', require: 'readonly' },
    },
  },
  {
    // eslint-plugin-react-hooks v7 exposes the flat config nested under `configs.flat`;
    // `configs['recommended-latest']` is still the old eslintrc format.
    files: ['src/renderer/**/*.{ts,tsx}'],
    ...reactHooks.configs.flat['recommended-latest'],
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  }
);
