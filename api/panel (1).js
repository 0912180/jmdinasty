import { shopifyGQL } from '../lib/shopify.js';

// Panel de cobranzas: /api/panel?clave=TU_CLAVE&mes=2026-10&dia=2026-10-28
const ZONA = process.env.FIXY_ZONA_HORARIA || 'America/Asuncion';
const EN_REPARTO = ['ruteado-para-su-entrega', 'yendo-a-entregar', 'entregado-a-agente-postal', 'recepcionado-en-cedi'];

const diaPY = (iso) => (iso ? new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(new Date(iso)) : null);
const gs = (n) => 'Gs. ' + Math.round(n).toLocaleString('es-PY');
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function traerPedidos(desde) {
  const pedidos = [];
  let cursor = null;
  for (let i = 0; i < 10; i++) {
    const d = await shopifyGQL(
      `query($q: String!, $c: String) { orders(first: 250, after: $c, query: $q, sortKey: CREATED_AT, reverse: true) {
        pageInfo { hasNextPage endCursor }
        nodes { name createdAt cancelledAt tags displayFinancialStatus
          totalPriceSet { shopMoney { amount } }
          shippingAddress { name city }
          fulfillments(first: 1) { createdAt }
          transactions(first: 5) { kind status processedAt } } } }`,
      { q: `created_at:>=${desde}`, c: cursor }
    );
    pedidos.push(...d.orders.nodes);
    if (!d.orders.pageInfo.hasNextPage) break;
    cursor = d.orders.pageInfo.endCursor;
  }
  return pedidos;
}

function clasificar(o) {
  const tags = o.tags || [];
  const estadoTag = tags.find((t) => t.startsWith('fixy-estado-')) || '';
  const estado = estadoTag.replace('fixy-estado-', '');
  const tieneFixy = tags.some((t) => t.startsWith('fixy-guia-')) || !!estadoTag;
  if (!tieneFixy || o.cancelledAt || tags.includes('fixy-anulado')) return null;

  let grupo = 'pendiente';
  if (estado === 'entregada') grupo = 'cobrado';
  else if (tags.includes('fixy-devuelto')) grupo = 'devuelto';
  else if (tags.includes('fixy-revisar')) grupo = 'no_entregado';
  else if (EN_REPARTO.some((e) => estado.startsWith(e))) grupo = 'en_reparto';

  const pago = (o.transactions || []).find((t) => t.status === 'SUCCESS' && ['SALE', 'CAPTURE'].includes(t.kind));
  const fechaDespacho = o.fulfillments?.[0]?.createdAt || null;
  return {
    nombre: o.name,
    cliente: o.shippingAddress?.name || '',
    ciudad: o.shippingAddress?.city || '',
    monto: Number(o.totalPriceSet.shopMoney.amount),
    estado: estado.replace(/-/g, ' ') || 'sin estado',
    grupo,
    salio: grupo !== 'pendiente',
    diaCreado: diaPY(o.createdAt),
    diaDespacho: diaPY(fechaDespacho),
    diaCobro: grupo === 'cobrado' ? diaPY(pago?.processedAt || fechaDespacho || o.createdAt) : null,
  };
}

// Día de referencia de cada pedido: cobro si se cobró, si no despacho, si no creación
const diaRef = (p) => p.diaCobro || p.diaDespacho || p.diaCreado;

function resumen(lista) {
  const r = { total: lista.length, salieron: 0, cobrados: 0, cobradoGs: 0, enReparto: 0, enRepartoGs: 0, noEntregados: 0, devueltos: 0, pendientes: 0 };
  for (const p of lista) {
    if (p.salio) r.salieron++;
    if (p.grupo === 'cobrado') { r.cobrados++; r.cobradoGs += p.monto; }
    if (p.grupo === 'en_reparto') { r.enReparto++; r.enRepartoGs += p.monto; }
    if (p.grupo === 'no_entregado') r.noEntregados++;
    if (p.grupo === 'devuelto') r.devueltos++;
    if (p.grupo === 'pendiente') r.pendientes++;
  }
  r.efectividad = r.salieron ? Math.round((r.cobrados / r.salieron) * 1000) / 10 : 0;
  return r;
}

const ETIQUETAS = { cobrado: 'Cobrado', en_reparto: 'En reparto', no_entregado: 'No entregado', devuelto: 'Devuelto', pendiente: 'Pendiente de salir' };

