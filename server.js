require('dotenv').config();

const express = require('express');
const path = require('path');
const db = require('./db');

const app = express();
app.use(express.json());

// ---------- WEB ----------
app.use(express.static(path.join(__dirname, 'web')));

// ---------- CREATE GIVEAWAY ----------
app.post('/create', async (req,res)=>{
  const { user_id, text, winners, time, button, channels } = req.body;

  const r = await db.query(
    `INSERT INTO giveaways(owner_id,channels,text,winners,end_time,button)
     VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
    [user_id, JSON.stringify(channels), text, winners, time, button]
  );

  res.json({id: r.rows[0].id});
});

app.listen(process.env.PORT || 3000, ()=>{
  console.log('🌐 WEB APP READY');
});