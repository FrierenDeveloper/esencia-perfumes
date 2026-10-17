import http from 'node:http';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT || 8787);
const apiKey = process.env.SERPAPI_API_KEY || '';
const dataDir = process.env.DATA_DIR || resolve(root, 'data');
const historyFile = resolve(dataDir, 'price-history.jsonl');
const databaseUrl = process.env.DATABASE_URL || '';
const pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : null;
const cache = new Map();
const requests = new Map();
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };

function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS', 'access-control-allow-headers': 'Content-Type', ...headers });
  res.end(JSON.stringify(body));
}
function throttle(req) {
  const key = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
  const now = Date.now();
  const recent = (requests.get(key) || []).filter(time => now - time < 60_000);
  if (recent.length >= 15) return false;
  recent.push(now);
  requests.set(key, recent);
  return true;
}
function normalizeResult(item) {
  const extractedPrice = Number(item.extracted_price);
  const validPrice = Number.isFinite(extractedPrice) && extractedPrice >= 1000;
  const price = validPrice ? extractedPrice : null;
  const link = item.product_link || item.link || '';
  let safeLink = '';
  try { if (new URL(link).protocol === 'https:') safeLink = link; } catch {}
  let image = '';
  try { if (new URL(item.thumbnail || '').protocol === 'https:') image = item.thumbnail; } catch {}
  const format = classifyFormat(String(item.title || ''), validPrice ? price : Number.isFinite(extractedPrice) && extractedPrice > 0 ? extractedPrice : null);
  return {
    productKey: createHash('sha256').update(`${item.title || ''}|${item.source || ''}`.toLocaleLowerCase('es-CL').replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 24),
    title: String(item.title || 'Perfume').slice(0, 180),
    shop: String(item.source || 'Tienda en línea').slice(0, 80),
    price,
    format: format.type,
    formatNote: format.note,
    priceText: Number.isFinite(extractedPrice) && extractedPrice > 0 && extractedPrice < 1000 ? 'Precio a verificar' : String(item.price || '').slice(0, 60),
    priceWarning: Number.isFinite(extractedPrice) && extractedPrice > 0 && extractedPrice < 1000 ? 'La búsqueda devolvió un valor menor a $1.000 CLP; podría estar mal interpretado.' : '',
    url: safeLink,
    image,
    rating: item.rating ? String(item.rating).slice(0, 10) : '',
    delivery: String(item.delivery || '').slice(0, 100)
  };
}
function classifyFormat(title, price) {
  const explicitDecant = /\b(decants?|decantes?|muestras?|samples?|viales?|vials?|atomizadores?|travel\s*(?:size|spray)|miniaturas?)\b/i.test(title);
  const mlMatch = title.match(/(\d+(?:[.,]\d+)?)\s*(?:ml|mililitros?)\b/i);
  const ozMatch = title.match(/(\d+(?:[.,]\d+)?)\s*(?:fl\.?\s*)?oz\b/i);
  const volume = mlMatch ? Number(mlMatch[1].replace(',', '.')) : ozMatch ? Number(ozMatch[1].replace(',', '.')) * 29.5735 : null;
  if (explicitDecant) return { type: 'decant', note: 'La publicación menciona decant, muestra o vial.' };
  if (volume !== null && volume <= 10) return { type: 'decant', note: `Formato pequeño de ${volume} ml; probable decant o muestra.` };
  if (volume !== null && volume >= 30 && (price === null || price >= 5000)) return { type: 'full', note: `El título indica ${Math.round(volume)} ml; parece frasco completo.` };
  if (volume !== null && volume < 30) return { type: 'check', note: `Formato de ${Math.round(volume)} ml; revisa si es miniatura o decant.` };
  if (price !== null && price < 5000) return { type: 'check', note: 'Precio muy bajo para un frasco completo; podría ser una muestra o decant.' };
  return { type: 'check', note: 'La publicación no indica claramente el tamaño del frasco.' };
}
async function recordPrices(query, results) {
  if (!results.length) return;
  const observedAt = new Date().toISOString();
  const priced = results.filter(item => item.price !== null);
  if (pool) {
    for (const item of priced) {
      await pool.query('INSERT INTO price_observations (product_key, query, title, shop, price, observed_at, url) VALUES ($1, $2, $3, $4, $5, $6, $7)', [item.productKey, query, item.title, item.shop, item.price, observedAt, item.url]);
    }
    return;
  }
  await mkdir(dataDir, { recursive: true });
  const lines = priced.map(item => JSON.stringify({ productKey: item.productKey, query, title: item.title, shop: item.shop, price: item.price, observedAt, url: item.url }));
  if (lines.length) await appendFile(historyFile, `${lines.join('\n')}\n`, 'utf8');
}
async function getPriceHistory(productKey) {
  if (pool) {
    const { rows } = await pool.query('SELECT product_key AS "productKey", query, title, shop, price, observed_at AS "observedAt", url FROM price_observations WHERE product_key = $1 ORDER BY observed_at DESC LIMIT 60', [productKey]);
    return rows.reverse();
  }
  try {
    const content = await readFile(historyFile, 'utf8');
    return content.split('\n').filter(Boolean).flatMap(line => {
      try { const record = JSON.parse(line); return record.productKey === productKey ? [record] : []; } catch { return []; }
    }).slice(-60);
  } catch { return []; }
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS', 'access-control-allow-headers': 'Content-Type' }); return res.end(); }
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/api/health') return send(res, 200, { ok: true, onlineSearchConfigured: Boolean(apiKey) });
  if (url.pathname === '/api/history') {
    const productKey = (url.searchParams.get('product') || '').slice(0, 40);
    if (!/^[a-f0-9]{24}$/.test(productKey)) return send(res, 400, { error: 'Producto no válido.' });
    return send(res, 200, { productKey, observations: await getPriceHistory(productKey) });
  }
  if (url.pathname === '/api/search') {
    const query = (url.searchParams.get('q') || '').trim().replace(/\s+/g, ' ').slice(0, 100);
    if (query.length < 2) return send(res, 400, { error: 'Escribe al menos dos caracteres para buscar.' });
    if (!apiKey) return send(res, 503, { error: 'La búsqueda de precios aún no está configurada en el servidor.' });
    if (!throttle(req)) return send(res, 429, { error: 'Has hecho muchas búsquedas. Inténtalo de nuevo en un minuto.' });
    const cacheKey = query.toLocaleLowerCase('es-CO');
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.time < 5 * 60_000) return send(res, 200, { ...cached.value, cached: true });
    const shoppingQuery = /perfume|fragancia/i.test(query) ? query : `${query} perfume`;
    const params = new URLSearchParams({ engine: 'google_shopping', q: shoppingQuery, google_domain: 'google.cl', gl: 'cl', hl: 'es-419', location: 'Chile', api_key: apiKey });
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort(), 15_000);
    try {
      const response = await fetch(`https://serpapi.com/search.json?${params}`, { signal: abort.signal, headers: { accept: 'application/json' } });
      const data = await response.json();
      if (!response.ok || data.error) return send(res, 502, { error: 'El proveedor de búsqueda no pudo completar la consulta. Inténtalo de nuevo.' });
      const results = (data.shopping_results || []).map(normalizeResult).filter(item => item.url).sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity)).slice(0, 30);
      await recordPrices(query, results);
      const value = { query, results, source: 'Google Shopping · Chile', currency: 'CLP', updatedAt: new Date().toISOString() };
      cache.set(cacheKey, { value, time: Date.now() });
      return send(res, 200, value);
    } catch (error) {
      return send(res, error.name === 'AbortError' ? 504 : 502, { error: error.name === 'AbortError' ? 'La búsqueda tardó demasiado. Vuelve a intentarlo.' : 'No se pudo conectar con el proveedor de precios.' });
    } finally { clearTimeout(timeout); }
  }
  if (req.method !== 'GET') return send(res, 405, { error: 'Método no permitido.' });
  let requested;
  try { requested = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname.slice(1)); }
  catch { return send(res, 400, { error: 'Ruta no válida.' }); }
  if (requested === 'data' || requested.startsWith('data/')) { res.writeHead(404); return res.end(); }
  const file = resolve(root, requested);
  if (!file.startsWith(root)) return send(res, 403, { error: 'Acceso denegado.' });
  try {
    const content = await readFile(file);
    res.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
    res.end(content);
  } catch { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }); res.end('No encontrado'); }
});

async function start() {
  if (pool) {
    await pool.query(`CREATE TABLE IF NOT EXISTS price_observations (
      id BIGSERIAL PRIMARY KEY,
      product_key VARCHAR(24) NOT NULL,
      query VARCHAR(100) NOT NULL,
      title VARCHAR(180) NOT NULL,
      shop VARCHAR(80) NOT NULL,
      price NUMERIC(12, 2) NOT NULL,
      observed_at TIMESTAMPTZ NOT NULL,
      url TEXT NOT NULL
    )`);
    await pool.query('CREATE INDEX IF NOT EXISTS price_observations_product_time_idx ON price_observations (product_key, observed_at DESC)');
  }
  server.listen(port, '0.0.0.0', () => console.log(`Esencia disponible en http://localhost:${port}`));
}
start().catch(error => { console.error('No se pudo inicializar el servicio:', error); process.exit(1); });