function pagina({ clave, mes, dia, r, porDia, delDia }) {
  const [anio, m] = mes.split('-').map(Number);
  const primerDia = new Date(Date.UTC(anio, m - 1, 1)).getUTCDay(); // 0 = domingo
  const diasMes = new Date(Date.UTC(anio, m, 0)).getUTCDate();
  const offset = (primerDia + 6) % 7; // semana empieza el lunes
  const nombreMes = new Date(Date.UTC(anio, m - 1, 15)).toLocaleDateString('es-PY', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const mesAnt = new Date(Date.UTC(anio, m - 2, 1)).toISOString().slice(0, 7);
  const mesSig = new Date(Date.UTC(anio, m, 1)).toISOString().slice(0, 7);
  const link = (q) => `?clave=${encodeURIComponent(clave)}&${q}`;

  let celdas = '';
  for (let i = 0; i < offset; i++) celdas += '<div class="cel vacia"></div>';
  for (let d = 1; d <= diasMes; d++) {
    const f = `${mes}-${String(d).padStart(2, '0')}`;
    const x = porDia[f];
    const efect = x && x.salieron ? Math.round((x.cobrados / x.salieron) * 100) : null;
    celdas += `<a class="cel${f === dia ? ' sel' : ''}${x ? '' : ' sin'}" href="${link(`mes=${mes}&dia=${f}`)}">
      <span class="num">${d}</span>
      ${x ? `<span class="plata">${x.cobradoGs ? gs(x.cobradoGs) : '—'}</span>
      <span class="mini">${x.cobrados}/${x.salieron} cobrados${efect !== null ? ` · ${efect}%` : ''}</span>` : ''}
    </a>`;
  }

  const filas = delDia.map((p) => `<tr><td>${esc(p.nombre)}</td><td>${esc(p.cliente)}</td><td>${esc(p.ciudad)}</td>
    <td><span class="chip ${p.grupo}">${ETIQUETAS[p.grupo]}</span>${['no_entregado', 'devuelto', 'en_reparto'].includes(p.grupo) ? `<div class="motivo">${esc(p.estado)}</div>` : ''}</td><td class="der">${gs(p.monto)}</td></tr>`).join('');

  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Panel Fixy · Cobranzas</title>
<style>
:root{--bg:#f6f6f4;--card:#fff;--txt:#1a1a1a;--sub:#6b6b6b;--borde:#e4e4e0;--oro:#b8860b;--ok:#1f8a4c;--mal:#c0392b;--info:#2563eb;--warn:#b7791f;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#111;--card:#1b1b1b;--txt:#f1f1f1;--sub:#a0a0a0;--borde:#2c2c2c;--oro:#e0b23c;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--txt);font:15px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
.wrap{max-width:1100px;margin:0 auto;padding:20px 16px 40px}h1{font-size:22px;margin:0 0 4px}.sub{color:var(--sub);font-size:13px;margin-bottom:18px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-bottom:22px}
.kpi{background:var(--card);border:1px solid var(--borde);border-radius:12px;padding:14px}.kpi b{display:block;font-size:22px;margin-top:4px}.kpi span{color:var(--sub);font-size:12px;text-transform:uppercase;letter-spacing:.4px}
.kpi.dest{border-color:var(--oro)}.kpi.dest b{color:var(--oro)}
.cab{display:flex;align-items:center;justify-content:space-between;margin:6px 0 10px}.cab a{color:var(--txt);text-decoration:none;border:1px solid var(--borde);border-radius:8px;padding:6px 12px;background:var(--card)}
.cab h2{margin:0;font-size:18px;text-transform:capitalize}
.cal{display:grid;grid-template-columns:repeat(7,1fr);gap:6px}.dsem{font-size:11px;color:var(--sub);text-align:center;text-transform:uppercase}
.cel{min-height:84px;background:var(--card);border:1px solid var(--borde);border-radius:10px;padding:6px 7px;text-decoration:none;color:var(--txt);display:flex;flex-direction:column;gap:2px}
.cel.vacia{background:transparent;border:0}.cel.sin{opacity:.55}.cel.sel{outline:2px solid var(--oro)}.num{font-weight:600;font-size:13px}
.plata{font-weight:700;font-size:13px;color:var(--ok)}.mini{font-size:11px;color:var(--sub)}
.tabla{overflow-x:auto;background:var(--card);border:1px solid var(--borde);border-radius:12px;margin-top:18px}
table{width:100%;border-collapse:collapse;font-size:14px}th,td{padding:9px 10px;border-bottom:1px solid var(--borde);text-align:left;white-space:nowrap}th{color:var(--sub);font-size:12px;font-weight:600}.der{text-align:right}
.chip{font-size:12px;padding:2px 8px;border-radius:99px;border:1px solid currentColor}.cobrado{color:var(--ok)}.en_reparto{color:var(--info)}.no_entregado{color:var(--warn)}.devuelto{color:var(--mal)}.pendiente{color:var(--sub)}
.motivo{font-size:12px;color:var(--sub);margin-top:3px;text-transform:capitalize}
.nota{color:var(--sub);font-size:12px;margin-top:14px}
@media (max-width:600px){.cel{min-height:62px}.plata{font-size:11px}.mini{display:none}}
</style></head><body><div class="wrap">
<h1>Panel de cobranzas · Fixy</h1><div class="sub">Resumen de ${esc(nombreMes)}</div>
<div class="kpis">
  <div class="kpi dest"><span>Cobrado</span><b>${gs(r.cobradoGs)}</b></div>
  <div class="kpi"><span>Efectividad</span><b>${r.efectividad}%</b></div>
  <div class="kpi"><span>Salieron a reparto</span><b>${r.salieron}</b></div>
  <div class="kpi"><span>Cobrados</span><b>${r.cobrados}</b></div>
  <div class="kpi"><span>En la calle</span><b>${r.enReparto} · ${gs(r.enRepartoGs)}</b></div>
  <div class="kpi"><span>No entregados</span><b>${r.noEntregados}</b></div>
  <div class="kpi"><span>Devueltos</span><b>${r.devueltos}</b></div>
  <div class="kpi"><span>Pendientes de salir</span><b>${r.pendientes}</b></div>
</div>
<div class="cab"><a href="${link(`mes=${mesAnt}`)}">‹</a><h2>${esc(nombreMes)}</h2><a href="${link(`mes=${mesSig}`)}">›</a></div>
<div class="cal">${['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((x) => `<div class="dsem">${x}</div>`).join('')}${celdas}</div>
${dia ? `<div class="tabla"><table><thead><tr><th>Pedido</th><th>Cliente</th><th>Ciudad</th><th>Estado</th><th class="der">Monto</th></tr></thead>
<tbody>${filas || '<tr><td colspan="5">Sin pedidos ese día</td></tr>'}</tbody></table></div>` : '<p class="nota">Tocá un día del calendario para ver sus pedidos.</p>'}
<p class="nota">Efectividad = cobrados ÷ salieron a reparto. Cada pedido cuenta en el día en que se cobró; si todavía no se cobró, en el día en que salió (o en que se creó, si aún no salió). Los montos son el total cobrado al cliente, antes del descuento de la tarifa de Fixy.</p>
</div></body></html>`;
}

export async function GET(request) {
  const url = new URL(request.url);
  const clave = url.searchParams.get('clave');
  if (!process.env.CLAVE_ADMIN || clave !== process.env.CLAVE_ADMIN) return new Response('No autorizado', { status: 401 });

  const hoy = diaPY(new Date().toISOString());
  const mes = /^\d{4}-\d{2}$/.test(url.searchParams.get('mes') || '') ? url.searchParams.get('mes') : hoy.slice(0, 7);
  const dia = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('dia') || '') ? url.searchParams.get('dia') : null;

  try {
    // Pedidos creados desde 45 días antes del mes (para incluir los que se cobran en el mes)
    const desde = new Date(Date.parse(`${mes}-01T00:00:00Z`) - 45 * 86400000).toISOString().slice(0, 10);
    const todos = (await traerPedidos(desde)).map(clasificar).filter(Boolean);
    const delMes = todos.filter((p) => diaRef(p)?.startsWith(mes));

    const porDia = {};
    for (const p of delMes) {
      const f = diaRef(p);
      porDia[f] ??= { salieron: 0, cobrados: 0, cobradoGs: 0 };
      if (p.salio) porDia[f].salieron++;
      if (p.grupo === 'cobrado') { porDia[f].cobrados++; porDia[f].cobradoGs += p.monto; }
    }
    const delDia = dia ? delMes.filter((p) => diaRef(p) === dia) : [];

    return new Response(pagina({ clave, mes, dia, r: resumen(delMes), porDia, delDia }), {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return new Response(`Error al armar el panel: ${esc(e.message)}`, { status: 500 });
  }
}
