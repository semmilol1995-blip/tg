require('dotenv').config();

const { Telegraf, Markup } = require('telegraf');
const db = require('./db');

const bot = new Telegraf(process.env.BOT_TOKEN);

// ---------- START ----------
bot.start(async ctx=>{
  try{
    const text = ctx.message.text || '';
    const param = text.split(' ')[1];

    // ---------- JOIN FLOW ----------
    if(param && param.startsWith('join_')){
      const id = param.split('_')[1];

      const g = await db.query(
        `SELECT * FROM giveaways WHERE id=$1`,
        [id]
      );

      if(!g.rows.length){
        return ctx.reply('❌ Розіграш не знайдено');
      }

      const giveaway = g.rows[0];
      const channels = JSON.parse(giveaway.channels || '[]');

      // 🔥 перевірка підписок
      for(let ch of channels){
        try{
          const m = await bot.telegram.getChatMember(ch, ctx.from.id);

          if(!['member','administrator','creator'].includes(m.status)){
            return ctx.reply('❌ Підпишись на всі канали для участі');
          }
        }catch{
          return ctx.reply('❌ Не вдалося перевірити підписку');
        }
      }

      // 🔥 перевірка дубля
      const exists = await db.query(
        `SELECT * FROM participants WHERE giveaway_id=$1 AND user_id=$2`,
        [id, ctx.from.id]
      );

      if(exists.rows.length){
        return ctx.reply('⚠️ Ти вже береш участь');
      }

      // 🔥 запис
      await db.query(
        `INSERT INTO participants(giveaway_id,user_id,username)
         VALUES($1,$2,$3)`,
        [id, ctx.from.id, ctx.from.username || 'no']
      );

      return ctx.reply('✅ Ти успішно береш участь!');
    }

    // ---------- DEFAULT ----------
    ctx.reply(
      '🎁 Панель управління',
      Markup.inlineKeyboard([
        [{
          text:'🚀 Відкрити панель',
          web_app:{ url: process.env.WEB_URL }
        }]
      ])
    );

  }catch(e){
    console.log('BOT ERROR:', e.message);
    ctx.reply('❌ Помилка. Спробуй ще раз');
  }
});

// ---------- LAUNCH ----------
bot.launch()
  .then(()=>console.log('🤖 BOT READY'))
  .catch(e=>console.log('BOT LAUNCH ERROR:', e.message));

module.exports = bot;
