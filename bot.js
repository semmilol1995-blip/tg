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

  // 🔥 FIX: відсікаємо temp / криві значення
  if(!id || isNaN(id)){
    return ctx.reply('⏳ Розіграш ще створюється, спробуй ще раз');
  }

      const g = await db.query(
        `SELECT * FROM giveaways WHERE id=$1`,
        [id]
      );

      if(!g.rows.length){
        return ctx.reply('❌ Розіграш не знайдено');
      }

      const giveaway = g.rows[0];
      const channels = JSON.parse(giveaway.channels || '[]');

      const notSubscribed = [];
      const channelButtons = [];

      // 🔥 ПЕРЕВІРКА ПІДПИСОК
      for(let ch of channels){
        try{
          const m = await bot.telegram.getChatMember(ch, ctx.from.id);

          if(!['member','administrator','creator'].includes(m.status)){
            notSubscribed.push(ch);
          }

        }catch(e){
          console.log('SUB CHECK ERROR:', e.message);
          return ctx.reply('❌ Не вдалося перевірити підписку');
        }
      }

      // ❌ якщо є не підписані
      if(notSubscribed.length){

        for(let ch of notSubscribed){
          try{
            const info = await bot.telegram.getChat(ch);

            if(info.username){
              channelButtons.push([{
                text: `📢 ${info.title || 'Канал'}`,
                url: `https://t.me/${info.username}`
              }]);
            }

          }catch{}
        }

        return ctx.reply(
          '❌ Щоб взяти участь — підпишись на всі канали 👇',
          Markup.inlineKeyboard(channelButtons)
        );
      }

      // 🔥 ПЕРЕВІРКА ДУБЛЯ
      const exists = await db.query(
        `SELECT * FROM participants WHERE giveaway_id=$1 AND user_id=$2`,
        [id, ctx.from.id]
      );

      if(exists.rows.length){
        return ctx.reply('⚠️ Ти вже береш участь');
      }

      // 🔥 ЗАПИС
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

// ---------- SAFE LAUNCH ----------
bot.telegram.deleteWebhook().catch(()=>{});

bot.launch()
  .then(()=>console.log('🤖 BOT READY'))
  .catch(e=>console.log('BOT LAUNCH ERROR:', e.message));

// ---------- GRACEFUL STOP ----------
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

module.exports = bot;
