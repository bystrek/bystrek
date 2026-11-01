// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      "prettier/prettier": ["error", { endOfLine: "auto" }],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date']",
          message:
            'Use currentDate/fromEpochMs/parseOffsetIso/parseZonedIso from calendar/zoned-time.ts: new Date(string) reads offset-less strings in the server timezone (#17).',
        },
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='parse']",
          message:
            'Use parseOffsetIso/parseZonedIso from calendar/zoned-time.ts: Date.parse reads offset-less strings in the server timezone (#17).',
        },
      ],
    },
  },
  {
    // Specs build fixtures from explicit-offset strings; Drizzle's
    // $onUpdate timestamp defaults need a Date.
    files: ['src/calendar/zoned-time.ts', 'src/db/schema.ts', '**/*.spec.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
);
