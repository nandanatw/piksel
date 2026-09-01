#!/usr/bin/env node
'use strict';

const fs = require('fs');

const args = process.argv.slice(2);
if (process.env.FAKE_CLI_LOG) {
  fs.appendFileSync(process.env.FAKE_CLI_LOG, JSON.stringify(args) + '\n');
}

if (args[0] === 'account' && args[1] === 'status') {
  console.log(JSON.stringify({ credit: { balance: 100 } }));
} else if (args[0] === 'task' && args[1] === 'create') {
  console.log(JSON.stringify({ task: { id: `provider-${Date.now()}`, estimatedCredit: 6 } }));
} else if (args[0] === 'task' && args[1] === 'wait') {
  setTimeout(() => console.log(JSON.stringify({ status: 'completed' })), 700);
} else if (args[0] === 'task' && args[1] === 'cancel') {
  if (process.env.FAKE_CANCEL_MODE === 'reject') {
    console.error('Provider task is already running');
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify({ status: 'cancelled' }));
  }
} else if (args[0] === 'task' && args[1] === 'result') {
  console.log(JSON.stringify({ imageUrl: 'https://example.invalid/test.png', imageUrls: [] }));
} else {
  console.error(`Unexpected fake CLI command: ${args.join(' ')}`);
  process.exitCode = 2;
}
