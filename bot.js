require('dotenv').config();

const { Telegraf, Markup } = require('telegraf');
const crypto = require('crypto');
const fs = require('fs');

const db = require('./db');
const state = require('./state');
const { allow } = require('./antiFraud');
const { genCaptcha } = require('./services/captcha');
const { checkAll } = require('./services/subscription');

const bot = new Telegraf(process.env.BOT_TOKEN);

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
    captcha BOOLEAN,
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

// ---------- CHECK CHANNEL ----------
async function checkChannel(username, userId){
  try{
    const chat = await bot.telegram.getChat(username);

    const botMember = await bot.telegram.getChatMember(chat.id, bot.botInfo.id);
    const userMember = await bot.telegram.getChatMember(chat.id, userId);

    const ok = ['administrator','creator'];

    if(!ok.includes(botMember.status)) return {error:'bot'};
    if(!ok.includes(userMember.status)) return {error:'user'};

    return {chat};
  }catch{
    return {error:'not_found'};
  }
}

// ---------- START ----------
bot.start(ctx=>{
  ctx.reply('🎁 Меню',Markup.inlineKeyboard([
    [{text:'🎁 Створити',callback_data:'create'}],
    [{text:'📊 Розіграші',callback_data:'list'}],
    [{text:'⚙️ Канали',callback_data:'channels'}]
  ]));
});

// ---------- CHANNELS UI ----------
bot.action('channels', async ctx=>{
  await ctx.answerCbQuery();

  const ch = await db.query(
    `SELECT * FROM channels WHERE user_id=$1`,
    [ctx.from.id]
  );

  ctx.editMessageText('📢 Канали:',{
    reply_markup:{
      inline_keyboard:[
        ...ch.rows.map(c=>[
          {text:c.username,callback_data:'noop'},
          {text:'❌',callback_data:`del_${c.chat_id}`}
        ]),
        [{text:'➕ Додати',callback_data:'add'}]
      ]
    }
  });
});

bot.action('add', async ctx=>{
  await ctx.answerCbQuery();
  state.set(ctx.from.id,{step:'add_channel'});
  ctx.reply('Введи @channel');
});

bot.on('text', async ctx=>{
  const s = state.get(ctx.from.id);
  if(!s) return;

  if(s.step==='add_channel'){
    const check = await checkChannel(ctx.message.text, ctx.from.id);

    if(check.error) return ctx.reply('❌ Помилка або нема прав');

    await db.query(
      `INSERT INTO channels(user_id,chat_id,username)
       VALUES($1,$2,$3)`,
      [ctx.from.id, check.chat.id, ctx.message.text]
    );

    ctx.reply('✅ Додано');
    state.clear(ctx.from.id);
  }
});

// ---------- CREATE ----------
bot.action('create', async ctx=>{
  await ctx.answerCbQuery();

  const ch = await db.query(
    `SELECT * FROM channels WHERE user_id=$1`,
    [ctx.from.id]
  );

  if(!ch.rows.length) return ctx.reply('❌ Додай канал');

  state.set(ctx.from.id,{step:'text',channels:ch.rows.map(c=>c.chat_id)});

  ctx.reply('Текст розіграшу:');
});

// ---------- FLOW ----------
bot.on('text', ctx=>{
  const s = state.get(ctx.from.id);
  if(!s) return;

  if(s.step==='text'){
    s.text = ctx.message.text;
    s.step='winners';
    return ctx.reply('К-сть переможців:');
  }

  if(s.step==='winners'){
    s.winners = Number(ctx.message.text);
    s.step='time';
    return ctx.reply('Час (хв):');
  }

  if(s.step==='time'){
    s.time = Date.now()+Number(ctx.message.text)*60000;
    s.step='button';
    return ctx.reply('Текст кнопки:');
  }

  if(s.step==='button'){
    s.button = ctx.message.text;
    s.step='preview';

    return ctx.reply(
`🎁 ПРЕВʼЮ

${s.text}`,
      Markup.inlineKeyboard([
        [{text:'✅ Опублікувати',callback_data:'publish'}]
      ])
    );
  }
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
          [{text:s.button,callback_data:`join_${id}`}]
        ]
      }
    });
  }

  ctx.reply('✅ Опубліковано');
  state.clear(ctx.from.id);
});

// ---------- JOIN ----------
bot.action(/join_(\d+)/, async ctx=>{
  await ctx.answerCbQuery();

  const id = ctx.match[1];

  const g = await db.query(`SELECT * FROM giveaways WHERE id=$1`,[id]);
  const channels = JSON.parse(g.rows[0].channels);

  const ok = await checkAll(bot, ctx.from.id, channels);

  if(!ok) return ctx.reply('❌ Підпишись на всі канали');

  await db.query(
    `INSERT INTO participants VALUES(DEFAULT,$1,$2,$3)`,
    [id,ctx.from.id,ctx.from.username||'no']
  );

  ctx.reply('✅ Участь прийнята');
});

// ---------- FINISH ----------
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
        const u = users.rows[crypto.randomInt(0,users.rows.length)];
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
console.log('🔥 CHANNEL BOT READY');
