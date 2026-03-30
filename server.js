require('dotenv').config();

const express = require('express');
const path = require('path');
const db = require('./db');
const bot = require('./bot');

const app = express();
app.use(express.json());

// ---------- INIT DB ----------
(async ()=>{
  await db.query(`CREATE TABLE IF NOT EXISTS channels(
    id SERIAL,
    user_id BIGINT,
    chat_id BIGINT,
    username TEXT
  )`);

  await db.query(`CREATE TABLE IF NOT EXISTS giveaways(
    id SERIAL PRIMARY KEY,
    owner_id BIGINT,
    channels TEXT,
    text TEXT,
    winners INT,
    end_time BIGINT,
    button TEXT,
    status TEXT DEFAULT 'active',
    messages TEXT
  )`);

  await db.query(`CREATE TABLE IF NOT EXISTS participants(
    id SERIAL,
    giveaway_id INT,
    user_id BIGINT,
    username TEXT,
    UNIQUE(giveaway_id,user_id)
  )`);
})();

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

// ---------- CREATE + POST ----------
app.post('/create', async (req,res)=>{
  const { user_id, text, winners, time, button, channels } = req.body;

  const r = await db.query(
    `INSERT INTO giveaways(owner_id,channels,text,winners,end_time,button)
     VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
    [user_id, JSON.stringify(channels), text, winners, time, button]
  );

  const id = r.rows[0].id;
  const messages = [];

  for(let ch of channels){
    try{
      const msg = await bot.telegram.sendMessage(ch, text, {
        reply_markup:{
          inline_keyboard:[
            [{
              text: button,
              url:`https://t.me/${process.env.BOT_USERNAME}?start=join_${id}`
            }]
          ]
        }
      });

      messages.push({
        chat_id: ch,
        message_id: msg.message_id
      });

    }catch(e){
      console.log(e.message);
    }
  }

  await db.query(
    `UPDATE giveaways SET messages=$1 WHERE id=$2`,
    [JSON.stringify(messages), id]
  );

  res.json({id});
});

// ---------- DELETE ----------
app.post('/delete', async (req,res)=>{
  const id = req.body.id;

  const g = await db.query(`SELECT * FROM giveaways WHERE id=$1`,[id]);
  if(!g.rows.length) return res.json({ok:false});

  const messages = JSON.parse(g.rows[0].messages || '[]');

  for(let m of messages){
    try{
      await bot.telegram.deleteMessage(m.chat_id, m.message_id);
    }catch{}
  }

  await db.query(`DELETE FROM giveaways WHERE id=$1`,[id]);

  res.json({ok:true});
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, ()=>{
  console.log('🌐 WEB READY ON', PORT);
});
// ---------- AUTO FINISH ----------
setInterval(async ()=>{
  const r = await db.query(`SELECT * FROM giveaways WHERE status='active'`);
  const now = Date.now();

  for(let g of r.rows){
    if(now >= g.end_time){

      const users = await db.query(
        `SELECT * FROM participants WHERE giveaway_id=$1`,
        [g.id]
      );

      if(!users.rows.length) continue;

      const winners = [];

      while(winners.length < g.winners){
        const u = users.rows[Math.floor(Math.random()*users.rows.length)];
        if(!winners.includes(u)) winners.push(u);
      }

      let text = '🎉 РЕЗУЛЬТАТИ\n\n';

      winners.forEach((w,i)=>{
        text += `${i+1}. @${w.username}\n`;
      });

      const channels = JSON.parse(g.channels);

      for(let ch of channels){
        await bot.telegram.sendMessage(ch, text);
      }

      await db.query(
        `UPDATE giveaways SET status='finished' WHERE id=$1`,
        [g.id]
      );
    }
  }
}, 10000);
