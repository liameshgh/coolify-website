// Coolify — Telegram Chat Bridge + Contact Form API
// Run: node server.js
// Requires: npm install

require('dotenv').config();
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const TelegramBot = require('node-telegram-bot-api');
const cors = require('cors');
const path = require('path');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OWNER_CHAT_ID = process.env.TELEGRAM_OWNER_CHAT_ID;
const PORT = process.env.PORT || 3000;

if (!TOKEN) {
  console.error('ERROR: TELEGRAM_BOT_TOKEN not set in .env');
  process.exit(1);
}

const bot = new TelegramBot(TOKEN, { polling: true });

// Map: websiteSessionId -> { socketId, visitorName }
const sessions = new Map();
// Map: telegramMessageId -> websiteSessionId (for reply routing)
const msgToSession = new Map();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ── AI Chat endpoint (OpenRouter / Gemma) ─────────────────────────────────
const https = require('https');
const SYSTEM_PROMPT = `Du bist der freundliche Assistent von Coolify, einem professionellen Klimatechnik-Unternehmen in Deutschland.
Du beantwortest NUR Fragen zu Coolify-Dienstleistungen: Installation, Wartung, Reparatur und Beratung von Klimaanlagen.
Kontaktdaten: E-Mail darvish.amir@gmx.de, Telefon 0176 12345678, Mo–Fr 08–18 Uhr, Sa 09–14 Uhr.
Antworte kurz, freundlich und auf Deutsch (oder Englisch wenn der Nutzer Englisch schreibt). Maximal 3 Sätze.`;

app.post('/api/chat', async (req, res) => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'AI not configured' });

  const { message, history = [] } = req.body || {};
  if (!message) return res.status(400).json({ error: 'No message' });

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history.slice(-6),
    { role: 'user', content: message }
  ];

  const payload = JSON.stringify({
    model: 'google/gemma-3-27b-it:free',
    messages,
    max_tokens: 256,
    temperature: 0.7
  });

  try {
    const reply = await new Promise((resolve, reject) => {
      const r = https.request({
        hostname: 'openrouter.ai',
        path: '/api/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://coolify-website.vercel.app',
          'X-Title': 'Coolify Chatbot'
        }
      }, (r2) => {
        let data = '';
        r2.on('data', c => data += c);
        r2.on('end', () => {
          try { resolve(JSON.parse(data).choices?.[0]?.message?.content || 'Keine Antwort.'); }
          catch { reject(new Error('Parse error')); }
        });
      });
      r.on('error', reject);
      r.write(payload);
      r.end();
    });
    res.json({ reply });
  } catch { res.status(500).json({ error: 'AI request failed' }); }
});

// ── Contact form endpoint ──────────────────────────────────────────────────
app.post('/api/contact', async (req, res) => {
  const { name, email, phone, message } = req.body;
  if (!OWNER_CHAT_ID) return res.status(500).json({ error: 'OWNER_CHAT_ID not configured' });

  const text = [
    '📬 *Neue Anfrage von der Website*',
    `👤 Name: ${name || '—'}`,
    `📧 Email: ${email || '—'}`,
    `📞 Telefon: ${phone || '—'}`,
    `💬 Nachricht: ${message || '—'}`,
  ].join('\n');

  try {
    await bot.sendMessage(OWNER_CHAT_ID, text, { parse_mode: 'Markdown' });
    res.json({ ok: true });
  } catch (err) {
    console.error('Telegram send error:', err.message);
    res.status(500).json({ error: 'Failed to send' });
  }
});

// ── Socket.io: website <-> Telegram live chat ──────────────────────────────
io.on('connection', socket => {
  const sessionId = socket.id;
  sessions.set(sessionId, { socketId: socket.id, visitorName: 'Besucher' });

  // Visitor sends message from website
  socket.on('visitor_msg', async ({ text, name }) => {
    if (!OWNER_CHAT_ID) return;
    sessions.get(sessionId).visitorName = name || 'Besucher';

    const msg = [
      `💬 *Website-Chat*`,
      `👤 ${name || 'Besucher'} (${sessionId.slice(0,6)})`,
      `📝 ${text}`,
      ``,
      `_Antworten: reply auf diese Nachricht_`
    ].join('\n');

    try {
      const sent = await bot.sendMessage(OWNER_CHAT_ID, msg, { parse_mode: 'Markdown' });
      msgToSession.set(sent.message_id, sessionId);
    } catch (err) {
      console.error('Telegram error:', err.message);
    }
  });

  socket.on('disconnect', () => {
    sessions.delete(sessionId);
  });
});

// ── Telegram: owner replies → route back to website ───────────────────────
bot.on('message', async msg => {
  // Ignore messages not from owner
  if (msg.chat.id.toString() !== OWNER_CHAT_ID) return;

  // Only handle replies to our forwarded messages
  if (!msg.reply_to_message) return;

  const origId = msg.reply_to_message.message_id;
  const sessionId = msgToSession.get(origId);
  if (!sessionId) return;

  const session = sessions.get(sessionId);
  if (!session) {
    await bot.sendMessage(OWNER_CHAT_ID, '⚠️ Dieser Besucher ist nicht mehr online.');
    return;
  }

  io.to(session.socketId).emit('owner_reply', { text: msg.text });
  await bot.sendMessage(OWNER_CHAT_ID, `✅ Gesendet an ${session.visitorName}`);
});

// ── Telegram: /start command ───────────────────────────────────────────────
bot.onText(/\/start/, async msg => {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, [
    '🌡️ *Coolify Bot aktiv!*',
    '',
    `Ihre Chat-ID: \`${chatId}\``,
    '',
    'Kopieren Sie diese ID und tragen Sie sie in die .env Datei ein:',
    `\`TELEGRAM_OWNER_CHAT_ID=${chatId}\``,
    '',
    'Danach erhalten Sie hier Website-Nachrichten und können direkt antworten.'
  ].join('\n'), { parse_mode: 'Markdown' });
});

httpServer.listen(PORT, () => {
  console.log(`✅ Coolify server running on http://localhost:${PORT}`);
  console.log(`   Telegram bot: polling`);
  console.log(`   Owner Chat ID: ${OWNER_CHAT_ID || 'NOT SET — send /start to your bot first'}`);
});
