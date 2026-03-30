require('dotenv').config();

const express = require('express');
const path = require('path');
const db = require('./db');

require('./bot');

const app = express();
app.use(express.json());

// ---------- STATIC ----------
app.use(express.static(path.join(__dirname, 'web')));

// ---------- HEALTH ----------
app.get('/health',(req,res)=>res.send('OK'));

// ---------- CHANNELS ----------
app.get('/channels/:user', async (req,res)=>{
  const r = await db.query(
    `SELECT * FROM channels WHERE user_id=$1`,
    [req.params.user]
  );
  res.json(r.rows);
});

// ---------- GIVEAWAYS ----------
app.get('/giveaways/:user', async (req,res)=>{
  const r = await db.query(
    `SELECT * FROM giveaways WHERE owner_id=$1 ORDER BY id DESC`,
    [req.params.user]
  );
  res.json(r.rows);
});

// ---------- CREATE ----------
app.post('/create', async (req,res)=>{
  const { user_id, text, winners, time, button, channels } = req.body;

  const r = await db.query(
    `INSERT INTO giveaways(owner_id,channels,text,winners,end_time,button)
     VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
    [user_id, JSON.stringify(channels), text, winners, time, button]
  );

  res.json({id:r.rows[0].id});
});

// ---------- DELETE ----------
app.post('/delete', async (req,res)=>{
  await db.query(`DELETE FROM giveaways WHERE id=$1`,[req.body.id]);
  res.json({ok:true});
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, ()=>{
  console.log('🌐 WEB READY ON', PORT);
});
