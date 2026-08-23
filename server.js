const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');

// База данных устройств в памяти сервера
let devices = [];

const server = http.createServer((req, res) => {
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

    // Отдача главной страницы сайта
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

    // 1. Запрос от Android: Получить PIN-код от сервера
    if (pathname === '/api/get-pin' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const macAddress = data.macAddress;
                
                if (!macAddress) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Не указан macAddress' }));
                    return;
                }

                let device = devices.find(d => d.macAddress === macAddress);
                
                // СЕРВЕР САМ НАЗНАЧАЕТ УНИКАЛЬНЫЙ КОД, ЕСЛИ УСТРОЙСТВА НЕТ В БАЗЕ
                if (!device) {
                    const pinCode = Math.floor(100000 + Math.random() * 900000).toString();
                    device = { macAddress, pinCode, playlistUrl: '', isLinked: false };
                    devices.push(device);
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ pin: device.pinCode }));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Ошибка JSON' }));
            }
        });
    } 
    
    // 2. Запрос от Android: Проверить статус привязки плейлиста
    else if (pathname === '/api/check-status' && req.method === 'GET') {
        const macAddress = parsedUrl.query.macAddress;
        let device = devices.find(d => d.macAddress === macAddress);
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        if (!device) {
            res.end(JSON.stringify({ isLinked: false }));
        } else {
            res.end(JSON.stringify({ isLinked: device.isLinked, playlistUrl: device.playlistUrl }));
        }
    } 
    
    // 3. Запрос от САЙТА: Связать устройство
    else if (pathname === '/api/link-device' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk.toString(); });
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const { macAddress, pinCode, playlistUrl } = data;
                
                // Жесткое сравнение MAC и PIN в базе данных сервера
                let device = devices.find(d => d.macAddress.trim().toLowerCase() === macAddress.trim().toLowerCase() && d.pinCode.trim() === pinCode.trim());
                
                if (!device) {
                    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ success: false, message: 'Неверный MAC-адрес или PIN-код!' }));
                    return;
                }

                device.playlistUrl = playlistUrl;
                device.isLinked = true;
                
                res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ success: true, message: 'Устройство успешно связано!' }));
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Ошибка обработки' }));
            }
        });
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Страница не найдена');
    }
});

server.listen(3000, '0.0.0.0', () => {
    console.log('\n==================================================');
    console.log('🚀 Сервер LinkPlayer ОБНОВЛЕН!');
    console.log('🔒 Теперь сервер принимает запросы со всех Wi-Fi устройств!');
    console.log('==================================================\n');
});
