require('dotenv').config();

const { Telegraf, Markup } = require('telegraf');
const crypto = require('crypto');
const fs = require('fs');

const db = require('./db');
const state = require('./state');
const { allow } = require('./antiFraud');

const { genCaptcha } = require('./services/captcha');
const { checkAll } = require('./services/subscription');

// ---------- KEYBOARD ----------
function subKeyboard(channels, id) {
  return {
    inline_keyboard: [
      ...channels.map(ch => [{
        text: `📢 ${ch.replace('@','')}`,
        url: `https://t.me/${ch.replace('@','')}`
      }]),
      [{ text: '🔍 Перевірити', callback_data: `check_${id}` }]
    ]
  };
}

const bot = new Telegraf(process.env.BOT_TOKEN);

// ---------- DB INIT ----------
(async () => {
  await db.query(`CREATE TABLE IF NOT EXISTS users (id BIGINT PRIMARY KEY)`);

  await db.query(`
    CREATE TABLE IF NOT EXISTS channels (
      id SERIAL,
      user_id BIGINT,
      chat_id BIGINT,
      username TEXT
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS giveaways (
      id SERIAL PRIMARY KEY,
      owner_id BIGINT,
      channels TEXT,
      text TEXT,
      photo TEXT,
      winners INT,
      end_time BIGINT,
      button TEXT,
      captcha BOOLEAN,
      status TEXT DEFAULT 'active'
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS participants (
      id SERIAL,
      giveaway_id INT,
      user_id BIGINT,
      username TEXT,
      UNIQUE(giveaway_id, user_id)
    )
  `);
})();

// ---------- START ----------
bot.start(async (ctx) => {
  await db.query(`INSERT INTO users VALUES($1) ON CONFLICT DO NOTHING`, [ctx.from.id]);

  ctx.reply('🎁 Меню', Markup.inlineKeyboard([
    [Markup.button.callback('🎁 Створити', 'create')],
    [Markup.button.callback('📊 Розіграші', 'list')],
    [Markup.button.callback('⚙️ Налаштування', 'settings')]
  ]));
});

// ---------- SETTINGS ----------
bot.action('settings', async (ctx)=>{
  await ctx.answerCbQuery();

  state.set(ctx.from.id,{step:'add_channel'});
  ctx.reply('📩 Перешли будь-який пост з каналу');
});

// ---------- ADD CHANNEL ----------
bot.on('message', async ctx=>{
  const s = state.get(ctx.from.id);
  if(!s) return;

  if(s.step==='add_channel'){
    try{
      const chat = ctx.message.forward_from_chat;

      await db.query(
        `INSERT INTO channels(user_id,chat_id,username)
         VALUES($1,$2,$3)`,
        [ctx.from.id, chat.id, chat.username]
      );

      ctx.reply('✅ Канал додано');
    }catch{
      ctx.reply('❌ Не вийшло додати');
    }

    state.clear(ctx.from.id);
  }
});

// ---------- CREATE ----------
bot.action('create', async ctx=>{
  await ctx.answerCbQuery();

  const ch = await db.query(`SELECT * FROM channels WHERE user_id=$1`,[ctx.from.id]);

  if(!ch.rows.length) return ctx.reply('❌ Спочатку додай канал');

  state.set(ctx.from.id,{step:'channels',channels:[]});

  ctx.reply('Обери канали:',Markup.inlineKeyboard(
    ch.rows.map(c=>[
      Markup.button.callback(`☑️ ${c.username}`,`ch_${c.chat_id}`)
    ]).concat([[Markup.button.callback('➡️ Далі','next')]])
  ));
});

// toggle channels
bot.action(/ch_(.+)/, async ctx=>{
  await ctx.answerCbQuery('✔️');

  const s = state.get(ctx.from.id);
  const id = ctx.match[1];

  if(!s.channels.includes(id)) s.channels.push(id);
  else s.channels = s.channels.filter(x=>x!==id);

  state.set(ctx.from.id,s);
});

// next
bot.action('next', async ctx=>{
  await ctx.answerCbQuery();

  const s = state.get(ctx.from.id);
  if(!s.channels.length) return ctx.answerCbQuery('Обери хоча б 1');

  s.step='text';
  state.set(ctx.from.id,s);

  ctx.reply('✍️ Введи текст розіграшу');
});

