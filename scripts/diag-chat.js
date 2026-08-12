const http = require('http');

function req(method, path, data, token) {
  return new Promise((resolve, reject) => {
    const body = data ? JSON.stringify(data) : '';
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (body) headers['Content-Length'] = Buffer.byteLength(body);

    const opts = { hostname: 'localhost', port: 80, path, method, headers };
    const r = http.request(opts, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks).toString()
        });
      });
    });
    r.on('error', e => reject(e));
    r.setTimeout(25000, () => { r.destroy(); reject(new Error('timeout')); });
    if (body) r.write(body);
    r.end();
  });
}

async function main() {
  try {
    // Step 1: Login
    console.log('=== Step 1: Login ===');
    const login = await req('POST', '/api/auth/login', { username: 'wangboyi', password: '123456' });
    console.log('Status:', login.status);
    if (login.status !== 200) { console.log('Body:', login.body.substring(0, 300)); return; }
    const token = JSON.parse(login.body).token;
    console.log('Token OK:', token.substring(0, 20) + '...');

    // Step 2: Test echo endpoint
    console.log('\n=== Step 2: Echo test ===');
    const echo = await req('POST', '/api/chat/echo', { test: 'hello', providerId: 'deepseek' }, token);
    console.log('Echo:', echo.body.substring(0, 200));

    // Step 3: Real chat
    console.log('\n=== Step 3: Real chat (streaming) ===');
    const body = JSON.stringify({
      providerId: 'deepseek',
      modelId: 'deepseek-chat',
      messages: [{ role: 'user', content: '1+1=' }]
    });
    const opts = {
      hostname: 'localhost', port: 80, path: '/api/chat/send', method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const r2 = http.request(opts, res => {
      console.log('Status:', res.statusCode);
      console.log('Content-Type:', res.headers['content-type']);
      let chunks = [], count = 0;
      const start = Date.now();
      res.on('data', c => { count++; if (count <= 5) console.log('CHUNK:', c.toString().substring(0, 150)); chunks.push(c); });
      res.on('end', () => {
        console.log('Elapsed:', Date.now() - start, 'ms');
        console.log('Chunks:', count);
        console.log('Total:', Buffer.concat(chunks).toString().substring(0, 500));
        process.exit(0);
      });
    });
    r2.on('error', e => { console.log('ERROR:', e.message); process.exit(1); });
    r2.setTimeout(25000, () => { console.log('TIMEOUT'); process.exit(1); });
    r2.write(body);
    r2.end();
  } catch(e) { console.log('FATAL:', e.message); process.exit(1); }
}
main();
