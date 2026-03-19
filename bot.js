const TelegramBot = require("node-telegram-bot-api");
const puppeteer = require("puppeteer");
const fs = require("fs-extra");
const path = require("path");
const fetch = require("node-fetch");
const express = require("express");

const token = process.env.TOKEN;
const url = process.env.RAILWAY_STATIC_URL;

const bot = new TelegramBot(token);

bot.setWebHook(`${url}/bot${token}`);

const app = express();
app.use(express.json());

app.post(`/bot${token}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

app.get("/", (req,res)=> res.send("OK"));

app.listen(process.env.PORT || 3000);

// ======================
// 🔥 LOGOS
// ======================

async function getLogoBase64(team){
  const filePath = path.join(__dirname, "logos", `${team}.png`);

  let finalPath = filePath;

  if(!(await fs.pathExists(filePath))){
    finalPath = path.join(__dirname, "logos", "default.png");
  }

  const file = await fs.readFile(finalPath);
  return `data:image/png;base64,${file.toString("base64")}`;
}

// ======================
// 🔥 POST (ТВОЯ ВЕРСІЯ)
// ======================

function getTitleSize(text){
  if(text.length > 18) return 48;
  if(text.length > 14) return 58;
  return 72;
}

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
    <div class="logoBox">
      <img src="${logo1}">
    </div>
    <div class="name">${t1}</div>
  </div>

  <div class="center">
    <div class="time">${center}</div>
    ${!isResult ? `<div class="bo">${bo.toUpperCase()}</div>` : ""}
  </div>

  <div class="team right">
    <div class="name">${t2}</div>
    <div class="logoBox">
      <img src="${logo2}">
    </div>
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

    const gridClass = games.length >= 6 ? "two" : "one";

    const titleText = isResult ? "РЕЗУЛЬТАТИ МАТЧІВ" : "МАТЧІ ДНЯ";
    const titleSize = getTitleSize(titleText);

    let html = await fs.readFile(path.join(__dirname, "template.html"), "utf8");

    html = html
      .replace("{{TITLE}}", titleText)
      .replace("{{TITLE_SIZE}}", titleSize + "px")
      .replace("{{MATCHES}}", htmlMatches)
      .replace("{{GRID_CLASS}}", gridClass);

    const browser = await puppeteer.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();

    await page.setViewport({ width: 900, height: 900 });
    await page.setContent(html);

    const filePath = path.join(__dirname, "result.png");

    await page.screenshot({ path: filePath });

    await browser.close();

    await bot.sendPhoto(msg.chat.id, filePath);

  }catch(e){
    console.log(e);
    bot.sendMessage(msg.chat.id,"Помилка 💀");
  }
});

// ======================
// 🔥 NEWS (ТВОЯ ІДЕАЛЬНА ВЕРСІЯ)
// ======================

function formatNewsText(text){
  text = text.replace(/_(.*?)_/g, '|||$1|||');

  const parts = text.split("|||");

  let result = "";

  parts.forEach((part, index)=>{
    const isAccent = index % 2 !== 0;

    const words = part.split(" ");
    let lines = [];

    while(words.length){
      lines.push(words.splice(0, 5).join(" "));
    }

    lines.forEach(l=>{
      result += `<span class="line ${isAccent ? "accent" : ""}">${l}</span>`;
    });
  });

  return result;
}

function getFontSize(text){
  const len = text.length;

  if(len < 80) return 44;
  if(len < 140) return 38;
  if(len < 220) return 32;
  return 28;
}

bot.on("message", async (msg)=>{
  try{
    if(!msg.caption || !msg.caption.startsWith("/news")) return;

    let fileId = msg.photo?.pop()?.file_id || msg.document?.file_id;

    if(!fileId){
      return bot.sendMessage(msg.chat.id,"Додай картинку разом з /news");
    }

    const lines = msg.caption.split("\n").slice(1);

    const label = lines[0] || "НОВИНА";
    const content = lines.slice(1).join(" ");

    const file = await bot.getFile(fileId);
    const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;

    const res = await fetch(fileUrl);
    const buffer = await res.arrayBuffer();

    const imageBase64 = `data:image/jpeg;base64,${Buffer.from(buffer).toString("base64")}`;

    const fontSize = getFontSize(content);

    let html = await fs.readFile(path.join(__dirname,"news-template.html"),"utf8");

    html = html
      .replace("{{IMAGE}}", imageBase64)
      .replace("{{LABEL}}", label.toUpperCase())
      .replace("{{TEXT}}", formatNewsText(content))
      .replace("{{FONTSIZE}}", fontSize + "px");

    const browser = await puppeteer.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();

    await page.setViewport({ width:900, height:900 });
    await page.setContent(html);

    const out = path.join(__dirname,"news.png");

    await page.screenshot({ path: out });

    await browser.close();

    await bot.sendPhoto(msg.chat.id, out);

  }catch(e){
    console.log(e);
    bot.sendMessage(msg.chat.id,"Помилка 💀");
  }
});
