require('dotenv').config();

const express = require('express');
const path = require('path');
const multer = require('multer');


const upload = multer({ storage: multer.memoryStorage() });

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

// ---------- CHANNELS ----------
app.get('/channels/:user', async (req,res)=>{
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

    }catch(e){
      console.log('CHANNEL ERROR:', e.message);
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

  let channels = [];

  try{
    const raw = req.body.channels;

    if(!raw) channels = [];
    else if(raw.startsWith('[')) channels = JSON.parse(raw);
    else channels = [raw];

  }catch{
    channels = [];
  }

  channels = channels.map(ch => Number(ch)).filter(Boolean);

  if(!channels.length){
    return res.json({ok:false});
  }

  let file_id = null;
  const messages = [];

  for(let ch of channels){
    try{
      let msg;

      if(req.file){
        msg = await bot.telegram.sendPhoto(ch, {
          source: req.file.buffer
        },{
          caption: text,
          reply_markup:{
            inline_keyboard:[
              [{
                text: button,
                url:`https://t.me/${process.env.BOT_USERNAME}?start=join_temp`
              }]
            ]
          }
        });

        // ✅ ФІКС: не перезаписуємо file_id
        if(!file_id && msg.photo && msg.photo.length){
          file_id = msg.photo[msg.photo.length - 1].file_id;
        }

      }else{
        msg = await bot.telegram.sendMessage(ch, text,{
          reply_markup:{
            inline_keyboard:[
              [{
                text: button,
                url:`https://t.me/${process.env.BOT_USERNAME}?start=join_temp`
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
      console.log('SEND ERROR:', e.message);
    }
  }

  const r = await db.query(
    `INSERT INTO giveaways(owner_id,channels,text,winners,end_time,button,image)
     VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [user_id, JSON.stringify(channels), text, winners, time, button, file_id]
  );

  const id = r.rows[0].id;

  for(let m of messages){
    try{
      await bot.telegram.editMessageReplyMarkup(
        m.chat_id,
        m.message_id,
        null,
        {
          inline_keyboard:[
            [{
              text: button,
              url:`https://t.me/${process.env.BOT_USERNAME}?start=join_${id}`
            }]
          ]
        }
      );
    }catch{}
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
    await bot.telegram.sendMessage(ch, `🔄 Новий переможець:\n@${winner.username}`);
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

// ---------- FILE PROXY ----------
app.get('/file/:id', async (req,res)=>{
  try{
    const file = await bot.telegram.getFile(String(req.params.id));

    const url = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;

    const response = await fetch(url);

    if(!response.ok){
      throw new Error('Fetch failed');
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    res.set('Content-Type', response.headers.get('content-type') || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=31536000');

    res.send(buffer);

  }catch(e){
    console.log('FILE ERROR:', e.message);
    res.status(404).send('not found');
  }
});

// ---------- START ----------
const PORT = process.env.PORT || 3000;

app.listen(PORT, ()=>{
  console.log('🌐 WEB READY ON', PORT);
});
