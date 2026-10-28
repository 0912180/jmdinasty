// Gasto e insights diarios de Meta Ads (solo lectura)
const VERSION = process.env.META_API_VERSION || 'v23.0';

const cuenta = () => {
  const id = String(process.env.META_AD_ACCOUNT_ID || '').replace(/^act_/, '');
  return id ? `act_${id}` : null;
};

async function graph(ruta, params) {
  const url = new URL(`https://graph.facebook.com/${VERSION}/${ruta}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, typeof v === 'string' ? v : JSON.stringify(v));
  url.searchParams.set('access_token', process.env.META_ACCESS_TOKEN || '');
  const res = await fetch(url);
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(`Meta: ${data.error?.message || res.status}`);
  return data;
}

const COMPRA = ['purchase', 'offsite_conversion.fb_pixel_purchase', 'omni_purchase'];
const valorAccion = (lista = []) => {
  for (const tipo of COMPRA) {
    const a = lista.find((x) => x.action_type === tipo);
    if (a) return Number(a.value) || 0;
  }
  return 0;
};

// Alternativa sin token: hoja de Google publicada como CSV con columnas fecha, gasto, compras, valor
const numero = (t) => {
  let x = String(t ?? '').replace(/[^0-9,.-]/g, '');
  if (x.includes(',') && x.includes('.')) x = x.lastIndexOf(',') > x.lastIndexOf('.') ? x.replace(/\./g, '').replace(',', '.') : x.replace(/,/g, '');
  else if (x.includes(',')) x = x.replace(',', '.');
  return Number(x) || 0;
};
const fechaISO = (t) => {
  const s = String(t).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
};
function filasCSV(texto) {
  const filas = [];
  let fila = [], campo = '', comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comillas) { if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; } else if (c === '"') comillas = false; else campo += c; }
    else if (c === '"') comillas = true;
    else if (c === ',') { fila.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && texto[i + 1] === '\n') i++; fila.push(campo); filas.push(fila); fila = []; campo = ''; }
    else campo += c;
  }
  if (campo || fila.length) { fila.push(campo); filas.push(fila); }
  return filas.filter((f) => f.some((x) => x.trim()));
}
async function desdeHoja(desde, hasta) {
  const res = await fetch(process.env.META_CSV_URL, { redirect: 'follow' });
  if (!res.ok) throw new Error(`no se pudo leer la hoja (${res.status})`);
  const [cab, ...filas] = filasCSV(await res.text());
  const col = (re) => cab.findIndex((h) => re.test(h.toLowerCase()));
  const iF = col(/fecha|date|d[ií]a/), iG = col(/gasto|spend|inversi|importe/), iC = col(/compras|purchases|resultados|results/), iV = col(/valor|value/);
  if (iF < 0 || iG < 0) throw new Error('la hoja necesita columnas "fecha" y "gasto"');
  const dias = {};
  for (const f of filas) {
    const d = fechaISO(f[iF]);
    if (!d || d < desde || d > hasta) continue;
    dias[d] ??= { gasto: 0, compras: 0, valorCompras: 0 };
    dias[d].gasto += numero(f[iG]);
    if (iC >= 0) dias[d].compras += numero(f[iC]);
    if (iV >= 0) dias[d].valorCompras += numero(f[iV]);
  }
  return { moneda: process.env.META_MONEDA || 'USD', dias };
}

// Devuelve { moneda, dias: { 'YYYY-MM-DD': { gasto, compras, valorCompras } } }
export async function traerMeta(desde, hasta) {
  if (process.env.META_CSV_URL) {
    try { return await desdeHoja(desde, hasta); } catch (e) { return { moneda: 'USD', dias: {}, error: `Hoja de Meta: ${e.message}` }; }
  }
  const id = cuenta();
  if (!id || !process.env.META_ACCESS_TOKEN) return { moneda: 'USD', dias: {}, error: 'Meta no está configurado' };
  try {
    const info = await graph(id, { fields: 'currency' });
    const dias = {};
    let datos = await graph(`${id}/insights`, {
      fields: 'spend,actions,action_values',
      time_range: { since: desde, until: hasta },
      time_increment: '1',
      level: 'account',
      limit: '100',
    });
    for (let i = 0; i < 20; i++) {
      for (const d of datos.data || []) {
        dias[d.date_start] = {
          gasto: Number(d.spend) || 0,
          compras: valorAccion(d.actions),
          valorCompras: valorAccion(d.action_values),
        };
      }
      if (!datos.paging?.next) break;
      datos = await (await fetch(datos.paging.next)).json();
    }
    return { moneda: info.currency || 'USD', dias };
  } catch (e) {
    return { moneda: 'USD', dias: {}, error: e.message };
  }
}
