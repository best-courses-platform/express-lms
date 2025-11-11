import app from './app.js';
import type { ServerOptions } from 'https';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { config, validateConfig } from "./config/config.js";
import mongoose from 'mongoose';

// Подключение к MongoDB
mongoose.connect(config.mongoUri)
    .then(() => console.log('Успешное подключение к MongoDB'))
    .catch((error) => console.error('Ошибка подключения к MongoDB:', error));

const PORT = config.port;

const isProduction = process.env.NODE_ENV === 'production';

const start = async () => {
    try {
        if (!isProduction) {
            validateConfig(); // Проверяем настройки только при разработке

            console.log(`Запуск HTTP сервера для разработки...`);

            app.listen(PORT, () => {
                console.log(`Приложение для разработки запущено на http://localhost:${PORT}`);
            });

            return;
        }

        console.log(`Запуск продакшен сервера...`);

        const __dirname = path.resolve();
        const certPath = path.join(__dirname, 'certificates');
        const keyPath = path.join(certPath, 'private-key.pem');
        const certPathFull = path.join(certPath, 'certificate.pem');

        const hasCertificates = fs.existsSync(keyPath) && fs.existsSync(certPathFull);

        if (hasCertificates) {
            const httpsOptions: ServerOptions = {
                key: fs.readFileSync(keyPath),
                cert: fs.readFileSync(certPathFull),
            };

            console.log(`Запуск HTTPS сервера с SSL...`);

            https.createServer(httpsOptions, app).listen(PORT, () =>
                console.log(`Продакшен приложение запущено на https://localhost:${PORT}`)
            );
        } else {
            console.warn('SSL сертификаты не найдены в продакшене!');
            startHttpServer();
        }
    } catch (err) {
        console.error('Не удалось запустить приложение');
        console.error(err);
        process.exit(1);
    }
}

function startHttpServer() {
    console.log(`Запуск HTTP сервера...`);
    app.listen(PORT, () => {
        console.log(`Продакшен приложение запущено на http://localhost:${PORT}`);
    });
}

process.on('SIGINT', async () => {
    console.log('Приложение закрыто');
    await mongoose.connection.close();
    process.exit();
});

start();