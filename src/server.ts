import app from './app.js';
import type { ServerOptions } from 'https';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { config } from "./config/config.js";
import mongoose from 'mongoose';

// MongoDB connection
mongoose.connect(config.mongoUri)
    .then(() => console.log('Connected to MongoDB'))
    .catch((error) => console.error('MongoDB connection error:', error));

const PORT = config.port;

const __dirname = path.resolve();
//
// // Проверяем наличие SSL сертификатов для HTTPS
const certPath = path.join(__dirname, 'certificates'); // предполагая, что certificates на уровне src
const hasCertificates = fs.existsSync(path.join(certPath, 'private-key.pem')) &&
    fs.existsSync(path.join(certPath, 'certificate.pem'));

const httpsOptions: ServerOptions = {
    key: fs.readFileSync(path.join(certPath, 'private-key.pem')),
    cert: fs.readFileSync(path.join(certPath, 'certificate.pem')),
};

const start = async () => {
    try {
        const protocol = hasCertificates && process.env.NODE_ENV === 'production' ? 'HTTPS' : 'HTTP';
        console.log(`Starting ${protocol} server...`);

        if (hasCertificates && process.env.NODE_ENV === 'production') {
            // HTTPS в продакшене
            https.createServer(httpsOptions, app).listen(PORT, () =>
                console.log(`App listening on https://localhost:${PORT}`))
        } else {
            // HTTP в разработке
            app.listen(PORT, () => {
                console.log(`App listening on http://localhost:${PORT}`);
            });
        }
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

start();