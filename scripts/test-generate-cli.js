require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { config } = require('../src/config');
const { runCLI, addKey, listKeys, markExhausted } = require('../src/pool');

async function main() {
  const prompt = process.argv[2] || 'a cute corgi puppy, soft lighting, detailed fur, score_9, score_8_up, realistic';
  const model = process.argv[3] || 'pony-v6';
  const ratio = process.argv[4] || '1:1';
  const resolution = process.argv[5] || '1k';

  console.log(`Prompt: ${prompt}`);
  console.log(`Model:  ${model} (${ratio}, ${resolution})`);
  console.log(`Endpoint: ${config.MODAL_ENDPOINT_URL}`);
  console.log('---');

  let keys = await listKeys();
  if (keys.length === 0) {
    console.log('Seeding a fake API key into the pool (required by generation flow)...');
    await addKey('local-test@piksel', 'modal-shared-key', 10000);
    keys = await listKeys();
  }
  const entry = keys.find(k => !k.exhausted) || keys[0];

  const start = Date.now();
  try {
    const createOut = await runCLI(
      ['task', 'create', '--model', model, '--type', 'image', '--prompt', prompt, '--ratio', ratio, '--json'],
      { RENOISE_API_KEY: entry.key },
      { timeout: 600000 },
    );
    const data = JSON.parse(createOut);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    if (data.imageUrl) {
      const match = data.imageUrl.match(/^data:image\/\w+;base64,(.+)$/);
      const ext = match && data.imageUrl.includes('jpeg') ? 'jpg' : 'png';
      const outPath = path.join(__dirname, '..', 'storage', 'results', `cli-test-${Date.now()}.${ext}`);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, Buffer.from(match[1], 'base64'));
      console.log(`✓ Done in ${elapsed}s — ${outPath}`);
    } else {
      console.log('Response:', data);
    }
  } catch (e) {
    console.error(`✗ Failed after ${((Date.now() - start) / 1000).toFixed(1)}s:`, e.message);
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
