require('dotenv').config();

const express = require('express');
const path = require('path');
const multer = require('multer');

const upload = multer({ dest: 'uploads/' });

const db = require('./db');
const bot = require('./bot');

const app = express();
app.use(express.json());

// 🔥 ДОДАНО — щоб віддавати картинки
app.use('/uploads', express.static('uploads'));

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
    image TEXT, -- 🔥 ДОДАНО
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

// ---------- CHANNELS (🔥 АВАТАР + TITLE) ----------
app.get('/channels/:user', async (req,res)=>{
  const r = await db.query(
    `SELECT * FROM channels WHERE user_id=$1`,
    [req.params.user]
  );

  const result = [];

  for(let ch of r.rows){
    try{
      const info = await bot.telegram.getChat(ch.chat_id);

      result.push({
        ...ch,
        title: info.title,
        photo: info.photo?.small_file_id || null
      });

    }catch{
      result.push(ch);
    }
  }

  res.json(result);
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
app.post('/create', upload.single('image'), async (req,res)=>{

  const { user_id, text, winners, time, button } = req.body;

  // 💣 FIX CHANNELS
  let channels = [];

  try{
    const raw = req.body.channels;

    if(!raw){
      channels = [];
    }
    else if(raw.startsWith('[')){
      channels = JSON.parse(raw);
    }
    else{
      channels = [raw];
    }

  }catch(e){
    console.log('CHANNELS PARSE ERROR:', req.body.channels);
    channels = [];
  }

  channels = channels.map(ch => Number(ch)).filter(Boolean);

  console.log('FINAL CHANNELS:', channels);
  console.log('FILE:', req.file);

  if(!channels.length){
    return res.json({ok:false, error:'NO_CHANNELS'});
  }

  // 🔥 ДОДАНО
  const image = req.file ? req.file.filename : null;

  const r = await db.query(
    `INSERT INTO giveaways(owner_id,channels,text,winners,end_time,button,image)
     VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [user_id, JSON.stringify(channels), text, winners, time, button, image]
  );

  const id = r.rows[0].id;
  const messages = [];

  for(let ch of channels){
    try{
      console.log('SEND TO:', ch);

      let msg;

      if(req.file){
        msg = await bot.telegram.sendPhoto(ch, {
          source: req.file.path
        },{
          caption: text,
          reply_markup:{
            inline_keyboard:[
              [{
                text: button,
                url:`https://t.me/${process.env.BOT_USERNAME}?start=join_${id}`
              }]
            ]
          }
        });
      }else{
        msg = await bot.telegram.sendMessage(ch, text,{
          reply_markup:{
            inline_keyboard:[
              [{
                text: button,
                url:`https://t.me/${process.env.BOT_USERNAME}?start=join_${id}`
              }]
            ]
          }
        });
      }

      messages.push({
        chat_id: ch,
        message_id: msg.message_id
      });

    }catch(e){
      console.log('SEND ERROR:', ch, e.message);
    }
  }

  await db.query(
    `UPDATE giveaways SET messages=$1 WHERE id=$2`,
    [JSON.stringify(messages), id]
  );

  res.json({ok:true});
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

// ---------- REROLL ----------
app.post('/reroll', async (req,res)=>{
  const id = req.body.id;

  const users = await db.query(
    `SELECT * FROM participants WHERE giveaway_id=$1`,
    [id]
  );

  if(!users.rows.length) return res.json({ok:false});

  const winner = users.rows[Math.floor(Math.random()*users.rows.length)];

  const g = await db.query(`SELECT * FROM giveaways WHERE id=$1`,[id]);
  const channels = JSON.parse(g.rows[0].channels || '[]');

  for(let ch of channels){
    try{
      await bot.telegram.sendMessage(ch, `🔄 Новий переможець:\n@${winner.username}`);
    }catch(e){
      console.log('REROLL ERROR:', e.message);
    }
  }

  res.json({ok:true});
});

// ---------- AUTO RESULTS ----------
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

      const channels = JSON.parse(g.channels || '[]');

      for(let ch of channels){
        await bot.telegram.sendMessage(ch, text);
      }

      await db.query(`UPDATE giveaways SET status='finished' WHERE id=$1`,[g.id]);
    }
  }
}, 10000);

// ---------- START ----------
const PORT = process.env.PORT || 3000;

app.listen(PORT, ()=>{
  console.log('🌐 WEB READY ON', PORT);
});
