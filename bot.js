const TelegramBot = require("node-telegram-bot-api");
const puppeteer = require("puppeteer");
const fs = require("fs-extra");
const path = require("path");

const token = process.env.TOKEN;

/* =========================
   BOT INIT (ANTI 409)
========================= */
const bot = new TelegramBot(token, { polling: true });

(async () => {
  try {
    await bot.deleteWebHook({ drop_pending_updates: true });
    console.log("Webhook killed");
  } catch (e) {
    console.log("Webhook delete error:", e.message);
  }
})();

/* =========================
   PUPPETEER
========================= */
async function launchBrowser() {
  return await puppeteer.launch({
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu"
    ]
  });
}

/* =========================
   LOGOS
========================= */
async function getLogoBase64(team) {
  const filePath = path.join(__dirname, "logos", `${team}.png`);

  let finalPath = filePath;

  if (!(await fs.pathExists(filePath))) {
    finalPath = path.join(__dirname, "logos", "default.png");
  }

  const file = await fs.readFile(finalPath);
  return `data:image/png;base64,${file.toString("base64")}`;
}

/* =========================
   TITLE SIZE
========================= */
function getTitleSize(text) {
  if (text.length > 18) return 48;
  if (text.length > 14) return 58;
  return 72;
}

/* =========================
   PARSE MATCHES
========================= */
function parseLines(text) {
  const lines = text.split("\n").slice(1);

  return lines.map(line => {
    line = line.trim();

    let match = line.match(/^(.+?)\s+vs\s+(.+?)\s+(\d{1,2}:\d{2})(?:\s+(bo\d))?$/i);
    if (match) {
      return {
        type: "match",
        t1: match[1].trim(),
        t2: match[2].trim(),
        center: match[3],
        bo: match[4] || "bo3"
      };
    }

    let result = line.match(/^(.+?)\s+(\d+:\d+)\s+(.+)$/i);
    if (result) {
      return {
        type: "result",
        t1: result[1].trim(),
        center: result[2],
        t2: result[3].trim(),
        bo: ""
      };
    }

    return null;
  }).filter(Boolean);
}

/* =========================
   MATCH HTML
========================= */
function matchBlock(t1, t2, center, logo1, logo2, bo, isResult) {
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

/* =========================
   /post (НЕ ЧІПАЄМО)
========================= */
bot.onText(/\/post([\s\S]*)/, async (msg, match) => {
  try {
    console.log("POST TRIGGER");

    const lines = match[0]
      .split("\n")
      .map(l => l.trim())
      .filter(Boolean);

    const tournament = lines[1] || "";

    const games = parseLines("/post\n" + lines.slice(2).join("\n"));

    if (!games.length) {
      return bot.sendMessage(msg.chat.id, "Невірний формат");
    }

    let htmlMatches = "";
    let isResult = false;

    for (const g of games) {
      if (g.type === "result") isResult = true;

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
      .replace("{{GRID_CLASS}}", gridClass)
      .replace("{{TOURNAMENT}}", tournament);

    const browser = await launchBrowser();
    const page = await browser.newPage();

    await page.setViewport({ width: 900, height: 900 });
    await page.setContent(html);

    const filePath = path.join(__dirname, "post.png");

    await page.screenshot({ path: filePath });
    await browser.close();

    await bot.sendPhoto(msg.chat.id, filePath);

  } catch (e) {
    console.log("POST ERROR:", e);
    bot.sendMessage(msg.chat.id, "Помилка 💀");
  }
});

/* =========================
   /news (ФІКС)
========================= */
bot.on("message", async (msg) => {
  if (!msg.text) return;
  if (!msg.text.startsWith("/news")) return;

  try {
    console.log("NEWS TRIGGER");

    const rawText = msg.text.replace("/news", "").trim();

    if (!rawText) {
      return bot.sendMessage(msg.chat.id, "Напиши текст новини");
    }

    const formattedText = rawText
      .split("_")
      .map((part, i) =>
        i % 2 === 1
          ? `<span class="purple">${part}</span>`
          : part
      )
      .join("");

    let html = await fs.readFile(
      path.join(__dirname, "news-template.html"),
      "utf8"
    );

    html = html.replace("{{TEXT}}", formattedText);

    const browser = await launchBrowser();
    const page = await browser.newPage();

    await page.setViewport({ width: 900, height: 900 });
    await page.setContent(html);

    const filePath = path.join(__dirname, "news.png");

    await page.screenshot({ path: filePath });
    await browser.close();

    await bot.sendPhoto(msg.chat.id, filePath);

  } catch (e) {
    console.log("NEWS ERROR:", e);
    bot.sendMessage(msg.chat.id, "Помилка news 💀");
  }
});

/* =========================
   KEEP ALIVE
========================= */
setInterval(() => {}, 1000);
