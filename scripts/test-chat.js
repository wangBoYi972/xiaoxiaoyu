const http = require('http');

async function post(path, data, token) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const req = http.request({ hostname: 'localhost', port: 80, path, method: 'POST', headers }, res => {
      let result = [];
      let chunkCount = 0;
      res.on('data', c => { chunkCount++; if (chunkCount <= 3) console.log('CHUNK:', c.toString().substring(0,120)); result.push(c.toString()); });
      res.on('end', () => { console.log('Total chunks:', chunkCount); resolve({ status: res.statusCode, body: result.join('').substring(0,800) }); });
    });
    req.on('error', e => reject(e));
    req.setTimeout(20000, () => { req.destroy(); reject(new Error('timeout')); });
    req.write(body);
    req.end();
  });
}

async function main() {
  try {
    const login = await post('/api/auth/login', { username: 'wangboyi', password: '123456' });
    console.log('Login:', login.status, login.body.substring(0, 100));
    const token = JSON.parse(login.body).token;
    if (!token) { console.log('NO TOKEN'); return; }
    console.log('Token OK');
    const chat = await post('/api/chat/send', { providerId: 'deepseek', modelId: 'deepseek-chat', messages: [{ role: 'user', content: 'hi' }] }, token);
    console.log('Chat:', chat.status, chat.body.substring(0, 500));
  } catch(e) { console.log('ERROR:', e.message); }
}
main();
