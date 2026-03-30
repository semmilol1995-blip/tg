require('dotenv').config();

const { Telegraf, Markup } = require('telegraf');

const bot = new Telegraf(process.env.BOT_TOKEN);

// ---------- START ----------
bot.start(ctx=>{
  ctx.reply('🎁 Панель управління', Markup.inlineKeyboard([
    [{
      text:'🚀 Відкрити панель',
      web_app:{ url: process.env.WEB_URL }
    }]
  ]));
});

bot.launch();
console.log('🤖 BOT READY');