// Отражает tsconfig.json baseUrl+paths ("auth/x" -> "src/modules/auth/x") — без этого
// jest не резолвит ни один bare-алиасный импорт, все тестовые сьюты падают на require().
const moduleNameMapper = {
    '^(auth|courses|email|file-storage|jwt|lessons|users)/(.*)$': '<rootDir>/src/modules/$1/$2',
};

const transform = {
    '^.+\\.ts$': '@swc/jest',
};

module.exports = {
    // Два независимых прогона: unit (мокает repository, без БД, быстрый) и integration
    // (supertest + mongodb-memory-server, реальный Mongoose/MongoDB, медленнее). Разделены
    // по testMatch (*.unit.spec.ts / *.integration.spec.ts), не по папке — оба живут рядом
    // в __tests__ модуля, которому принадлежат.
    projects: [
        {
            displayName: 'unit',
            testEnvironment: 'node',
            roots: ['<rootDir>/src'],
            moduleNameMapper,
            testMatch: ['**/__tests__/**/*.unit.spec.ts'],
            transform,
            moduleFileExtensions: ['ts', 'js'],
            setupFiles: ['<rootDir>/test/setupTestEnv.ts'],
        },
        {
            displayName: 'integration',
            testEnvironment: 'node',
            roots: ['<rootDir>/src'],
            moduleNameMapper,
            testMatch: ['**/__tests__/**/*.integration.spec.ts'],
            transform,
            moduleFileExtensions: ['ts', 'js'],
            setupFiles: ['<rootDir>/test/setupTestEnv.ts'],
            setupFilesAfterEnv: ['<rootDir>/test/setupIntegration.ts'],
            globalSetup: '<rootDir>/test/globalSetup.ts',
            globalTeardown: '<rootDir>/test/globalTeardown.ts',
        },
    ],
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/**/*.spec.ts',
        '!src/**/*.test.ts',
        // Bootstrap-файл процесса: реальное подключение к MongoDB, app.listen()/HTTPS с
        // сертификатами, SIGINT-хендлер, process.exit(). Юнит-тест здесь означал бы мокать
        // сам процесс (process.exit, mongoose.connect, поднятие HTTPS-сервера) ради кода,
        // который не содержит бизнес-логики — цена высокая, ценность около нуля. Он и так
        // проверяется каждым `npm run dev`/`npm start`.
        '!src/server.ts',
    ],
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov', 'html'],
};
