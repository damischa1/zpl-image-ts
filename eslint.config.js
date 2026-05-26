import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    {ignores: ['dist/**', 'node_modules/**', 'test/fixtures/**']},
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2024,
            sourceType: 'module',
            globals: {
                process: 'readonly',
                Buffer: 'readonly',
                console: 'readonly',
            },
        },
        rules: {
            '@typescript-eslint/no-unused-vars': [
                'warn',
                {argsIgnorePattern: '^_', varsIgnorePattern: '^_'},
            ],
        },
    },
);
