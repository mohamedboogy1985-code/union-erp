module.exports = {
  root: true,
  env: {
    node: true,
    es2022: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  rules: {
    '@typescript-eslint/no-unused-vars': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
    '@typescript-eslint/no-require-imports': 'off',
    'no-empty': 'off',
    'no-constant-condition': 'off',
    'no-undef': 'off',
    'no-var': 'off',
  },
  ignorePatterns: ['node_modules/**', 'dist/**', 'dist-server/**', 'release/**', 'pgdata/**', '*.tmp.ts'],
};