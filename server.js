const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

 // Ваша готовая ссылка на облачную базу данных MongoDB Atlas
const MONGO_URI = "mongodb://admin:LinkPlayer2026@cluster0-shard-00-00.ovmwocy.mongodb.net:27017,cluster0-shard-00-01.ovmwocy.mongodb.net:27017,cluster0-shard-00-02.ovmwocy.mongodb.net:27017/linkplayer?ssl=true&replicaSet=atlas-t0t98z-shard-0&authSource=admin&retryWrites=true&w=majority";


// Подключение к облачной базе данных
mongoose.connect(MONGO_URI)
    .then(() => console.log('📦 Успешное подключение к облачной базе MongoDB Atlas!'))
    .catch(err => console.error('❌ Ошибка подключения к базе:', err));

// Схема хранения данных устройства в базе
const DeviceSchema = new mongoose.Schema({
    macAddress: { type: String, required: true, unique: true, lowercase: true, trim: true },
    pinCode: { type: String, required: true },
    playlistUrl: { type: String, default: '' },
    isLinked: { type: Boolean, default: false }
});
const Device = mongoose.model('Device', DeviceSchema);

const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // Главная страница сайта
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

    // 1. API: Получить или создать ПИН-код в БАЗЕ ДАННЫХ
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

                // Ищем устройство в реальной базе
                let device = await Device.findOne({ macAddress });
                
                // Если устройства нет, генерируем PIN и НАВСЕГДА сохраняем в базу
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
    
    // 2. API: Проверить статус привязки устройства
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
                res.end(JSON.stringify({ isLinked: device.isLinked, playlistUrl: device.playlistUrl }));
            }
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Ошибка базы данных' }));
        }
    } 
    
    // 3. API: Привязать плейлист на сайте по коду из БАЗЫ
    else if (pathname === '/api/link-device' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                const { macAddress, pinCode, playlistUrl } = data;
                
                // Поиск строгого совпадения в базе данных
                let device = await Device.findOne({ 
                    macAddress: macAddress.trim().toLowerCase(), 
                    pinCode: pinCode.trim() 
                });
                
                if (!device) {
                    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ success: false, message: 'Неверный MAC-адрес или PIN-код!' }));
                    return;
                }

                // Записываем плейлист в базу навсегда
                device.playlistUrl = playlistUrl;
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

// На бесплатном тарифе Render всегда слушаем порт 3000
server.listen(3000, '0.0.0.0', () => {
    console.log('🚀 Промышленный сервер LinkPlayer с базой данных запущен!');
});
