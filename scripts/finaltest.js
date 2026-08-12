const http = require("http");
async function post(path, data, token) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const h = { "Content-Type": "application/json", "Content-Length": String(Buffer.byteLength(body)) };
    if (token) h["Authorization"] = "Bearer " + token;
    const r = http.request({hostname:"127.0.0.1",port:80,path,method:"POST",headers:h}, res => {
      let d = ""; let chunks = 0;
      res.on("data", c => { chunks++; if (chunks <= 3) console.log("CHUNK:", c.toString().substring(0, 100)); d += c.toString(); });
      res.on("end", () => resolve({s:res.statusCode, chunks:chunks, b:d.substring(0, 800)}));
    });
    r.on("error", e => reject(e)); r.setTimeout(25000, () => {r.destroy(); reject(new Error("timeout"));});
    r.write(body); r.end();
  });
}
(async()=>{
  try {
    let uid = "finaltest" + Date.now();
    console.log("User:", uid);
    let r = await post("/api/auth/register", {username:uid,password:"test123"});
    console.log("Register:", r.s, r.b.substring(0,150));
    if (r.s === 200) {
      let t = JSON.parse(r.b).token;
      console.log("Token OK");
      r = await post("/api/chat/send", {providerId:"deepseek",modelId:"deepseek-chat",messages:[{role:"user",content:"1+1"}]}, t);
      console.log("Chat status:", r.s, "chunks:", r.chunks);
      console.log("Body:", r.b.substring(0,500));
    } else {
      // Try login with existing user
      r = await post("/api/auth/login", {username:uid,password:"test123"});
      console.log("Login:", r.s, r.b.substring(0,150));
    }
  } catch(e) { console.log("ERR:", e.message); }
})();
