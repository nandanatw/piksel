require('dotenv').config();

async function main() {
  const prompt = process.argv[2] || 'a beautiful sunset over mountains, score_9, score_8_up, realistic';
  const model = process.argv[3] || 'pony-v6';
  const ratio = process.argv[4] || '1:1';
  const resolution = process.argv[5] || '1k';

  const endpoint = process.env.MODAL_ENDPOINT_URL || 'https://piksel-image-gen--fastapi-app.modal.run';
  const apiKey = process.env.MODAL_API_KEY || 'piksel-dev-key';

  console.log(`Prompt:    ${prompt}`);
  console.log(`Model:     ${model} (${ratio}, ${resolution})`);
  console.log(`Endpoint:  ${endpoint}`);
  console.log('---');

  const start = Date.now();
  let lastLog = start;
  const heartbeat = setInterval(() => {
    const elapsed = ((Date.now() - start) / 1000).toFixed(0);
    process.stdout.write(`\r  waiting... ${elapsed}s elapsed (cold start = download 6.5GB to Volume)`);
  }, 5000);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25 * 60 * 1000); // 25min

    const resp = await fetch(`${endpoint}/generate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt, model, ratio, resolution }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    clearInterval(heartbeat);
    process.stdout.write('\n');

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`HTTP ${resp.status}: ${text.slice(0, 300)}`);
    }

    const data = await resp.json();
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    if (!data.imageUrl) throw new Error('No imageUrl in response: ' + JSON.stringify(data));

    const match = data.imageUrl.match(/^data:image\/\w+;base64,(.+)$/);
    const ext = data.imageUrl.includes('jpeg') ? 'jpg' : 'png';
    const fs = require('fs');
    const path = require('path');
    const outPath = path.join(__dirname, '..', 'storage', 'results', `cli-test-${Date.now()}.${ext}`);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, Buffer.from(match[1], 'base64'));

    console.log(`✓ Done in ${elapsed}s — ${outPath}`);
    console.log(`  Model:    ${data.model}`);
    console.log(`  Seed:     ${data.seed}`);
    console.log(`  Ratio:    ${data.ratio}`);
    console.log(`  Res:      ${data.resolution}`);
  } catch (e) {
    clearInterval(heartbeat);
    process.stdout.write('\n');
    if (e.name === 'AbortError') {
      console.error(`✗ Timed out after ${((Date.now() - start) / 1000).toFixed(1)}s — check Modal dashboard:`);
      console.error(`  https://modal.com/id/ap-l5i457mSU2CwbEx3Z9SLyy`);
    } else {
      console.error(`✗ Failed after ${((Date.now() - start) / 1000).toFixed(1)}s:`, e.message);
    }
    process.exit(1);
  }
}

main();
