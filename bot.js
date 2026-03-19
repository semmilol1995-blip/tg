const TelegramBot = require("node-telegram-bot-api");
const puppeteer = require("puppeteer");
const fs = require("fs-extra");
const path = require("path");
const express = require("express");

const token = process.env.TOKEN;
const bot = new TelegramBot(token);

const app = express();
app.use(express.json());

/* =========================
   WEBHOOK (ОСНОВА)
========================= */
app.post(`/${token}`, async (req, res) => {
  try {
    bot.processUpdate(req.body);
    res.sendStatus(200);
  } catch (e) {
    console.log("Webhook error:", e);
    res.sendStatus(500);
  }
});

app.get("/", (req, res) => {
  res.send("BOT WORKING 🚀");
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Server started");
});

/* =========================
   HELPERS
========================= */

async function getLogoBase64(team){
  const filePath = path.join(__dirname, "logos", `${team}.png`);

  let finalPath = filePath;

  if(!(await fs.pathExists(filePath))){
    finalPath = path.join(__dirname, "logos", "default.png");
  }

  const file = await fs.readFile(finalPath);
  return `data:image/png;base64,${file.toString("base64")}`;
}

function getTitleSize(text){
  if(text.length > 18) return 48;
  if(text.length > 14) return 58;
  return 72;
}

/* =========================
   /post
========================= */

function parseLines(text){
  const lines = text.split("\n").slice(1);

  return lines.map(line=>{
    line = line.trim();

    let match = line.match(/^(.+?)\s+vs\s+(.+?)\s+(\d{1,2}:\d{2})(?:\s+(bo\d))?$/i);
    if(match){
      return {
        type:"match",
        t1:match[1].trim(),
        t2:match[2].trim(),
        center:match[3],
        bo: match[4] || "bo3"
      };
    }

    let result = line.match(/^(.+?)\s+(\d+:\d+)\s+(.+)$/i);
    if(result){
      return {
        type:"result",
        t1:result[1].trim(),
        center:result[2],
        t2:result[3].trim(),
        bo:""
      };
    }

    return null;
  }).filter(Boolean);
}

function matchBlock(t1, t2, center, logo1, logo2, bo, isResult){
return `
<div class="match">
  <div class="team">
    <img src="${logo1}">
    <div>${t1}</div>
  </div>

  <div class="center">
    <div>${center}</div>
    ${!isResult ? `<div>${bo.toUpperCase()}</div>` : ""}
  </div>

  <div class="team">
    <div>${t2}</div>
    <img src="${logo2}">
  </div>
</div>
`;
}

bot.onText(/\/post([\s\S]*)/, async (msg, match)=>{
  try{
    const games = parseLines(match[0]);

    if(!games.length){
      return bot.sendMessage(msg.chat.id, "Невірний формат");
    }

    let htmlMatches = "";
    let isResult = false;

    for(const g of games){
      if(g.type === "result") isResult = true;

      const logo1 = await getLogoBase64(g.t1.toLowerCase());
      const logo2 = await getLogoBase64(g.t2.toLowerCase());

      htmlMatches += matchBlock(
        g.t1.toUpperCase(),
        g.t2.toUpperCase(),
        g.center,
        logo1,
        logo2,
        g.bo,
        g.type === "result"
      );
    }

    let html = `
    <html>
    <body style="background:#0f0f1a;color:white;font-family:sans-serif">
    <h1>${isResult ? "РЕЗУЛЬТАТИ" : "МАТЧІ ДНЯ"}</h1>
    ${htmlMatches}
    </body>
    </html>
    `;

    const browser = await puppeteer.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 900, height: 900 });
    await page.setContent(html);

    const filePath = path.join(__dirname, "post.png");

    await page.screenshot({ path: filePath });
    await browser.close();

    await bot.sendPhoto(msg.chat.id, filePath);

  }catch(e){
    console.log(e);
    bot.sendMessage(msg.chat.id,"Помилка 💀");
  }
});

/* =========================
   /news
========================= */

bot.onText(/\/news([\s\S]*)/, async (msg, match)=>{
  try{
    const text = match[1].trim();

    if(!text){
      return bot.sendMessage(msg.chat.id,"Напиши текст новини");
    }

    const html = `
    <html>
    <body style="
      margin:0;
      width:900px;
      height:900px;
      background:url('https://i.imgur.com/yourimage.jpg') center/cover;
      display:flex;
      flex-direction:column;
      justify-content:flex-end;
      align-items:center;
      color:white;
      font-family:sans-serif;
    ">

    <div style="
      background:rgba(0,0,0,0.85);
      border:2px solid #a855f7;
      padding:40px;
      width:80%;
      text-align:center;
      margin-bottom:80px;
    ">
      <div style="color:#a855f7;font-size:40px;font-weight:bold">
        ${text}
      </div>
    </div>

    <div style="
      position:absolute;
      bottom:20px;
      font-size:20px;
      opacity:0.8;
    ">
      t.me/zbr4_cast
    </div>

    </body>
    </html>
    `;

    const browser = await puppeteer.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 900, height: 900 });
    await page.setContent(html);

    const filePath = path.join(__dirname, "news.png");

    await page.screenshot({ path: filePath });
    await browser.close();

    await bot.sendPhoto(msg.chat.id, filePath);

  }catch(e){
    console.log(e);
    bot.sendMessage(msg.chat.id,"Помилка news 💀");
  }
});
