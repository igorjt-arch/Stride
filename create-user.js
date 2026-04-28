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
  try { parsed = JSON.parse(body); } catch(e) { res.status(400).json({ error: 'Invalid JSON' }); return; }

  const { name, email, password, adminUid } = parsed;
  if (!name || !email || !password) { res.status(400).json({ error: 'Missing fields' }); return; }

  // Use Firebase REST API to create user
  const firebaseApiKey = process.env.FIREBASE_API_KEY;
  const projectId = process.env.FIREBASE_PROJECT_ID;

  // Create user via Firebase Auth REST API
  const createPayload = JSON.stringify({ email, password, returnSecureToken: true });

  return new Promise((resolve) => {
    const apiReq = https.request({
      hostname: 'identitytoolkit.googleapis.com',
      path: `/v1/accounts:signUp?key=${firebaseApiKey}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(createPayload) }
    }, (apiRes) => {
      let data = '';
      apiRes.on('data', chunk => data += chunk);
      apiRes.on('end', async () => {
        try {
          const obj = JSON.parse(data);
          if (obj.error) {
            const msgs = { 'EMAIL_EXISTS': 'Este email já está cadastrado.' };
            res.status(400).json({ error: msgs[obj.error.message] || obj.error.message });
          } else {
            // Save user to Firestore
            const uid = obj.localId;
            const firestorePayload = JSON.stringify({
              fields: {
                email: { stringValue: email },
                name: { stringValue: name },
                role: { stringValue: 'athlete' },
                createdAt: { stringValue: new Date().toISOString() }
              }
            });
            // Write to Firestore via REST
            const fsReq = https.request({
              hostname: 'firestore.googleapis.com',
              path: `/v1/projects/${projectId}/databases/(default)/documents/users/${uid}`,
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(firestorePayload) }
            }, (fsRes) => {
              let fsData = '';
              fsRes.on('data', c => fsData += c);
              fsRes.on('end', () => { res.status(200).json({ uid, success: true }); resolve(); });
            });
            fsReq.on('error', () => { res.status(200).json({ uid, success: true }); resolve(); });
            fsReq.write(firestorePayload);
            fsReq.end();
          }
        } catch(e) {
          res.status(500).json({ error: e.message });
        }
        resolve();
      });
    });
    apiReq.on('error', (e) => { res.status(500).json({ error: e.message }); resolve(); });
    apiReq.write(createPayload);
    apiReq.end();
  });
};
