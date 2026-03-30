require('dotenv').config();

const { Telegraf, Markup } = require('telegraf');
const crypto = require('crypto');

const db = require('./db');
const state = require('./state');

const bot = new Telegraf(process.env.BOT_TOKEN);

// ---------- DB ----------
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
    status TEXT DEFAULT 'active'
  )`);

  await db.query(`CREATE TABLE IF NOT EXISTS participants(
    id SERIAL,
    giveaway_id INT,
    user_id BIGINT,
    username TEXT,
    UNIQUE(giveaway_id,user_id)
  )`);
})();

// ---------- MENU ----------
function menu(){
  return Markup.inlineKeyboard([
    [{text:'🎁 Створити',callback_data:'create'}],
    [{text:'📊 Розіграші',callback_data:'list'}],
    [{text:'⚙️ Канали',callback_data:'channels'}]
  ]);
}

// ---------- CALENDAR ----------
function buildCalendar(offset = 0){
  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth()+offset, 1);

  const year = base.getFullYear();
  const month = base.getMonth();

  const lastDay = new Date(year, month+1, 0).getDate();

  const rows = [];
  let row = [];

  for(let d=1; d<=lastDay; d++){
    const date = new Date(year, month, d);

    if(date < now) continue;

    row.push({
      text: d.toString(),
      callback_data: `pick_${date.toISOString()}`
    });

    if(row.length === 5){
      rows.push(row);
      row = [];
    }
  }

  if(row.length) rows.push(row);

  rows.push([
    {text:'⬅️', callback_data:`cal_${offset-1}`},
    {text:'➡️', callback_data:`cal_${offset+1}`}
  ]);

  return rows;
}

// ---------- START ----------
bot.start(async ctx=>{
  const param = ctx.message.text.split(' ')[1];

  if(param && param.startsWith('join_')){
    const id = param.split('_')[1];
    await joinUser(ctx, id);
    return ctx.reply('✅ Ти береш участь');
  }

  ctx.reply('🎁 Меню', menu());
});

// ---------- CHANNEL CHECK ----------
async function checkChannel(username, userId){
  try{
    const chat = await bot.telegram.getChat(username);

    const botMember = await bot.telegram.getChatMember(chat.id, bot.botInfo.id);
    const userMember = await bot.telegram.getChatMember(chat.id, userId);

    if(!['administrator','creator'].includes(botMember.status)) return {error:'bot'};
    if(!['administrator','creator'].includes(userMember.status)) return {error:'user'};

    return {chat};
  }catch{
    return {error:'not_found'};
  }
}

// ---------- CREATE ----------
bot.action('create', async ctx=>{
  await ctx.answerCbQuery();

  const ch = await db.query(`SELECT * FROM channels WHERE user_id=$1`,[ctx.from.id]);
  if(!ch.rows.length) return ctx.reply('❌ Додай канал');

  state.set(ctx.from.id,{
    step:'text',
    channels: ch.rows.map(c=>c.chat_id)
  });

  ctx.reply('Текст розіграшу:');
});

// ---------- FLOW ----------
bot.on('text', async ctx=>{
  const s = state.get(ctx.from.id);
  if(!s) return;

  if(s.step==='text'){
    s.text = ctx.message.text;
    s.step='winners';
    return ctx.reply('К-сть переможців:');
  }

  if(s.step==='winners'){
    s.winners = Number(ctx.message.text);
    s.step='calendar';
    return ctx.reply(
      '📅 Обери дату:',
      {reply_markup:{inline_keyboard:buildCalendar()}}
    );
  }

  if(s.step==='button'){
    s.button = ctx.message.text;
    s.step='preview';

    return ctx.reply(
`🎁 ПРЕВʼЮ

${s.text}

🏆 ${s.winners} переможців`,
      Markup.inlineKeyboard([
        [{text:'✅ Опублікувати',callback_data:'publish'}]
      ])
    );
  }
});

// ---------- CALENDAR NAV ----------
bot.action(/cal_(.+)/, async ctx=>{
  await ctx.answerCbQuery();

  const offset = Number(ctx.match[1]);

  ctx.editMessageText(
    '📅 Обери дату:',
    {reply_markup:{inline_keyboard:buildCalendar(offset)}}
  );
});

// ---------- PICK DATE ----------
bot.action(/pick_(.+)/, async ctx=>{
  await ctx.answerCbQuery();

  const s = state.get(ctx.from.id);

  s.date = ctx.match[1];
  s.step = 'time';

  ctx.editMessageText(
    '⏰ Обери час:',
    {
      reply_markup:{
        inline_keyboard:[
          [{text:'10:00',callback_data:'t_10'}],
          [{text:'12:00',callback_data:'t_12'}],
          [{text:'15:00',callback_data:'t_15'}],
          [{text:'18:00',callback_data:'t_18'}],
          [{text:'21:00',callback_data:'t_21'}]
        ]
      }
    }
  );
});

// ---------- PICK TIME ----------
bot.action(/t_(\d+)/, async ctx=>{
  await ctx.answerCbQuery();

  const s = state.get(ctx.from.id);

  const hour = Number(ctx.match[1]);
  const d = new Date(s.date);

  d.setHours(hour,0,0);

  s.time = d.getTime();
  s.step = 'button';

  ctx.editMessageText('🔘 Введи текст кнопки:');
});

// ---------- PUBLISH ----------
bot.action('publish', async ctx=>{
  await ctx.answerCbQuery();

  const s = state.get(ctx.from.id);

  const r = await db.query(
    `INSERT INTO giveaways(owner_id,channels,text,winners,end_time,button)
     VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
    [
      ctx.from.id,
      JSON.stringify(s.channels),
      s.text,
      s.winners,
      s.time,
      s.button
    ]
  );

  const id = r.rows[0].id;

  for(let ch of s.channels){
    await bot.telegram.sendMessage(ch,s.text,{
      reply_markup:{
        inline_keyboard:[
          [{
            text:s.button,
            url:`https://t.me/${process.env.BOT_USERNAME}?start=join_${id}`
          }]
        ]
      }
    });
  }

  ctx.reply('✅ Опубліковано');
  state.clear(ctx.from.id);
});

// ---------- JOIN ----------
async function joinUser(ctx,id){
  const g = await db.query(`SELECT * FROM giveaways WHERE id=$1`,[id]);
  const channels = JSON.parse(g.rows[0].channels);

  for(let ch of channels){
    const m = await bot.telegram.getChatMember(ch, ctx.from.id);
    if(!['member','administrator','creator'].includes(m.status)){
      return ctx.reply('❌ Підпишись на всі канали');
    }
  }

  try{
    await db.query(
      `INSERT INTO participants VALUES(DEFAULT,$1,$2,$3)`,
      [id,ctx.from.id,ctx.from.username||'no']
    );
  }catch{}

  ctx.reply('✅ Ти береш участь');
}

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

      while(winners.length<g.winners){
        const u = users.rows[Math.floor(Math.random()*users.rows.length)];
        if(!winners.includes(u)) winners.push(u);
      }

      let text='🎉 РЕЗУЛЬТАТИ\n\n';
      winners.forEach((w,i)=>text+=`${i+1}. @${w.username}\n`);

      const channels = JSON.parse(g.channels);

      for(let ch of channels){
        await bot.telegram.sendMessage(ch,text);
      }

      await db.query(`UPDATE giveaways SET status='finished' WHERE id=$1`,[g.id]);
    }
  }
},5000);

bot.launch();
console.log('🔥 FULL CALENDAR READY');
