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
    project: './tsconfig.json',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
  ],
  rules: {
    // تشديد قواعد TypeScript
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      },
    ],
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-non-null-assertion': 'warn',
    '@typescript-eslint/no-require-imports': 'error',
    '@typescript-eslint/explicit-function-return-types': [
      'error',
      { allowExpressions: true },
    ],
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/no-misused-promises': 'error',
    
    // قواعس عامة
    'no-empty': 'error',
    'no-constant-condition': 'error',
    'no-undef': 'error',
    'no-var': 'error',
    'prefer-const': 'error',
  },
  ignorePatterns: [
    'node_modules/**',
    'dist/**',
    'dist-server/**',
    'release/**',
    'pgdata/**',
    '*.tmp.ts',
    'prisma/migrations/**',
  ],
};
