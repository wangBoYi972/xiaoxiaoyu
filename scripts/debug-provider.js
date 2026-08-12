const db = require("./dist/server/server/store/database");
const crypto = require("./dist/server/server/store/crypto");

async function main() {
  await db.initDatabase();
  
  // Check all providers for user 2
  const rows = db.queryAll(
    "SELECT id, api_key_enc, base_url, enabled FROM provider_configs WHERE user_id=2",
    []
  );
  console.log("Rows:", rows.length);
  for (const r of rows) {
    console.log(r.id, "enabled:", r.enabled, "has_key:", !!r.api_key_enc);
    if (r.api_key_enc) {
      try {
        const decrypted = crypto.decryptApiKey(r.api_key_enc);
        console.log("  decrypted:", decrypted.substring(0, 15) + "...");
      } catch(e) {
        console.log("  decrypt FAILED:", e.message);
      }
    }
  }
  
  db.closeDatabase();
}
main();