// ---------- TEXT FLOW ----------
bot.on('text', ctx=>{
  const s = state.get(ctx.from.id);
  if(!s) return;

  if(s.step==='text'){
    s.text = ctx.message.text;
    s.step='photo';
    state.set(ctx.from.id,s);
    return ctx.reply('📸 Відправ фото');
  }

  if(s.step==='time'){
    s.time = Date.now()+Number(ctx.message.text)*60000;
    s.step='winners';
    state.set(ctx.from.id,s);
    return ctx.reply('🏆 Скільки переможців?');
  }

  if(s.step==='winners'){
    s.winners = Number(ctx.message.text);
    s.step='button';
    state.set(ctx.from.id,s);
    return ctx.reply('🔘 Текст кнопки');
  }

  if(s.step==='button'){
    s.button = ctx.message.text;
    s.step='captcha';
    state.set(ctx.from.id,s);

    return ctx.reply('🤖 Включити капчу?',Markup.inlineKeyboard([
      [Markup.button.callback('✅ Так','cap_yes')],
      [Markup.button.callback('❌ Ні','cap_no')]
    ]));
  }
});

// ---------- PHOTO ----------
bot.on('photo', ctx=>{
  const s = state.get(ctx.from.id);
  if(!s || s.step!=='photo') return;

  s.photo = ctx.message.photo.pop().file_id;
  s.step='time';
  state.set(ctx.from.id,s);

  ctx.reply('⏱ Через скільки хвилин завершити?');
});

// ---------- FINISH CREATE ----------
bot.action('cap_yes', async ctx=>{
  await ctx.answerCbQuery();
  finish(ctx,true);
});

bot.action('cap_no', async ctx=>{
  await ctx.answerCbQuery();
  finish(ctx,false);
});

async function finish(ctx,captcha){
  const s = state.get(ctx.from.id);

  const r = await db.query(
    `INSERT INTO giveaways(owner_id,channels,text,photo,winners,end_time,button,captcha)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [
      ctx.from.id,
      JSON.stringify(s.channels),
      s.text,
      s.photo,
      s.winners,
      s.time,
      s.button,
      captcha
    ]
  );

  const id = r.rows[0].id;

  for(let ch of s.channels){
    await bot.telegram.sendPhoto(ch,s.photo,{
      caption:s.text,
      reply_markup:{
        inline_keyboard:[
          [{text:s.button,callback_data:`join_${id}`}]
        ]
      }
    });
  }

  ctx.reply('✅ Розіграш створено');
  state.clear(ctx.from.id);
}

// ---------- JOIN ----------
bot.action(/join_(\d+)/, async ctx=>{
  await ctx.answerCbQuery();

  if(!allow(ctx.from.id)) return;

  const id = ctx.match[1];

  const g = await db.query(`SELECT * FROM giveaways WHERE id=$1`,[id]);
  const giveaway = g.rows[0];

  const channels = JSON.parse(giveaway.channels);

  return ctx.reply(
    '📢 Підпишись на всі канали:',
    subKeyboard(channels,id)
  );
});

// ---------- CHECK ----------
bot.action(/check_(\d+)/, async ctx=>{
  await ctx.answerCbQuery();

  const id = ctx.match[1];

  const g = await db.query(`SELECT * FROM giveaways WHERE id=$1`,[id]);
  const giveaway = g.rows[0];

  const channels = JSON.parse(giveaway.channels);

  const ok = await checkAll(bot, ctx.from.id, channels);

  if(!ok) return ctx.answerCbQuery('❌ Не підписаний');

  if(giveaway.captcha){
    const cap = genCaptcha();

    return ctx.reply(`Натисни ${cap.target}`,{
      reply_markup:{
        inline_keyboard:[
          cap.buttons.map(e=>({
            text:e,
            callback_data:`cap_${e}_${cap.target}_${id}`
          }))
        ]
      }
    });
  }

  await add(ctx,id);
});

// ---------- CAPTCHA ----------
bot.action(/cap_(.+)_(.+)_(\d+)/, async ctx=>{
  await ctx.answerCbQuery();

  const [_,sel,target,id] = ctx.match;
  if(sel!==target) return ctx.answerCbQuery('❌');

  await add(ctx,id);
});

// ---------- ADD USER ----------
async function add(ctx,id){
  if(!allow(ctx.from.id)) return ctx.answerCbQuery('⏳');

  try{
    await db.query(
      `INSERT INTO participants VALUES(DEFAULT,$1,$2,$3)`,
      [id,ctx.from.id,ctx.from.username||'no']
    );

    ctx.reply('✅ Ти береш участь');
  }catch{
    ctx.answerCbQuery('Вже є');
  }
}

// ---------- LIST ----------
bot.action('list', async ctx=>{
  await ctx.answerCbQuery();

  const r = await db.query(
    `SELECT * FROM giveaways WHERE owner_id=$1 ORDER BY id DESC`,
    [ctx.from.id]
  );

  if(!r.rows.length) return ctx.reply('❌ Нема розіграшів');

  ctx.reply('📊 Твої розіграші:',Markup.inlineKeyboard(
    r.rows.map(g=>[
      Markup.button.callback(`#${g.id} | ${g.status}`,`g_${g.id}`)
    ])
  ));
});

