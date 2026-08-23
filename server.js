const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const MONGO_URI = "mongodb://admin:LinkPlayer2026@cluster0-shard-00-00.ovmwocy.mongodb.net:27017,cluster0-shard-00-01.ovmwocy.mongodb.net:27017,cluster0-shard-00-02.ovmwocy.mongodb.net:27017/linkplayer?ssl=true&replicaSet=atlas-t0t98z-shard-0&authSource=admin&retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
    .then(() => console.log('📦 Успешное подключение к облачной базе MongoDB Atlas!'))
    .catch(err => console.error('❌ Ошибка подключения к базе:', err));

// Обновленная коммерческая схема с поддержкой M3U и Xtream Codes
const DeviceSchema = new mongoose.Schema({
    macAddress: { type: String, required: true, unique: true, lowercase: true, trim: true },
    pinCode: { type: String, required: true },
    playlistUrl: { type: String, default: '' },
    isLinked: { type: Boolean, default: false },
    // Поля Xtream Codes
    isXtream: { type: Boolean, default: false },
    xtreamUrl: { type: String, default: '' },
    xtreamUser: { type: String, default: '' },
    xtreamPass: { type: String, default: '' }
});
const Device = mongoose.model('Device', DeviceSchema);

const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

    if (pathname === '/' && req.method === 'GET') {
        fs.readFile(path.join(__dirname, 'index.html'), (err, content) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('Ошибка: файл index.html не найден!');
            } else {
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(content);
            }
        });
        return;
    }

    if (pathname === '/api/get-pin' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                const macAddress = data.macAddress;
                if (!macAddress) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Не указан macAddress' }));
                    return;
                }
                let device = await Device.findOne({ macAddress });
                if (!device) {
                    const pinCode = Math.floor(100000 + Math.random() * 900000).toString();
                    device = new Device({ macAddress, pinCode });
                    await device.save();
                }
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ pin: device.pinCode }));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Ошибка сервера базы данных' }));
            }
        });
    } 
    else if (pathname === '/api/check-status' && req.method === 'GET') {
        const macAddress = parsedUrl.query.macAddress;
        if (!macAddress) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Не указан macAddress' }));
            return;
        }
        try {
            let device = await Device.findOne({ macAddress });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            if (!device) {
                res.end(JSON.stringify({ isLinked: false }));
            } else {
                res.end(JSON.stringify({ 
                    isLinked: device.isLinked, 
                    playlistUrl: device.playlistUrl,
                    isXtream: device.isXtream,
                    xtreamUrl: device.xtreamUrl,
                    xtreamUser: device.xtreamUser,
                    xtreamPass: device.xtreamPass
                }));
            }
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Ошибка базы данных' }));
        }
    } 
    else if (pathname === '/api/link-device' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                const { macAddress, pinCode, playlistUrl, isXtream, xtreamUrl, xtreamUser, xtreamPass } = data;
                
                let device = await Device.findOne({ 
                    macAddress: macAddress.trim().toLowerCase(), 
                    pinCode: pinCode.trim() 
                });
                
                if (!device) {
                    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ success: false, message: 'Неверный MAC-адрес или PIN-код!' }));
                    return;
                }

                // Сохраняем новые параметры в зависимости от выбранного пользователем типа
                device.isXtream = isXtream || false;
                if (device.isXtream) {
                    device.xtreamUrl = xtreamUrl || '';
                    device.xtreamUser = xtreamUser || '';
                    device.xtreamPass = xtreamPass || '';
                    device.playlistUrl = ''; // очищаем m3u
                } else {
                    device.playlistUrl = playlistUrl || '';
                    device.xtreamUrl = ''; device.xtreamUser = ''; device.xtreamPass = '';
                }
                
                device.isLinked = true;
                await device.save();
                
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ success: true, message: 'Устройство успешно связано!' }));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Ошибка сохранения' }));
            }
        });
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Страница не найдена');
    }
});

server.listen(3000, '0.0.0.0', () => {
    console.log('🚀 Промышленный сервер LinkPlayer с базой данных и Xtream запущен!');
});
