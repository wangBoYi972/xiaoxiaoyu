const http = require("http");
const jwt = require("./node_modules/jsonwebtoken");
const db = require("./dist/server/server/store/database");
const crypto = require("./dist/server/server/store/crypto");

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
    r.on("error", e => reject(e)); r.setTimeout(30000, () => {r.destroy(); reject(new Error("timeout"));});
    r.write(body); r.end();
  });
}

async function main() {
  try {
    await db.initDatabase();
    
    // Get API key
    const row = db.queryOne("SELECT api_key_enc FROM provider_configs WHERE id=? AND user_id=?", ["deepseek", 2]);
    const key = crypto.decryptApiKey(row.api_key_enc);
    console.log("Key:", key.substring(0, 15) + "...");
    
    // Get token
    const secretRow = db.queryOne("SELECT value FROM settings WHERE key=?", ["jwt_secret"]);
    const secret = (secretRow && secretRow.value) || "fallback-secret-key-2026";
    const token = jwt.sign({userId:2, username:"wangboyi", role:"user"}, secret, {expiresIn:"24h"});
    
    // Test 1: raw-chat-test with real key
    console.log("\n=== Test 1: raw-chat-test (bypass auth) ===");
    const rawResp = await new Promise((resolve, reject) => {
      const u = `http://127.0.0.1:80/api/raw-chat-test?provider=deepseek&model=deepseek-chat&key=${encodeURIComponent(key)}&msg=hi`;
      http.get(u, res => {
        let d = ""; let c = 0;
        res.on("data", x => { c++; d += x.toString(); });
        res.on("end", () => resolve({chunks:c, b:d.substring(0,500)}));
      }).on("error", e => reject(e));
    });
    console.log("Chunks:", rawResp.chunks);
    console.log("Body:", rawResp.b.substring(0,500));
    
    // Test 2: chat/send with JWT
    console.log("\n=== Test 2: chat/send (with auth) ===");
    const chatResp = await post("/api/chat/send", {
      providerId:"deepseek", modelId:"deepseek-chat",
      messages:[{role:"user",content:"1+1=?"}]
    }, token);
    console.log("Status:", chatResp.s, "Chunks:", chatResp.chunks);
    console.log("Body:", chatResp.b.substring(0,500));
    
    db.closeDatabase();
  } catch(e) { console.log("ERR:", e.message); }
}
main();
