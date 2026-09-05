module.exports = {
  root: true,
  env: {
    node: true,
    browser: true,
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
  ],
  rules: {
    '@typescript-eslint/no-unused-vars': [
      'warn',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      },
    ],
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-non-null-assertion': 'warn',
    '@typescript-eslint/no-require-imports': 'error',
    
    // قواعد عامة
    'no-empty': 'warn',
    'no-constant-condition': 'warn',
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
    'src/**/__tests__/**',
    '**/*.test.ts',
  ],
};
