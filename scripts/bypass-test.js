const http = require("http");
const jwt = require("./node_modules/jsonwebtoken");
const db = require("./dist/server/server/store/database");

async function post(path, data, token) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const h = { "Content-Type": "application/json", "Content-Length": String(Buffer.byteLength(body)) };
    if (token) h["Authorization"] = "Bearer " + token;
    const r = http.request({hostname:"127.0.0.1",port:80,path,method:"POST",headers:h}, res => {
      let d = ""; let chunks = 0;
      res.on("data", c => { chunks++; d += c.toString(); });
      res.on("end", () => resolve({s:res.statusCode, chunks:chunks, b:d.substring(0,1000)}));
    });
    r.on("error", e => reject(e)); r.setTimeout(25000, () => {r.destroy(); reject(new Error("timeout"));});
    r.write(body); r.end();
  });
}

async function main() {
  try {
    await db.initDatabase();
    const secretRow = db.queryOne("SELECT value FROM settings WHERE key=?", ["jwt_secret"]);
    const secret = (secretRow && secretRow.value) || "fallback-secret-key-2026";
    console.log("Secret:", secret.substring(0,10) + "...");
    
    const token = jwt.sign( {userId:2, username:"wangboyi", role:"user"}, secret, {expiresIn:"24h"});
    console.log("Token:", token.substring(0,30) + "...");
    
    const r = await post("/api/chat/send", {
      providerId:"deepseek", modelId:"deepseek-chat",
      messages:[{role:"user",content:"say hi"}]
    }, token);
    
    console.log("Status:", r.s, "Chunks:", r.chunks);
    console.log("Body:", r.b.substring(0,800));
    db.closeDatabase();
  } catch(e) { console.log("ERR:", e.message); }
}
main();
