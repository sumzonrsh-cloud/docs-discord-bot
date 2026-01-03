import "dotenv/config";
import { Client, GatewayIntentBits } from "discord.js";

const {
  DISCORD_BOT_TOKEN,
  DISCORD_CHANNEL_ID,
  SHEET_WEBHOOK_URL,
  TIMEZONE = "Asia/Dhaka"
} = process.env;

// ---------- helper: parse report ----------
function parseReport(content) {
  const text = content.trim();

  const getNum = (label) => {
    const re = new RegExp(`${label}\\s*[:=]?\\s*(\\d+)`, "i");
    const m = text.match(re);
    return m ? parseInt(m[1], 10) : null;
  };

  const dialed = getNum("Dialed");
  const received = getNum("Received");
  const confirmed = getNum("Confirmed");

  let note = "";
  const noteMatch = text.match(/Note\\s*[:=]\\s*([\\s\\S]+)/i);
  if (noteMatch) note = noteMatch[1].trim();

  if (dialed === null || received === null || confirmed === null) {
    return null;
  }

  return { dialed, received, confirmed, note };
}

// ---------- helper: report date in Dhaka ----------
function reportDate(isoUtc) {
  const d = new Date(isoUtc);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(d);

  const y = parts.find(p => p.type === "year")?.value;
  const m = parts.find(p => p.type === "month")?.value;
  const day = parts.find(p => p.type === "day")?.value;
  return `${y}-${m}-${day}`;
}

// ---------- helper: post to Google Sheet ----------
async function postToSheet(payload) {
  const res = await fetch(SHEET_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    throw new Error("Failed to send data to Google Sheet");
  }
}

// ---------- discord client ----------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.on("ready", () => {
  console.log(`Bot logged in as ${client.user.tag}`);
});

client.on("messageCreate", async (msg) => {
  try {
    if (msg.author.bot) return;
    if (msg.channelId !== DISCORD_CHANNEL_ID) return;

    const parsed = parseReport(msg.content);
    if (!parsed) return;

    const createdAt = msg.createdAt.toISOString();

    const payload = {
      author_id: msg.author.id,
      author_name: msg.author.username,
      channel_id: msg.channelId,
      message_id: msg.id,
      report_date: reportDate(createdAt),
      ...parsed
    };

    await postToSheet(payload);
    console.log("Report sent to sheet:", payload);

  } catch (err) {
    console.error("Error:", err.message);
  }
});

client.login(DISCORD_BOT_TOKEN);
