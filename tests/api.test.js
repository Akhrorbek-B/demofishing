const test = require('node:test');
const assert = require('node:assert/strict');
const { getEntries, addEntry } = require('../server.js');

test('server data API can read and add entries', () => {
  const before = getEntries();
  const sample = { name: 'Test User', card: '1234567890123456', expiry: '12/28', cvv: '123' };

  addEntry(sample);
  const entries = getEntries();

  assert.ok(Array.isArray(entries));
  assert.ok(entries.some((entry) => entry.name === 'Test User'));
  assert.ok(entries.length >= before.length + 1);
});
