const https = require('https');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Access-Control-Allow-Origin', '*');

  const { name, email, phone, message } = req.body || {};
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_OWNER_CHAT_ID;

  if (!token || !chatId) {
    return res.status(500).json({ error: 'Server not configured' });
  }

  const text = `📩 Neue Anfrage von Coolify Website\n\n👤 Name: ${name || '-'}\n📧 E-Mail: ${email || '-'}\n📞 Telefon: ${phone || '-'}\n💬 Nachricht: ${message || '-'}`;

  const payload = JSON.stringify({ chat_id: chatId, text });

  await new Promise((resolve, reject) => {
    const req2 = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${token}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    }, (r) => { r.resume(); resolve(); });
    req2.on('error', reject);
    req2.write(payload);
    req2.end();
  });

  return res.status(200).json({ success: true });
};
