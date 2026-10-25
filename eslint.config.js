import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: globals.node },
    rules: { 'no-var': 'error', 'prefer-const': 'error', 'no-unused-vars': ['error', { argsIgnorePattern: '^_' }] },
  },
];
