require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');
const Place = require('./models/Place');
const ContentItem = require('./models/ContentItem');

// Разрешённые типы разделов и их маппинг на URL-сегмент
const CONTENT_TYPES = {
  courses: 'course',
  meetups: 'meetup',
  clubs: 'club'
};

const app = express();
const PORT = process.env.PORT || 3000;

connectDB();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/* ---------- API ---------- */

// GET: все одобренные заведения
app.get('/api/places', async (req, res) => {
  try {
    const places = await Place.find({ status: 'approved' }).sort({ createdAt: -1 });
    res.json(places);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET: одно заведение (для SEO-страниц)
app.get('/api/places/:id', async (req, res) => {
  try {
    const place = await Place.findById(req.params.id);
    if (!place) return res.status(404).json({ error: 'Не найдено' });
    res.json(place);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST: добавить заведение (сразу в статусе "на проверке")
app.post('/api/places', async (req, res) => {
  try {
    const { title, address, lat, lng, category, description, phone, website, image } = req.body;
    if (!title?.trim() || !address?.trim() || lat == null || lng == null) {
      return res.status(400).json({ error: 'Заполните обязательные поля' });
    }
    const place = await Place.create({
      title: title.trim(),
      address: address.trim(),
      lat: parseFloat(lat),
      lng: parseFloat(lng),
      category,
      description: description?.trim() || '',
      phone: phone?.trim() || '',
      website: website?.trim() || '',
      image: image?.trim() || '',
      status: 'pending'
    });
    res.status(201).json(place);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сохранения' });
  }
});

// DELETE: удалить заведение
app.delete('/api/places/:id', async (req, res) => {
  try {
    const place = await Place.findByIdAndDelete(req.params.id);
    if (!place) return res.status(404).json({ error: 'Не найдено' });
    res.json({ message: 'Удалено' });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка удаления' });
  }
});

// PATCH: сменить статус модерации (pending / approved / rejected)
app.patch('/api/places/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['pending', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Неверный статус' });
    }
    const place = await Place.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!place) return res.status(404).json({ error: 'Не найдено' });
    res.json(place);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка обновления' });
  }
});

// POST: пожаловаться на спам/неверные данные
app.post('/api/places/:id/report', async (req, res) => {
  try {
    const place = await Place.findByIdAndUpdate(
      req.params.id,
      { $inc: { reportCount: 1 } },
      { new: true }
    );
    if (!place) return res.status(404).json({ error: 'Не найдено' });
    res.json({ message: 'Жалоба отправлена' });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

/* ---------- API: курсы / слёты / клубы Шичко ---------- */
// Используем один набор роутов на все три раздела: /api/courses, /api/meetups, /api/clubs

// Проверяем, что раздел допустимый (Express 5 больше не поддерживает
// regex-группы вида ':section(a|b|c)' в пути, поэтому проверяем в middleware)
function validSection(req, res, next) {
  if (!CONTENT_TYPES[req.params.section]) {
    return res.status(404).json({ error: 'Раздел не найден' });
  }
  next();
}

app.get('/api/:section', validSection, async (req, res) => {
  try {
    const type = CONTENT_TYPES[req.params.section];
    // Пока без модерации — отдаём всё, кроме явно отклонённого
    const items = await ContentItem.find({ type, status: { $ne: 'rejected' } }).sort({ createdAt: -1 });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.get('/api/:section/:id', validSection, async (req, res) => {
  try {
    const item = await ContentItem.findById(req.params.id);
    if (!item) return res.status(404).json({ error: 'Не найдено' });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.post('/api/:section', validSection, async (req, res) => {
  try {
    const type = CONTENT_TYPES[req.params.section];
    const { title, city, address, dateText, description, contactName, phone, website, image } = req.body;
    if (!title?.trim()) {
      return res.status(400).json({ error: 'Заполните обязательные поля' });
    }
    const item = await ContentItem.create({
      type,
      title: title.trim(),
      city: city?.trim() || '',
      address: address?.trim() || '',
      dateText: dateText?.trim() || '',
      description: description?.trim() || '',
      contactName: contactName?.trim() || '',
      phone: phone?.trim() || '',
      website: website?.trim() || '',
      image: image?.trim() || ''
      // status по умолчанию 'approved' — см. models/ContentItem.js
    });
    res.status(201).json(item);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сохранения' });
  }
});

app.delete('/api/:section/:id', validSection, async (req, res) => {
  try {
    const item = await ContentItem.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ error: 'Не найдено' });
    res.json({ message: 'Удалено' });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка удаления' });
  }
});

// PATCH статуса — уже готово на будущее, когда включим модерацию
app.patch('/api/:section/:id/status', validSection, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['pending', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Неверный статус' });
    }
    const item = await ContentItem.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!item) return res.status(404).json({ error: 'Не найдено' });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: 'Ошибка обновления' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Сервер: http://localhost:${PORT}`);
});
