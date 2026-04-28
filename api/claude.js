const https = require('https');

module.exports = async function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  let body = '';
  await new Promise((resolve) => { req.on('data', chunk => body += chunk); req.on('end', resolve); });

  let parsed;
  try { parsed = JSON.parse(body); } catch(e) { res.status(400).json({ error: 'Invalid JSON: ' + e.message }); return; }

  const prompt = parsed.prompt || '';
  if (!prompt) { res.status(400).json({ error: 'No prompt' }); return; }

  const truncated = prompt.slice(0, 8000);

  const payload = JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1500,
    system: 'You are an expert in sports science and running training. Be direct and practical.',
    messages: [{ role: 'user', content: truncated }]
  });

  return new Promise((resolve) => {
    const apiReq = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(payload)
      }
    }, (apiRes) => {
      let data = '';
      apiRes.on('data', chunk => data += chunk);
      apiRes.on('end', () => {
        try {
          const obj = JSON.parse(data);
          if (obj.error) {
            res.status(400).json({ error: obj.error.message, type: obj.error.type });
          } else {
            res.status(200).json(obj);
          }
        } catch(e) {
          res.status(500).json({ error: 'Parse error: ' + e.message, raw: data.slice(0, 500) });
        }
        resolve();
      });
    });
    apiReq.on('error', (e) => { res.status(500).json({ error: e.message }); resolve(); });
    apiReq.write(payload);
    apiReq.end();
  });
};
