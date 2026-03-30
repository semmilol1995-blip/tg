require('dotenv').config();

const { Telegraf, Markup } = require('telegraf');
const db = require('./db');

const bot = new Telegraf(process.env.BOT_TOKEN);

// ---------- START ----------
bot.start(async ctx=>{
  const param = ctx.message.text.split(' ')[1];

  if(param && param.startsWith('join_')){
    const id = param.split('_')[1];

    const g = await db.query(`SELECT * FROM giveaways WHERE id=$1`,[id]);
    if(!g.rows.length) return ctx.reply('❌ Розіграш не знайдено');

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
        [id, ctx.from.id, ctx.from.username || 'no']
      );
    }catch{}

    return ctx.reply('✅ Ти береш участь');
  }

  ctx.reply('🎁 Панель', Markup.inlineKeyboard([
    [{
      text:'🚀 Відкрити панель',
      web_app:{ url: process.env.WEB_URL }
    }]
  ]));
});

bot.launch();
console.log('🤖 BOT READY');

module.exports = bot;
