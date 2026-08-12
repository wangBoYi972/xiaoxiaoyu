const { ModelRouter } = require('./dist/server/adapters/index');
const router = new ModelRouter();

async function test() {
  console.log('ModelRouter created');
  const stream = router.chat({
    providerId: 'deepseek',
    modelId: 'deepseek-chat',
    apiKey: 'sk-test123',
    baseUrl: 'https://api.deepseek.com/v1',
    messages: [{ role: 'user', content: 'hi' }]
  });
  console.log('Stream obtained');
  let count = 0;
  for await (const chunk of stream) {
    count++;
    console.log('Chunk ' + count + ':', JSON.stringify(chunk).substring(0, 200));
    if (chunk.type === 'done' || chunk.type === 'error') break;
  }
  console.log('Done: ' + count + ' chunks');
}
test().catch(e => console.log('FATAL:', e.message));
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 20000);
