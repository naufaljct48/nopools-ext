module.exports = {
    'env': {
        'es2021': true,
        'node': true
    },
    'extends': [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended'
    ],
    'parser': '@typescript-eslint/parser',
    'parserOptions': {
        'ecmaVersion': 12,
        'sourceType': 'module'
    },
    'plugins': [
        'modules-newline',
        '@typescript-eslint'
    ],
    'rules': {
        '@typescript-eslint/indent': 'off',
        'linebreak-style': [
            'off'
        ],
        'quotes': 'off',
        'semi': [
            'error',
            'never'
        ],
        'comma-dangle': 'off',
        '@typescript-eslint/comma-dangle': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-unused-vars': 'off',
        '@typescript-eslint/no-var-requires': 'off',
        'prefer-arrow-callback': 'off',
        'prefer-const': 'off',
        'no-empty': 'off',
        'modules-newline/import-declaration-newline': 'off',
        'modules-newline/export-declaration-newline': 'off'
    }
}
