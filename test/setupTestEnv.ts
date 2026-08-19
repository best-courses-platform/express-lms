// Общий setupFiles для обоих jest-проектов (unit и integration) — выполняется в каждом
// тестовом воркере ДО импорта тестового файла, то есть раньше, чем config/index.ts
// (импортируется транзитивно почти всем) успевает прочитать process.env.
//
// dotenv.config() внутри config/index.ts не перезаписывает уже выставленные переменные
// окружения (поведение dotenv по умолчанию) — значит эти значения имеют приоритет над
// реальным .env, даже если .env вдруг окажется загружен раньше. Секреты и OAuth-креды
// здесь заведомо фиктивные, ни к чему реальному не подключены.
process.env.NODE_ENV = 'test';

process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET = 'test-jwt-refresh-secret';
process.env.JWT_ACCESS_EXPIRES_IN = '8h';
process.env.JWT_REFRESH_EXPIRES_IN = '30d';

process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-google-client-secret';
process.env.GITHUB_CLIENT_ID = 'test-github-client-id';
process.env.GITHUB_CLIENT_SECRET = 'test-github-client-secret';

process.env.FRONTEND_URL = 'http://localhost:3001';

// EMAIL_USER/EMAIL_PASSWORD ОБЯЗАТЕЛЬНО перебиты пустой строкой, не просто "не заданы".
// dotenv.config() (внутри config/index.ts) не перезаписывает переменную, если она уже
// присутствует в process.env — в том числе пустой строкой. Если оставить их непроставленными
// здесь, dotenv подхватит реальные значения из .env разработчика (которые в этом проекте
// не первый раз оказываются протухшими продовыми Gmail-креденшлами, см. server.log сессии) —
// EmailService.isConfigured() вернёт true, и register()/resendVerificationEmail() попытаются
// реально достучаться до smtp.gmail.com по сети на каждом тестовом прогоне: тесты станут
// медленными, недетерминированными (зависят от сети и от чужого .env) и будут годами
// заваливаться из-за протухшего пароля приложения, никак не связанного с проверяемым кодом.
process.env.EMAIL_USER = '';
process.env.EMAIL_PASSWORD = '';

export {};
