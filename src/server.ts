// server.ts
import app from './app.js';
import type { ServerOptions } from 'https';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { config, logConfigValidation } from "./config";
import { CONFIG_MESSAGES } from './config/config.constants';
import mongoose from 'mongoose';

// Подключение к MongoDB
mongoose.connect(config.mongoUri)
    .then(() => console.log(CONFIG_MESSAGES.SUCCESS.MONGO_CONNECTED))
    .catch((error) => console.error(CONFIG_MESSAGES.ERROR.MONGO_CONNECTION_FAILED, error));

const PORT = config.port;
const isProduction = process.env.NODE_ENV === 'production';

const start = async () => {
    try {
        if (!isProduction) {
            logConfigValidation(); // Проверяем настройки только при разработке

            console.log(CONFIG_MESSAGES.INFO.STARTING_DEV);

            app.listen(PORT, () => {
                console.log(`${CONFIG_MESSAGES.SUCCESS.HTTP_DEV_STARTED} http://localhost:${PORT}`);
            });

            return;
        }

        console.log(CONFIG_MESSAGES.INFO.STARTING_PROD);

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

            https.createServer(httpsOptions, app).listen(PORT, () =>
                console.log(`${CONFIG_MESSAGES.SUCCESS.HTTPS_PROD_STARTED} https://localhost:${PORT}`)
            );
        } else {
            console.warn(CONFIG_MESSAGES.ERROR.SSL_CERTS_MISSING);
            startHttpServer();
        }
    } catch (err) {
        console.error(CONFIG_MESSAGES.ERROR.APP_START_FAILED);
        console.error(err);
        process.exit(1);
    }
}

function startHttpServer() {
    app.listen(PORT, () => {
        console.log(`${CONFIG_MESSAGES.SUCCESS.HTTP_PROD_STARTED} http://localhost:${PORT}`);
    });
}

process.on('SIGINT', async () => {
    console.log(CONFIG_MESSAGES.SUCCESS.APP_CLOSED);
    await mongoose.connection.close();
    process.exit();
});

start();