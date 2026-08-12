const db = require("./dist/server/server/store/database");
async function main() {
  await db.initDatabase();
  
  // Exactly the same query as loadProviderConfig
  const row = db.queryOne(
    "SELECT api_key_enc, base_url FROM provider_configs WHERE id = ? AND user_id = ? AND enabled = 1",
    ["deepseek", 2]
  );
  console.log("Row found:", !!row);
  if (row) console.log("Has api_key_enc:", !!row.api_key_enc);
  
  db.closeDatabase();
}
main();
