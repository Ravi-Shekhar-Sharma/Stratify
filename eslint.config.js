import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'ml'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  {
    // src/engine is pure TypeScript: the line simulation and inference layer.
    // It must stay importable from a Python script or a test runner with no
    // React/UI dependency in the graph. Enforced here, not by memory.
    files: ['src/engine/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'react',
                'react/*',
                'react-dom',
                'react-dom/*',
                'next',
                'next/*',
                '**/components/**',
                '**/components',
                '**/ui/**',
                '**/ui',
              ],
              message:
                'src/engine is pure TypeScript and must not import React, Next.js, or any UI/components module.',
            },
          ],
        },
      ],
    },
  },
  {
    // The inference layer reads only observable signals — it must be
    // structurally incapable of reading ground truth. Enforced here, not by
    // code review: importing groundTruth.ts (or anything re-exporting it)
    // from src/engine/inference is a lint error, in any import form.
    files: ['src/engine/inference/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '**/groundTruth',
                '**/groundTruth.ts',
                '**/groundTruth/**',
                '**/signals/groundTruth*',
              ],
              message:
                'src/engine/inference must not import groundTruth.ts. Take an ObservableStream (from src/engine/signals/observable) as input instead.',
            },
          ],
        },
      ],
    },
  }
);
