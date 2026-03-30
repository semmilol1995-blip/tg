require('dotenv').config();

const express = require('express');
const path = require('path');

// 🔥 запускаємо бота
require('./bot');

const app = express();

app.use(express.json());

// ---------- WEB ----------
app.use(express.static(path.join(__dirname, 'web')));

// ---------- TEST ----------
app.get('/health', (req,res)=>{
  res.send('OK');
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, ()=>{
  console.log('🌐 WEB READY ON', PORT);
});
