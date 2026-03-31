require('dotenv').config();

const express = require('express');
const path = require('path');
const multer = require('multer');

// FIX FETCH
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

const db = require('./db');
const bot = require('./bot');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'web')));

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
    image TEXT,
    status TEXT DEFAULT 'active',
    messages TEXT,
    winners_data TEXT
  )`);

  await db.query(`CREATE TABLE IF NOT EXISTS participants(
    id SERIAL,
    giveaway_id INT,
    user_id BIGINT,
    username TEXT,
    UNIQUE(giveaway_id,user_id)
  )`);
})();

// ---------- CHANNELS ----------
app.get('/channels/:user', async (req,res)=>{
  try{
    const r = await db.query(
      `SELECT * FROM channels WHERE user_id=$1`,
      [req.params.user]
    );

    const result = [];

    for(let ch of r.rows){
      try{
        const info = await bot.telegram.getChat(ch.chat_id);

        let photo = null;
        if(info.photo){
          photo = info.photo.big_file_id || info.photo.small_file_id;
        }

        result.push({
          ...ch,
          title: info.title,
          photo
        });

      }catch{
        result.push(ch);
      }
    }

    res.json(result);

  }catch(e){
    console.log('CHANNELS ERROR:', e.message);
    res.json([]);
  }
});

// ---------- ADD CHANNEL ----------
app.post('/channels/add', async (req,res)=>{
  const { user_id, input } = req.body;

  if(!input){
    return res.json({ok:false});
  }

  try{
    let chat;

    if(input.startsWith('@')){
      chat = await bot.telegram.getChat(input);
    }else{
      chat = await bot.telegram.getChat(Number(input));
    }

    const me = await bot.telegram.getMe();
    const member = await bot.telegram.getChatMember(chat.id, me.id);

    if(!['administrator','creator'].includes(member.status)){
      return res.json({ok:false});
    }

    await db.query(
      `INSERT INTO channels(user_id, chat_id, username)
       VALUES($1,$2,$3)`,
      [user_id, chat.id, chat.username || '']
    );

    res.json({ok:true});

  }catch(e){
    console.log(e.message);
    res.json({ok:false});
  }
});

// ---------- GIVEAWAYS ----------
app.get('/giveaways/:user', async (req,res)=>{
  try{
    const r = await db.query(
      `SELECT * FROM giveaways WHERE owner_id=$1 ORDER BY id DESC`,
      [req.params.user]
    );

    const result = [];

    for(const g of r.rows){
      const count = await db.query(
        `SELECT COUNT(*) FROM participants WHERE giveaway_id=$1`,
        [g.id]
      );

      result.push({
        ...g,
        participants: Number(count.rows[0].count)
      });
    }

    res.json(result);

  }catch(e){
    res.json([]);
  }
});

// ---------- CREATE ----------
app.post('/create', upload.single('image'), async (req,res)=>{

  const { user_id, text, winners, time, button } = req.body;

  let channels = JSON.parse(req.body.channels || '[]');

  let file_id = null;
  const messages = [];

  for(let ch of channels){
    try{
      const msg = await bot.telegram.sendMessage(ch, text,{
        reply_markup:{
          inline_keyboard:[[
            {
              text: button,
              url:`https://t.me/${process.env.BOT_USERNAME}?start=join_temp`
            }
          ]]
        }
      });

      messages.push({
        chat_id: ch,
        message_id: msg.message_id
      });

    }catch{}
  }

  const r = await db.query(
    `INSERT INTO giveaways(owner_id,channels,text,winners,end_time,button,image)
     VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [user_id, JSON.stringify(channels), text, winners, time, button, file_id]
  );

  const id = r.rows[0].id;

  for(let m of messages){
    await bot.telegram.editMessageReplyMarkup(
      m.chat_id,
      m.message_id,
      null,
      {
        inline_keyboard:[[
          {
            text: button,
            url:`https://t.me/${process.env.BOT_USERNAME}?start=join_${id}`
          }
        ]]
      }
    );
  }

  await db.query(
    `UPDATE giveaways SET messages=$1 WHERE id=$2`,
    [JSON.stringify(messages), id]
  );

  res.json({ok:true});
});

// ---------- REROLL ----------
app.post('/reroll', async (req,res)=>{
  const { id, place } = req.body;

  const g = await db.query(`SELECT * FROM giveaways WHERE id=$1`,[id]);
  if(!g.rows.length) return res.json({ok:false});

  let winners = JSON.parse(g.rows[0].winners_data || '[]');

  const users = await db.query(
    `SELECT * FROM participants WHERE giveaway_id=$1`,
    [id]
  );

  const used = winners.map(w=>w.user_id);
  const available = users.rows.filter(u => !used.includes(u.user_id));

  if(!available.length) return res.json({ok:false});

  const newWinner = available[Math.floor(Math.random()*available.length)];

  winners = winners.map(w =>
    w.place === Number(place)
      ? { place:Number(place), user_id:newWinner.user_id, username:newWinner.username }
      : w
  );

  await db.query(
    `UPDATE giveaways SET winners_data=$1 WHERE id=$2`,
    [JSON.stringify(winners), id]
  );

  const messages = JSON.parse(g.rows[0].messages || '[]');

  let text = '🎉 РЕЗУЛЬТАТИ\n\n';
  winners.forEach(w=>{
    text += `${w.place}. @${w.username}\n`;
  });

  for(let m of messages){
    try{
      await bot.telegram.editMessageText(
        m.chat_id,
        m.message_id,
        null,
        text
      );
    }catch{}
  }

  res.json({ok:true});
});

// ---------- AUTO RESULTS (FIXED) ----------
setInterval(async ()=>{
  const r = await db.query(`SELECT * FROM giveaways WHERE status='active'`);
  const now = Date.now();

  for(let g of r.rows){

    if(now >= g.end_time && g.status === 'active'){

      // 🔒 LOCK
      const lock = await db.query(
        `UPDATE giveaways SET status='processing' WHERE id=$1 AND status='active' RETURNING *`,
        [g.id]
      );

      if(!lock.rows.length) continue;

      const users = await db.query(
        `SELECT * FROM participants WHERE giveaway_id=$1`,
        [g.id]
      );

      if(!users.rows.length) continue;

      const winners = [];

      while(winners.length < g.winners){
        const u = users.rows[Math.floor(Math.random()*users.rows.length)];

        if(!winners.find(x=>x.user_id === u.user_id)){
          winners.push({
            place: winners.length + 1,
            user_id: u.user_id,
            username: u.username
          });
        }
      }

      let text = '🎉 РЕЗУЛЬТАТИ\n\n';

      winners.forEach(w=>{
        text += `${w.place}. @${w.username}\n`;
      });

      const messages = JSON.parse(g.messages || '[]');

      // 🔥 РЕДАГУЄМО СТАРЕ ПОВІДОМЛЕННЯ
      for(let m of messages){
        try{
          await bot.telegram.editMessageText(
            m.chat_id,
            m.message_id,
            null,
            text
          );
        }catch(e){
          console.log('EDIT ERROR:', e.message);
        }
      }

      await db.query(
        `UPDATE giveaways SET status='finished', winners_data=$1 WHERE id=$2 AND status='processing'`,
        [JSON.stringify(winners), g.id]
      );
    }
  }
}, 10000);

// ---------- START ----------
const PORT = process.env.PORT || 3000;

app.listen(PORT, ()=>{
  console.log('🌐 WEB READY ON', PORT);
});