// ---------- GIVEAWAY MENU ----------
bot.action(/g_(\d+)/, async ctx=>{
  await ctx.answerCbQuery();

  const id = ctx.match[1];

  ctx.reply(`🎁 Розіграш #${id}`,{
    reply_markup:{
      inline_keyboard:[
        [{text:'👥 Учасники',callback_data:`users_${id}`}],
        [{text:'📁 Експорт',callback_data:`export_${id}`}],
        [{text:'🔄 Рерол',callback_data:`reroll_${id}`}],
        [{text:'⛔ Завершити',callback_data:`finish_${id}`}],
        [{text:'❌ Скасувати',callback_data:`cancel_${id}`}]
      ]
    }
  });
});

// ---------- USERS ----------
bot.action(/users_(\d+)/, async ctx=>{
  await ctx.answerCbQuery();

  const r = await db.query(
    `SELECT COUNT(*) FROM participants WHERE giveaway_id=$1`,
    [ctx.match[1]]
  );

  ctx.answerCbQuery(`👥 ${r.rows[0].count}`);
});

// ---------- EXPORT ----------
bot.action(/export_(\d+)/, async ctx=>{
  await ctx.answerCbQuery();

  const id = ctx.match[1];

  const r = await db.query(
    `SELECT username FROM participants WHERE giveaway_id=$1`,
    [id]
  );

  const txt = r.rows.map(u=>'@'+u.username).join('\n');

  const file = `g_${id}.txt`;
  fs.writeFileSync(file,txt);

  await ctx.replyWithDocument({source:file});
  fs.unlinkSync(file);
});

// ---------- REROLL ----------
bot.action(/reroll_(\d+)/, async ctx=>{
  await ctx.answerCbQuery();

  const r = await db.query(
    `SELECT * FROM participants WHERE giveaway_id=$1`,
    [ctx.match[1]]
  );

  const w = r.rows[crypto.randomInt(0,r.rows.length)];

  ctx.reply(`🔄 Новий: @${w.username}`);
});

// ---------- CANCEL ----------
bot.action(/cancel_(\d+)/, async ctx=>{
  await ctx.answerCbQuery();

  await db.query(
    `UPDATE giveaways SET status='canceled' WHERE id=$1`,
    [ctx.match[1]]
  );

  ctx.reply('❌ Скасовано');
});

// ---------- FINISH ----------
bot.action(/finish_(\d+)/, async ctx=>{
  await ctx.answerCbQuery();

  await finishGiveaway(ctx.match[1]);
  ctx.reply('⛔ Завершено');
});

// ---------- AUTO FINISH ----------
setInterval(async ()=>{
  const now = Date.now();

  const r = await db.query(`SELECT * FROM giveaways WHERE status='active'`);

  for(let g of r.rows){
    if(now>=g.end_time){
      await finishGiveaway(g.id);
    }
  }
},5000);

// ---------- FINISH LOGIC ----------
async function finishGiveaway(id){
  const users = await db.query(
    `SELECT * FROM participants WHERE giveaway_id=$1`,
    [id]
  );

  if(!users.rows.length) return;

  const g = await db.query(`SELECT * FROM giveaways WHERE id=$1`,[id]);
  const giveaway = g.rows[0];

  const winners = [];

  while(winners.length<giveaway.winners){
    const u = users.rows[crypto.randomInt(0,users.rows.length)];
    if(!winners.includes(u)) winners.push(u);
  }

  let text='🎉 РЕЗУЛЬТАТИ\n\n';
  winners.forEach((w,i)=>text+=`${i+1}. @${w.username}\n`);

  const channels = JSON.parse(giveaway.channels);

  for(let ch of channels){
    await bot.telegram.sendPhoto(ch,giveaway.photo,{
      caption:text
    });
  }

  await db.query(
    `UPDATE giveaways SET status='finished' WHERE id=$1`,
    [id]
  );
}

bot.launch();
console.log('🔥 V6 PRO MAX WORKING');
