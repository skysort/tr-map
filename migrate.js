require('dotenv').config();
const fs = require('fs');
const connectDB = require('./config/db');
const Place = require('./models/Place');

const migrate = async () => {
  await connectDB();
  
  const data = JSON.parse(fs.readFileSync('./data/places.json', 'utf8'));
  
  for (const item of data) {
    await Place.create({
      title: item.title,
      address: item.address,
      lat: item.lat,
      lng: item.lng,
      category: item.category,
      description: item.description || '',
      phone: item.phone || '',
      website: item.website || '',
      createdAt: item.createdAt ? new Date(item.createdAt) : new Date()
    });
  }
  
  console.log(`✅ Перенесено ${data.length} заведений`);
  process.exit();
};

migrate();