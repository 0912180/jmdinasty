// Cotización del dólar (Gs. por USD) de Cambios Chaco, con respaldo manual
let cache = { valor: null, fuente: null, hasta: 0 };

const num = (t) => Number(String(t).replace(/\./g, '').replace(',', '.'));

async function desdeApiChaco(tipo) {
  const res = await fetch('https://www.cambioschaco.com.py/api/branch_office/1/exchange', { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const items = data.items || data.data || data;
  const usd = (Array.isArray(items) ? items : []).find((x) => /usd|dolar|dólar/i.test(`${x.isoCode || ''} ${x.description || ''} ${x.name || ''}`));
  const v = Number(tipo === 'compra' ? usd?.purchasePrice ?? usd?.compra : usd?.salePrice ?? usd?.venta);
  if (!v) throw new Error('sin USD');
  return v;
}

async function desdeWebChaco(tipo) {
  const res = await fetch('https://www.cambioschaco.com.py/');
  const html = await res.text();
  // Busca "Dólar" seguido de dos números tipo 7.350 7.420 (compra y venta)
  const m = html.replace(/<[^>]+>/g, ' ').match(/D[oó]lar[^0-9]{0,80}?(\d{1,2}\.\d{3})[^0-9]{1,40}?(\d{1,2}\.\d{3})/i);
  if (!m) throw new Error('no encontrado');
  return num(tipo === 'compra' ? m[1] : m[2]);
}

export async function cotizacionUSD() {
  // Tipo de cambio fijo: si está cargado, se usa siempre y no se consulta Cambios Chaco
  const fijo = Number(process.env.TIPO_CAMBIO_FIJO);
  if (fijo > 0) return { valor: fijo, fuente: 'tipo de cambio fijo', hasta: 0 };
  if (cache.valor && Date.now() < cache.hasta) return cache;
  const tipo = (process.env.CAMBIO_TIPO || 'venta').toLowerCase();
  for (const [fn, fuente] of [[desdeApiChaco, 'Cambios Chaco'], [desdeWebChaco, 'Cambios Chaco']]) {
    try {
      const v = await fn(tipo);
      if (v > 1000 && v < 20000) {
        cache = { valor: v, fuente: `${fuente} (${tipo})`, hasta: Date.now() + 30 * 60 * 1000 };
        return cache;
      }
    } catch (e) {
      console.warn('Cotización Chaco:', e.message);
    }
  }
  const manual = Number(process.env.TIPO_CAMBIO_USD || 7500);
  cache = { valor: manual, fuente: 'manual (TIPO_CAMBIO_USD)', hasta: Date.now() + 10 * 60 * 1000 };
  return cache;
}
