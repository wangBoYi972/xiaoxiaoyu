const http = require('http');

function req(method, path, data, token) {
  return new Promise((resolve, reject) => {
    const body = data ? JSON.stringify(data) : '';
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (body) headers['Content-Length'] = Buffer.byteLength(body);
    const r = http.request({ hostname: 'localhost', port: 80, path, method, headers }, res => {
      const c = []; res.on('data', d => c.push(d));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(c).toString() }));
    });
    r.on('error', e => reject(e));
    r.setTimeout(20000, () => { r.destroy(); reject(new Error('timeout')); });
    if (body) r.write(body);
    r.end();
  });
}

async function main() {
  // Register new user
  console.log('Registering...');
  const reg = await req('POST', '/api/auth/register', { username: 'aptest' + Date.now(), password: 'test123' });
  console.log('Register:', reg.status, reg.body.substring(0, 200));

  const login = await req('POST', '/api/auth/login', { username: 'aptest' + Date.now(), password: 'test123' });
  console.log('Login:', login.status, login.body.substring(0, 200));

  mkdir failed - need different approach
}
main();
