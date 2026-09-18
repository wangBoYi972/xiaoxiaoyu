// 在应用本地库中创建账号 835376335@qq.com（使用应用自身的 PBKDF2 哈希实现）
const initSqlJs = require('E:/ai-chat-desktop/node_modules/sql.js');
const fs = require('fs');
const { hashPassword, verifyPassword } = require('E:/ai-chat-desktop/dist/server/shared/email-code.js');

const DB = 'C:/Users/王博弈/AppData/Roaming/xiaoxiaoyu/ai-chat.db';
const EMAIL = '835376335@qq.com';
const PASSWORD = 'wby060921';

(async () => {
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(DB));

  // 已存在则只重置密码，否则插入
  let existing = null;
  const q = db.prepare('SELECT id, username, email, role FROM users WHERE LOWER(username) = ? OR LOWER(IFNULL(email,"")) = ?');
  q.bind([EMAIL, EMAIL]);
  if (q.step()) existing = q.getAsObject();
  q.free();

  const hash = hashPassword(PASSWORD);
  if (!verifyPassword(PASSWORD, hash)) { console.log('FAIL: hash 自校验不通过'); process.exit(1); }

  const now = Math.floor(Date.now() / 1000);
  if (existing) {
    db.run('UPDATE users SET password_hash = ?, email = ? WHERE id = ?', [hash, EMAIL, existing.id]);
    console.log(`账号已存在(id=${existing.id})，密码已重置`);
  } else {
    db.run(
      'INSERT INTO users (username, password_hash, email, role, created_at) VALUES (?, ?, ?, ?, ?)',
      [EMAIL, hash, EMAIL, 'user', now]
    );
    console.log('账号已创建');
  }

  fs.writeFileSync(DB, Buffer.from(db.export()));

  // 复核：重新读库并校验密码
  const db2 = new SQL.Database(fs.readFileSync(DB));
  const q2 = db2.prepare('SELECT id, username, email, role, password_hash, must_change_pwd FROM users WHERE LOWER(username) = ?');
  q2.bind([EMAIL]);
  if (q2.step()) {
    const row = q2.getAsObject();
    const ok = verifyPassword(PASSWORD, String(row.password_hash));
    console.log('复核:', JSON.stringify({ id: row.id, username: row.username, email: row.email, role: row.role, must_change_pwd: row.must_change_pwd, passwordOk: ok }));
    q2.free();
    db2.close();
    process.exit(ok ? 0 : 1);
  } else {
    console.log('FAIL: 写入后查不到');
    process.exit(1);
  }
})();
