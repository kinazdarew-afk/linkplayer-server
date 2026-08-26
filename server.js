const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const app = express();

// --- НАСТРОЙКИ ПОДКЛЮЧЕНИЯ ---
// Приоритет отдается переменной MONGO_URL из настроек Railway
const MONGO_URI = process.env.MONGO_URL || "mongodb://admin:LinkPlayer2026@cluster0-shard-00-00.ovmwocy.mongodb.net:27017,cluster0-shard-00-01.ovmwocy.mongodb.net:27017,cluster0-shard-00-02.ovmwocy.mongodb.net:27017/linkplayer?ssl=true&replicaSet=atlas-t0t98z-shard-0&authSource=admin&retryWrites=true&w=majority";
const PORT = process.env.PORT || 3000;

mongoose.connect(MONGO_URI)
    .then(() => console.log('📦 Успешное подключение к облачной базе MongoDB Atlas!'))
    .catch(err => console.error('❌ Ошибка подключения к базе:', err));

// --- МОДЕЛИ ДАННЫХ ---
const UserSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true }
});
const User = mongoose.model('User', UserSchema);

const DeviceSchema = new mongoose.Schema({
    macAddress: { type: String, required: true, unique: true, lowercase: true, trim: true },
    pinCode: { type: String, required: true },
    playlistUrl: { type: String, default: '' },
    isLinked: { type: Boolean, default: false },
    isXtream: { type: Boolean, default: false },
    xtreamUrl: { type: String, default: '' },
    xtreamUser: { type: String, default: '' },
    xtreamPass: { type: String, default: '' },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
});
const Device = mongoose.model('Device', DeviceSchema);

// --- MIDDLEWARE ---
app.use(express.json());
app.use(express.static('public')); // Для картинок/стилей, если будут
app.use(session({
    secret: 'linkplayer-super-secret-key-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 } // Сессия живет 30 дней
}));

// --- API ДЛЯ ANDROID ПРИЛОЖЕНИЯ ---
// Получение ПИН-кода при запуске приложения
app.post('/api/get-pin', async (req, res) => {
    try {
        const { macAddress } = req.body;
        if (!macAddress) return res.status(400).json({ error: 'Нет macAddress' });
        
        let device = await Device.findOne({ macAddress: macAddress.toLowerCase() });
        if (!device) {
            const pinCode = Math.floor(100000 + Math.random() * 900000).toString();
            device = new Device({ macAddress: macAddress.toLowerCase(), pinCode });
            await device.save();
        }
        res.json({ pin: device.pinCode });
    } catch (e) { res.status(500).json({ error: 'Ошибка сервера' }); }
});

// Проверка статуса привязки приложением
app.get('/api/check-status', async (req, res) => {
    try {
        const { macAddress } = req.query;
        if (!macAddress) return res.status(400).json({ error: 'Нет macAddress' });
        
        const device = await Device.findOne({ macAddress: macAddress.toLowerCase() });
        if (!device) return res.json({ isLinked: false });
        
        res.json({ 
            isLinked: device.isLinked, 
            playlistUrl: device.playlistUrl,
            isXtream: device.isXtream,
            xtreamUrl: device.xtreamUrl,
            xtreamUser: device.xtreamUser,
            xtreamPass: device.xtreamPass
        });
    } catch (e) { res.status(500).json({ error: 'Ошибка базы' }); }
});

// --- API ЛИЧНОГО КАБИНЕТА (ВЕБ-САЙТ) ---

// Регистрация нового пользователя
app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ message: 'Заполните все поля' });
        
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ email, password: hashedPassword });
        await user.save();
        res.json({ success: true, message: 'Регистрация успешна!' });
    } catch (e) { res.status(400).json({ success: false, message: 'Email уже используется' }); }
});

// Вход в аккаунт
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (user && await bcrypt.compare(password, user.password)) {
        req.session.userId = user._id;
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false, message: 'Неверный email или пароль' });
    }
});

// Проверка авторизации
app.get('/api/auth/me', async (req, res) => {
    if (!req.session.userId) return res.json({ loggedIn: false });
    const user = await User.findById(req.session.userId);
    res.json({ loggedIn: true, email: user.email });
});

// Выход
app.post('/api/auth/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// Получить список моих устройств
app.get('/api/user/devices', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: 'Нужна авторизация' });
    const devices = await Device.find({ owner: req.session.userId });
    res.json(devices);
});

// Привязка устройства (универсальный роут)
app.post('/api/link-device', async (req, res) => {
    try {
        const { macAddress, pinCode, playlistUrl, isXtream, xtreamUrl, xtreamUser, xtreamPass } = req.body;
        
        let device = await Device.findOne({ 
            macAddress: macAddress.trim().toLowerCase(), 
            pinCode: pinCode.trim() 
        });

        if (!device) {
            return res.status(400).json({ success: false, message: 'Неверный MAC или PIN-код!' });
        }

        // Если пользователь вошел, привязываем устройство к его аккаунту
        if (req.session.userId) {
            device.owner = req.session.userId;
        }

        device.isXtream = isXtream || false;
        if (device.isXtream) {
            device.xtreamUrl = xtreamUrl || '';
            device.xtreamUser = xtreamUser || '';
            device.xtreamPass = xtreamPass || '';
            device.playlistUrl = '';
        } else {
            device.playlistUrl = playlistUrl || '';
            device.xtreamUrl = ''; device.xtreamUser = ''; device.xtreamPass = '';
        }
        
        device.isLinked = true;
        await device.save();
        
        res.json({ success: true, message: 'Устройство успешно связано!' });
    } catch (e) { res.status(500).json({ success: false, message: 'Ошибка сервера при сохранении' }); }
});

// Возвращаем index.html для любых веб-запросов (Single Page App style)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 LinkPlayer Server Professional запущен на порту ${PORT}`);
});
