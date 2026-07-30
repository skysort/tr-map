const mongoose = require('mongoose');

// Общая модель для трёх разделов: courses (спецкурсы), meetups (слёты трезвости),
// clubs (клубы трезвости Шичко). Поле `type` разделяет их в одной коллекции.
const contentItemSchema = new mongoose.Schema({
  type: { type: String, required: true, enum: ['course', 'meetup', 'club'] },
  title: { type: String, required: true },
  city: { type: String, default: '' },
  address: { type: String, default: '' },
  dateText: { type: String, default: '' },     // "каждую субботу 18:00" / "12-14 сентября" и т.п.
  description: { type: String, default: '' },
  contactName: { type: String, default: '' },
  phone: { type: String, default: '' },
  website: { type: String, default: '' },
  image: { type: String, default: '' },
  // Сейчас MVP без модерации — всё сразу approved.
  // Когда включим модерацию — поменяем default на 'pending' и добавим панель проверки.
  status: { type: String, default: 'approved' },
  createdAt: { type: Date, default: Date.now }
});

contentItemSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('ContentItem', contentItemSchema);
