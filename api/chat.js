const https = require('https');

const SYSTEM_PROMPT = `Du bist der freundliche Assistent von Coolify, einem professionellen Klimatechnik-Unternehmen in Deutschland.
Du beantwortest NUR Fragen zu Coolify-Dienstleistungen: Installation, Wartung, Reparatur und Beratung von Klimaanlagen.
Bei nicht relevanten Fragen sagst du höflich, dass du nur bei Klimatechnik helfen kannst.
Kontaktdaten: E-Mail shahram.nejati@gmal.com, Telefon 0176 12345678, Mo–Fr 08–18 Uhr, Sa 09–14 Uhr.
Antworte kurz, freundlich und auf Deutsch (oder Englisch wenn der Nutzer Englisch schreibt). Maximal 3 Sätze pro Antwort.`;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Access-Control-Allow-Origin', '*');

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
      }, (res2) => {
        let data = '';
        res2.on('data', c => data += c);
        res2.on('end', () => {
          try {
            const json = JSON.parse(data);
            resolve(json.choices?.[0]?.message?.content || 'Entschuldigung, keine Antwort erhalten.');
          } catch { reject(new Error('Parse error')); }
        });
      });
      r.on('error', reject);
      r.write(payload);
      r.end();
    });

    return res.status(200).json({ reply });
  } catch (err) {
    return res.status(500).json({ error: 'AI request failed' });
  }
};
