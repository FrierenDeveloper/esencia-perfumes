let query = '';
let sort = 'price-asc';
let results = [];
let busy = false;
let searchSequence = 0;
const apiStorageKey = 'esencia-api-base-url';
const grid = document.querySelector('#product-grid');
const emptyState = document.querySelector('#empty-state');
const searchStatus = document.querySelector('#search-status');
const webSearch = document.querySelector('#web-search');
const formatPrice = value => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(value);
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

function getApiBase() {
  const configured = localStorage.getItem(apiStorageKey)?.trim().replace(/\/+$/, '');
  if (configured) return configured;
  const builtIn = window.ESENCIA_API_BASE_URL?.trim().replace(/\/+$/, '');
  if (builtIn) return builtIn;
  const isNativeApp = window.Capacitor?.isNativePlatform?.() || location.hostname === 'localhost' && location.protocol === 'https:';
  if (isNativeApp) return '';
  return ['http:', 'https:'].includes(location.protocol) ? location.origin : '';
}
function webSearchLinks(term) {
  const q = encodeURIComponent(`${term} perfume`);
  const google = `https://www.google.com/search?tbm=shop&hl=es-419&gl=cl&q=${q}`;
  const mercadoLibre = `https://listado.mercadolibre.cl/${encodeURIComponent(term.trim().replace(/\s+/g, '-'))}`;
  const retailers = [
    ['Google Shopping', google],
    ['Mercado Libre', mercadoLibre],
    ['Falabella', `https://www.google.com/search?hl=es-419&q=site%3Afalabella.com%2Ffalabella-cl+${q}`],
    ['Paris', `https://www.google.com/search?hl=es-419&q=site%3Aparis.cl+${q}`],
    ['Ripley', `https://www.google.com/search?hl=es-419&q=site%3Asimple.ripley.cl+${q}`],
    ['DBS Beauty Store', `https://www.google.com/search?hl=es-419&q=site%3Adbs.cl+${q}`],
    ['Maicao', `https://www.google.com/search?hl=es-419&q=site%3Amaicao.cl+${q}`],
    ['Preunic', `https://www.google.com/search?hl=es-419&q=site%3Apreunic.cl+${q}`],
    ['Perfumerías Jashan', `https://www.google.com/search?hl=es-419&q=site%3Ajashanperfumes.cl+${q}`],
    ['Chile Perfume', `https://www.google.com/search?hl=es-419&q=site%3Achileperfume.cl+${q}`],
    ['TusPerfumes.cl', `https://www.google.com/search?hl=es-419&q=site%3Atusperfumes.cl+${q}`],
    ['Sarun Perfumes', `https://www.google.com/search?hl=es-419&q=site%3Asarun.cl+${q}`],
    ['OfertaPerfumes', `https://www.google.com/search?hl=es-419&q=site%3Aofertaperfumes.cl+${q}`],
    ['Fragante Chile', `https://www.google.com/search?hl=es-419&q=site%3Afragante.cl+${q}`]
  ];
  webSearch.hidden = false;
  webSearch.innerHTML = `<p class="web-search-heading">Buscar <strong>${escapeHtml(term)}</strong> directamente en tiendas:</p><div class="web-search-links">${retailers.map(([name, href]) => `<a href="${href}" target="_blank" rel="noopener noreferrer">${escapeHtml(name)} <span>↗</span></a>`).join('')}</div>`;
}
function render() {
  const ordered = results.slice().sort((a, b) => {
    if (a.price == null && b.price == null) return 0;
    if (a.price == null) return 1;
    if (b.price == null) return -1;
    return sort === 'price-desc' ? b.price - a.price : a.price - b.price;
  });
  document.querySelector('#result-count').textContent = query ? `${results.length} ${results.length === 1 ? 'oferta' : 'ofertas'}` : 'Búsqueda en línea';
  emptyState.hidden = results.length > 0 || !query || busy;
  grid.innerHTML = ordered.map(item => `<article class="product-card online-card">
    <div class="product-art online-art">${item.image ? `<img src="${escapeHtml(item.image)}" alt="Imagen del producto publicado por ${escapeHtml(item.shop)}" loading="lazy" referrerpolicy="no-referrer">` : '<span class="online-placeholder">✳</span>'}<span class="offer-badge">Chile · web</span></div>
    <div class="product-info"><span class="product-category">${escapeHtml(item.shop || 'Tienda en línea')}</span><h3>${escapeHtml(item.title)}</h3>
      ${item.rating ? `<span class="product-brand">Calificación: ${escapeHtml(item.rating)}</span>` : ''}
      <div class="price-row"><div><span class="price-label">Precio publicado</span><div class="price">${item.price !== null && item.price !== undefined ? formatPrice(item.price) : escapeHtml(item.priceText || 'Ver precio')}</div></div>${item.delivery ? `<span class="offer-count">${escapeHtml(item.delivery)}</span>` : ''}</div>
      ${item.url ? `<a class="best-offer" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">Ver en ${escapeHtml(item.shop || 'tienda')} <span>↗</span></a>` : ''}
      <button class="history-toggle" type="button" data-product="${escapeHtml(item.productKey)}" aria-expanded="false">Historial de precio <span>⌄</span></button><div class="history-panel" hidden></div>
    </div>
  </article>`).join('');
  if (query) webSearchLinks(query);
}
async function search(term) {
  const sequence = ++searchSequence;
  query = term.trim();
  results = [];
  render();
  if (query.length < 2) {
    searchStatus.textContent = 'Escribe al menos dos caracteres.';
    return;
  }
  busy = true;
  emptyState.hidden = true;
  searchStatus.textContent = 'Buscando ofertas en línea…';
  const base = getApiBase();
  if (!base) {
    busy = false;
    searchStatus.textContent = 'La comparación dentro de Esencia requiere conectar un servidor. Puedes buscar ya en estas tiendas:';
    render();
    return;
  }
  try {
    const response = await fetch(`${base}/api/search?q=${encodeURIComponent(query)}`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(20_000) });
    const data = await response.json();
    if (sequence !== searchSequence) return;
    if (!response.ok) throw new Error(data.error || `Error ${response.status}`);
    results = Array.isArray(data.results) ? data.results : [];
    const timestamp = data.updatedAt ? new Date(data.updatedAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) : '';
    searchStatus.textContent = results.length ? `Precios de ${data.source || 'la web'}${timestamp ? ` · consultados ${timestamp}` : ''}. Confirma el valor en la tienda.` : 'No encontramos ofertas para esta búsqueda. Prueba en las tiendas:';
  } catch (error) {
    if (sequence !== searchSequence) return;
    searchStatus.textContent = error.message || 'No se pudo conectar al servidor. Puedes buscar en estas tiendas:';
  } finally {
    if (sequence === searchSequence) {
      busy = false;
      render();
    }
  }
}

document.querySelector('#search-form').addEventListener('submit', event => {
  event.preventDefault();
  search(document.querySelector('#search-input').value);
});
document.querySelector('#sort-select').addEventListener('change', event => { sort = event.target.value; render(); });
document.querySelector('#product-grid').addEventListener('click', async event => {
  const button = event.target.closest('.history-toggle');
  if (!button) return;
  const panel = button.nextElementSibling;
  const expanded = button.getAttribute('aria-expanded') === 'true';
  button.setAttribute('aria-expanded', String(!expanded));
  panel.hidden = expanded;
  if (expanded || button.dataset.loaded) return;
  const base = getApiBase();
  if (!base) { panel.textContent = 'Conecta el servidor para consultar el historial.'; button.dataset.loaded = 'true'; return; }
  panel.textContent = 'Cargando historial…';
  try {
    const response = await fetch(`${base}/api/history?product=${encodeURIComponent(button.dataset.product)}`);
    const data = await response.json();
    const points = data.observations || [];
    if (!points.length) panel.innerHTML = '<p>Aún no hay registros. Esencia guardará precios cuando vuelva a encontrar este producto.</p>';
    else {
      const values = points.map(point => point.price);
      const min = Math.min(...values), max = Math.max(...values);
      const polyline = values.map((value, index) => `${index * (240 / Math.max(values.length - 1, 1))},${42 - ((value - min) / Math.max(max - min, 1)) * 34}`).join(' ');
      panel.innerHTML = `<svg class="history-chart" viewBox="0 0 240 48" role="img" aria-label="Evolución de ${points.length} precios"><polyline points="${polyline}" /></svg><p>${points.map(point => `<span>${new Date(point.observedAt).toLocaleDateString('es-CL')} · ${formatPrice(point.price)}</span>`).join('<br>')}</p>`;
    }
    button.dataset.loaded = 'true';
  } catch { panel.textContent = 'No se pudo cargar el historial.'; button.dataset.loaded = 'true'; }
});
document.querySelector('#api-config-form').addEventListener('submit', event => {
  event.preventDefault();
  const field = document.querySelector('#api-base-url');
  const value = field.value.trim().replace(/\/+$/, '');
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost') throw new Error();
    localStorage.setItem(apiStorageKey, value);
    searchStatus.textContent = 'Servidor guardado. Haz una búsqueda para ver ofertas en línea.';
  } catch {
    searchStatus.textContent = 'Escribe una URL válida que empiece con https://.';
  }
});
document.querySelector('#clear-api-url').addEventListener('click', () => {
  localStorage.removeItem(apiStorageKey);
  document.querySelector('#api-base-url').value = '';
  searchStatus.textContent = 'Se quitó la URL del servidor. Puedes buscar directamente en las tiendas.';
});
const savedApi = localStorage.getItem(apiStorageKey);
if (savedApi) document.querySelector('#api-base-url').value = savedApi;
render();
