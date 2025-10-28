import app from './app';
import type { ServerOptions } from 'node:https'
import https from 'node:https'
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {config} from "./config/config";
import mongoose from 'mongoose';

// MongoDB connection
mongoose.connect(config.mongoUri)
    .then(() => console.log('Connected to MongoDB'))
    .catch((error) => console.error('MongoDB connection error:', error));

const PORT = config.port;

// // Получаем __dirname для ES модулей
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
//
// // Проверяем наличие SSL сертификатов для HTTPS
const certPath = path.join(__dirname, '..', 'certificates'); // предполагая, что certificates на уровне src

const httpsOptions: ServerOptions = {
    key: fs.readFileSync(path.join(certPath, 'private-key.pem')),
    cert: fs.readFileSync(path.join(certPath, 'certificate.pem')),
};

const start = async () => {
    try {
        https.createServer(httpsOptions, app).listen(PORT, () =>
            console.log(`App listening on https://localhost:${PORT}`))
    } catch (err) {
        console.error('Failed to start the application')
        console.error(err)
        process.exit(1)
    }
}

process.on('SIGINT', async () => {
    console.log('App closed')
    await mongoose.connection.close();
    process.exit()
})

start()