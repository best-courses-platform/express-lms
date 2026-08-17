module.exports = {
    testEnvironment: 'node',
    roots: ['<rootDir>/src'],
    // Отражает tsconfig.json baseUrl+paths ("auth/x" -> "src/modules/auth/x") — без этого
    // jest не резолвит ни один bare-алиасный импорт, все тестовые сьюты падают на require().
    moduleNameMapper: {
        '^(auth|courses|email|file-storage|jwt|lessons|users|views)/(.*)$': '<rootDir>/src/modules/$1/$2',
    },
    testMatch: [
        '**/__tests__/**/*.ts',
        '**/?(*.)+(spec|test).ts'
    ],
    transform: {
        '^.+\\.ts$': '@swc/jest',
    },
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/**/*.spec.ts',
        '!src/**/*.test.ts'
    ],
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov', 'html'],
    moduleFileExtensions: ['ts', 'js'],
    extensionsToTreatAsEsm: ['.ts'],
};