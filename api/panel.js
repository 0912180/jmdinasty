import { shopifyGQL } from '../lib/shopify.js';
import { traerMeta } from '../lib/meta.js';
import { cotizacionUSD } from '../lib/cambio.js';

// Panel UltraLabs: /api/panel?clave=TU_CLAVE&desde=2026-10-01&hasta=2026-10-28&moneda=PYG
const ZONA = process.env.FIXY_ZONA_HORARIA || 'America/Asuncion';
const LOGO = 'data:image/png;base64,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';
const EN_REPARTO = ['ruteado-para-su-entrega', 'yendo-a-entregar', 'entregado-a-agente-postal', 'recepcionado-en-cedi'];

// Costos en USD (variables de entorno, con los valores de tu planilla por defecto)
const n = (k, d) => Number(process.env[k] ?? d);
const COSTOS = {
  producto: n('COSTO_PRODUCTO_USD', 4),
  pack: n('COSTO_PACK_USD', 1.5),
  unidadesPorPack: n('UNIDADES_POR_PACK', 3),
  envio: n('COSTO_ENVIO_USD', 5.63),
  binancePct: n('COMISION_BINANCE_PCT', 2),
  efectividadSupuesta: n('EFECTIVIDAD_SUPUESTA_PCT', 50),
};

const diaPY = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(d ? new Date(d) : new Date());
const sumarDias = (f, k) => new Date(Date.parse(`${f}T12:00:00Z`) + k * 86400000).toISOString().slice(0, 10);
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const okFecha = (f) => /^\d{4}-\d{2}-\d{2}$/.test(f || '');

async function traerPedidos(desde, hasta) {
  const pedidos = [];
  let cursor = null;
  for (let i = 0; i < 20; i++) {
    const d = await shopifyGQL(
      `query($q: String!, $c: String) { orders(first: 250, after: $c, query: $q, sortKey: CREATED_AT) {
        pageInfo { hasNextPage endCursor }
        nodes { name createdAt cancelledAt tags
          totalPriceSet { shopMoney { amount } }
          shippingAddress { name city }
          lineItems(first: 20) { nodes { quantity requiresShipping } } } } }`,
      { q: `created_at:>=${sumarDias(desde, -1)} created_at:<=${sumarDias(hasta, 1)}`, c: cursor }
    );
    pedidos.push(...d.orders.nodes);
    if (!d.orders.pageInfo.hasNextPage) break;
    cursor = d.orders.pageInfo.endCursor;
  }
  return pedidos;
}

function clasificar(o, tasa) {
  const tags = o.tags || [];
  if (o.cancelledAt || tags.includes('fixy-anulado') || tags.includes('fixy-sin-cobertura')) return null;
  const estadoTag = tags.find((t) => t.startsWith('fixy-estado-')) || '';
  const estado = estadoTag.replace('fixy-estado-', '');

  let grupo = 'pendiente';
  if (estado === 'entregada') grupo = 'cobrado';
  else if (tags.includes('fixy-devuelto')) grupo = 'devuelto';
  else if (tags.includes('fixy-revisar')) grupo = 'no_entregado';
  else if (EN_REPARTO.some((e) => estado.startsWith(e))) grupo = 'en_reparto';

  const ventaGs = Number(o.totalPriceSet.shopMoney.amount);
  const ventaUSD = ventaGs / tasa;
  const unidades = Math.max(1, (o.lineItems?.nodes || []).filter((l) => l.requiresShipping).reduce((s, l) => s + l.quantity, 0));
  const costoUSD = unidades * COSTOS.producto + Math.ceil(unidades / COSTOS.unidadesPorPack) * COSTOS.pack + COSTOS.envio + ventaUSD * (COSTOS.binancePct / 100);

  return {
    nombre: o.name, cliente: o.shippingAddress?.name || '', ciudad: o.shippingAddress?.city || '',
    dia: diaPY(o.createdAt), ventaUSD, contribUSD: ventaUSD - costoUSD, unidades,
    grupo, salio: grupo !== 'pendiente', estado: estado.replace(/-/g, ' ') || 'sin estado',
  };
}

function calcular(pedidos, meta) {
  const r = { pedidos: pedidos.length, ventaUSD: 0, contribUSD: 0, salieron: 0, cobrados: 0, cobradoUSD: 0, contribCobradosUSD: 0,
    enCalle: 0, enCalleUSD: 0, noEntregados: 0, devueltos: 0, pendientes: 0,
    gastoUSD: meta.gastoUSD, comprasMeta: meta.compras, valorMeta: meta.valor };
  for (const p of pedidos) {
    r.ventaUSD += p.ventaUSD; r.contribUSD += p.contribUSD;
    if (p.salio) r.salieron++;
    if (p.grupo === 'cobrado') { r.cobrados++; r.cobradoUSD += p.ventaUSD; r.contribCobradosUSD += p.contribUSD; }
    if (p.grupo === 'en_reparto') { r.enCalle++; r.enCalleUSD += p.ventaUSD; }
    if (p.grupo === 'no_entregado') r.noEntregados++;
    if (p.grupo === 'devuelto') r.devueltos++;
    if (p.grupo === 'pendiente') r.pendientes++;
  }
  const div = (a, b) => (b ? a / b : null);
  r.cpaMeta = div(r.gastoUSD, r.comprasMeta);
  r.roasMeta = div(r.valorMeta, meta.gastoMonedaCuenta);
  r.cpaReal = div(r.gastoUSD, r.pedidos);
  r.roas = div(r.ventaUSD, r.gastoUSD);
  r.roasReal = div(r.cobradoUSD, r.gastoUSD);
  r.roasBreakeven = div(r.ventaUSD, r.contribUSD);
  r.ticket = div(r.ventaUSD, r.pedidos);
  r.efectividadReal = div(r.cobrados, r.salieron);
  r.profitSupuesto = r.contribUSD * (COSTOS.efectividadSupuesta / 100) - r.gastoUSD;
  r.profitReal = r.contribCobradosUSD - r.gastoUSD;
  return r;
}

function sparkline(valores, color) {
  const v = valores.map((x) => (Number.isFinite(x) ? x : 0));
  if (v.length < 2) return '';
  const min = Math.min(...v), max = Math.max(...v), rango = max - min || 1;
  const pts = v.map((x, i) => `${((i / (v.length - 1)) * 100).toFixed(1)},${(30 - ((x - min) / rango) * 26).toFixed(1)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 100 32" preserveAspectRatio="none"><polygon points="0,32 ${pts} 100,32" fill="${color}" opacity=".12"/><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>`;
}

function pagina(ctx) {
  const { clave, desde, hasta, moneda, tasa, fuenteTasa, r, serie, pedidosLista, metaError, metaMoneda } = ctx;
  const din = (usd) => {
    if (usd === null || !Number.isFinite(usd)) return '—';
    return moneda === 'USD'
      ? (usd < 0 ? '-$' : '$') + Math.abs(usd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : 'Gs. ' + Math.round(usd * tasa).toLocaleString('es-PY');
  };
  const pct = (x) => (x === null ? '—' : (x * 100).toFixed(1) + '%');
  const x2 = (x) => (x === null ? '—' : x.toFixed(2));
  const q = (extra) => `?clave=${encodeURIComponent(clave)}&moneda=${moneda}&${extra}`;
  const hoy = diaPY();
  const mesIni = hoy.slice(0, 8) + '01';
  const mesAntFin = sumarDias(mesIni, -1);
  const rapidos = [
    ['Hoy', hoy, hoy], ['Ayer', sumarDias(hoy, -1), sumarDias(hoy, -1)], ['7 días', sumarDias(hoy, -6), hoy],
    ['30 días', sumarDias(hoy, -29), hoy], ['Este mes', mesIni, hoy], ['Mes pasado', mesAntFin.slice(0, 8) + '01', mesAntFin],
  ];
  const s = (k) => serie.map((d) => d[k]);
  const card = (titulo, valor, extra = '', spark = '', clase = '') =>
    `<div class="card ${clase}"><div class="ct">${titulo}</div><div class="cv">${valor}</div>${extra ? `<div class="cx">${extra}</div>` : ''}${spark}</div>`;
  const signo = (v) => (v === null ? '' : v >= 0 ? 'pos' : 'neg');

  const filasDias = serie.map((d) => `<tr><td>${d.dia.slice(8)}/${d.dia.slice(5, 7)}</td><td>${d.pedidos}</td><td>${din(d.ventaUSD)}</td>
    <td>${din(d.gastoUSD)}</td><td>${din(d.cpaReal)}</td><td>${d.salieron}</td><td>${d.cobrados}</td><td>${pct(d.efectividadReal)}</td>
    <td class="${signo(d.profitReal)}">${din(d.profitReal)}</td></tr>`).join('');

  const ETQ = { cobrado: 'Cobrado', en_reparto: 'En reparto', no_entregado: 'No entregado', devuelto: 'Devuelto', pendiente: 'Pendiente' };
  const filasPedidos = pedidosLista.map((p) => `<tr><td>${esc(p.nombre)}</td><td>${esc(p.cliente)}</td><td>${esc(p.ciudad)}</td>
    <td><span class="chip ${p.grupo}">${ETQ[p.grupo]}</span>${p.grupo !== 'cobrado' && p.grupo !== 'pendiente' ? `<div class="motivo">${esc(p.estado)}</div>` : ''}</td>
    <td>${p.unidades}</td><td class="der">${din(p.ventaUSD)}</td></tr>`).join('');

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>UltraLabs · Panel</title><link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>📊</text></svg>">
<meta name="apple-mobile-web-app-capable" content="yes"><meta name="theme-color" content="#0b0b0c">
<style>
:root{--bg:#0b0b0c;--panel:#141416;--card:#18181b;--borde:#26262b;--txt:#f4f4f5;--sub:#9a9aa3;--oro:#e0b43c;--oro2:#b8860b;--verde:#3ecf8e;--rojo:#f87171;--azul:#60a5fa;--amar:#fbbf24;color-scheme:dark}
*{box-sizing:border-box}body{margin:0;background:radial-gradient(1200px 500px at 70% -10%,#2a2112 0,transparent 60%),var(--bg);color:var(--txt);font:14px/1.45 Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
.top{position:sticky;top:0;z-index:5;background:rgba(11,11,12,.85);backdrop-filter:blur(10px);border-bottom:1px solid var(--borde)}
.topin{max-width:1240px;margin:0 auto;padding:12px 18px;display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.logo{height:20px}.titulo{color:var(--sub);font-size:13px;border-left:1px solid var(--borde);padding-left:12px}
.esp{flex:1}.tasa{font-size:12px;color:var(--sub)}
.wrap{max-width:1240px;margin:0 auto;padding:18px}
.filtros{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:18px}
.pill{border:1px solid var(--borde);background:var(--panel);color:var(--txt);border-radius:999px;padding:7px 13px;text-decoration:none;font-size:13px}
.pill.on{background:var(--oro);color:#111;border-color:var(--oro);font-weight:600}
form.rango{display:flex;gap:6px;align-items:center;background:var(--panel);border:1px solid var(--borde);border-radius:999px;padding:4px 6px 4px 12px}
form.rango input{background:transparent;border:0;color:var(--txt);font:inherit;color-scheme:dark}
form.rango button{background:var(--oro);color:#111;border:0;border-radius:999px;padding:6px 12px;font-weight:600;cursor:pointer}
.mon{display:flex;border:1px solid var(--borde);border-radius:999px;overflow:hidden;margin-left:auto}.mon a{padding:7px 14px;color:var(--sub);text-decoration:none;font-size:13px}.mon a.on{background:var(--txt);color:#111;font-weight:600}
h2{font-size:15px;margin:26px 0 10px;display:flex;align-items:center;gap:8px}h2 .dot{width:8px;height:8px;border-radius:50%}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1px;background:var(--borde);border:1px solid var(--borde);border-radius:14px;overflow:hidden}
.card{background:var(--card);padding:14px 16px 10px;position:relative;min-height:118px}.ct{color:var(--sub);font-size:12.5px}.cv{font-size:25px;font-weight:700;letter-spacing:-.3px;margin-top:2px}
.cx{font-size:12px;color:var(--sub);margin-top:2px}.spark{width:100%;height:34px;display:block;margin-top:8px}
.hero .cv{font-size:30px}.hero.oro{background:linear-gradient(160deg,#241c0b,#18181b 60%)}.hero.oro .cv{color:var(--oro)}
.pos{color:var(--verde)!important}.neg{color:var(--rojo)!important}
.aviso{background:#2a1d0b;border:1px solid #5a4114;color:#f3d48a;border-radius:10px;padding:10px 14px;font-size:13px;margin-bottom:14px}
.tabla{overflow-x:auto;border:1px solid var(--borde);border-radius:14px;background:var(--card)}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:9px 12px;border-bottom:1px solid var(--borde);white-space:nowrap;text-align:left}th{color:var(--sub);font-weight:600;font-size:12px;background:var(--panel)}
tr:last-child td{border-bottom:0}.der{text-align:right}
.chip{font-size:11.5px;padding:2px 8px;border-radius:99px;border:1px solid currentColor}.cobrado{color:var(--verde)}.en_reparto{color:var(--azul)}.no_entregado{color:var(--amar)}.devuelto{color:var(--rojo)}.pendiente{color:var(--sub)}
.motivo{font-size:11.5px;color:var(--sub);margin-top:3px;text-transform:capitalize}
.nota{color:var(--sub);font-size:12px;margin-top:18px;line-height:1.6}
@media (max-width:640px){.grid{grid-template-columns:1fr 1fr}.card{min-height:104px;padding:12px}.cv{font-size:19px}.hero .cv{font-size:21px}.cx{font-size:11px}
.mon{margin-left:0}.titulo{display:none}}
</style></head><body>
<div class="top"><div class="topin"><img class="logo" src="${LOGO}" alt="UltraLabs"><span class="titulo">Panel de rendimiento</span><span class="esp"></span>
<span class="tasa">USD 1 = Gs. ${Math.round(tasa).toLocaleString('es-PY')} · ${esc(fuenteTasa)}</span></div></div>
<div class="wrap">
<div class="filtros">
  ${rapidos.map(([t, d, h]) => `<a class="pill${d === desde && h === hasta ? ' on' : ''}" href="${q(`desde=${d}&hasta=${h}`)}">${t}</a>`).join('')}
  <form class="rango" method="get"><input type="hidden" name="clave" value="${esc(clave)}"><input type="hidden" name="moneda" value="${moneda}">
    <input type="date" name="desde" value="${desde}"> – <input type="date" name="hasta" value="${hasta}"><button>Ver</button></form>
  <div class="mon"><a class="${moneda === 'PYG' ? 'on' : ''}" href="?clave=${encodeURIComponent(clave)}&moneda=PYG&desde=${desde}&hasta=${hasta}">Gs.</a><a class="${moneda === 'USD' ? 'on' : ''}" href="?clave=${encodeURIComponent(clave)}&moneda=USD&desde=${desde}&hasta=${hasta}">USD</a></div>
</div>
${metaError ? `<div class="aviso">⚠️ ${esc(metaError)}. Los datos de Meta se muestran en 0.</div>` : ''}

<h2><span class="dot" style="background:var(--oro)"></span>Resultado</h2>
<div class="grid">
  ${card(`Efectividad supuesta`, `${COSTOS.efectividadSupuesta}%`, 'Supuesto de planilla', '', 'hero')}
  ${card('Profit supuesto', `<span class="${signo(r.profitSupuesto)}">${din(r.profitSupuesto)}</span>`, `Con ${COSTOS.efectividadSupuesta}% de efectividad`, sparkline(serie.map((d) => d.profitSupuesto), '#e0b43c'), 'hero')}
  ${card('Efectividad real', pct(r.efectividadReal), `${r.cobrados} cobrados de ${r.salieron} que salieron`, sparkline(s('efectividadReal'), '#3ecf8e'), 'hero')}
  ${card('Profit real', `<span class="${signo(r.profitReal)}">${din(r.profitReal)}</span>`, 'Cobrado − costos − Meta', sparkline(s('profitReal'), '#3ecf8e'), 'hero oro')}
</div>

<h2><span class="dot" style="background:#4f7cff"></span>Meta Ads</h2>
<div class="grid">
  ${card('Inversión', din(r.gastoUSD), `Moneda de la cuenta: ${esc(metaMoneda)}`, sparkline(s('gastoUSD'), '#60a5fa'))}
  ${card('CPA (según Meta)', din(r.cpaMeta), `${r.comprasMeta} compras reportadas`, sparkline(s('cpaMeta'), '#60a5fa'))}
  ${card('ROAS (según Meta)', x2(r.roasMeta), 'Valor de compras ÷ inversión')}
  ${card('CPA real', din(r.cpaReal), `Inversión ÷ ${r.pedidos} pedidos de la tienda`, sparkline(s('cpaReal'), '#60a5fa'))}
</div>

<h2><span class="dot" style="background:#95bf47"></span>Tienda</h2>
<div class="grid">
  ${card('Pedidos', r.pedidos, `Ticket promedio ${din(r.ticket)}`, sparkline(s('pedidos'), '#95bf47'))}
  ${card('Facturación', din(r.ventaUSD), 'Todos los pedidos del período', sparkline(s('ventaUSD'), '#95bf47'))}
  ${card('ROAS', x2(r.roas), `Real (cobrado): ${x2(r.roasReal)}`)}
  ${card('ROAS breakeven', x2(r.roasBreakeven), 'Mínimo para no perder')}
</div>

<h2><span class="dot" style="background:var(--verde)"></span>Cobranza · Fixy</h2>
<div class="grid">
  ${card('Facturación cobrada', din(r.cobradoUSD), `${r.cobrados} pedidos entregados`)}
  ${card('Facturación neta', din(r.contribCobradosUSD), 'Cobrado − producto, pack, envío y Binance')}
  ${card('En la calle', din(r.enCalleUSD), `${r.enCalle} pedidos en reparto`)}
  ${card('No entregados', r.noEntregados, `${r.devueltos} devueltos · ${r.pendientes} sin salir`)}
</div>

<h2><span class="dot" style="background:var(--sub)"></span>Por día</h2>
<div class="tabla"><table><thead><tr><th>Día</th><th>Pedidos</th><th>Facturación</th><th>Inversión</th><th>CPA real</th><th>Salieron</th><th>Cobrados</th><th>Efectividad</th><th>Profit real</th></tr></thead>
<tbody>${filasDias || '<tr><td colspan="9">Sin datos</td></tr>'}</tbody></table></div>

${desde === hasta ? `<h2><span class="dot" style="background:var(--sub)"></span>Pedidos del día</h2>
<div class="tabla"><table><thead><tr><th>Pedido</th><th>Cliente</th><th>Ciudad</th><th>Estado</th><th>Unid.</th><th class="der">Monto</th></tr></thead>
<tbody>${filasPedidos || '<tr><td colspan="6">Sin pedidos</td></tr>'}</tbody></table></div>` : ''}

<p class="nota">Los pedidos se cuentan por el día en que se crearon, igual que el gasto de Meta, así cada día compara lo invertido con lo que generó. Profit supuesto = margen de todos los pedidos × ${COSTOS.efectividadSupuesta}% − inversión. Profit real = margen de los pedidos ya cobrados − inversión: en los días recientes sube a medida que Fixy entrega. Costos por pedido: producto $${COSTOS.producto} por frasco, pack $${COSTOS.pack} cada ${COSTOS.unidadesPorPack} frascos, envío $${COSTOS.envio}, Binance ${COSTOS.binancePct}% de la venta. Los no entregados y devueltos no suman costo. Conversión con la cotización actual.</p>
</div></body></html>`;
}

export async function GET(request) {
  const url = new URL(request.url);
  const clave = url.searchParams.get('clave');
  if (!process.env.CLAVE_ADMIN || clave !== process.env.CLAVE_ADMIN) return new Response('No autorizado', { status: 401 });

  const hoy = diaPY();
  let desde = okFecha(url.searchParams.get('desde')) ? url.searchParams.get('desde') : hoy.slice(0, 8) + '01';
  let hasta = okFecha(url.searchParams.get('hasta')) ? url.searchParams.get('hasta') : hoy;
  if (desde > hasta) [desde, hasta] = [hasta, desde];
  const moneda = url.searchParams.get('moneda') === 'USD' ? 'USD' : 'PYG';

  try {
    const [{ valor: tasa, fuente: fuenteTasa }, crudos, meta] = await Promise.all([cotizacionUSD(), traerPedidos(desde, hasta), traerMeta(desde, hasta)]);
    const pedidos = crudos.map((o) => clasificar(o, tasa)).filter((p) => p && p.dia >= desde && p.dia <= hasta);
    const aUSD = (v) => (meta.moneda === 'PYG' ? v / tasa : v);

    const dias = [];
    for (let f = desde; f <= hasta; f = sumarDias(f, 1)) dias.push(f);
    const metaDe = (lista) => {
      const m = { gastoUSD: 0, gastoMonedaCuenta: 0, compras: 0, valor: 0 };
      for (const f of lista) {
        const d = meta.dias[f];
        if (d) { m.gastoMonedaCuenta += d.gasto; m.gastoUSD += aUSD(d.gasto); m.compras += d.compras; m.valor += d.valorCompras; }
      }
      return m;
    };

    const r = calcular(pedidos, metaDe(dias));
    const serie = dias.map((f) => ({ dia: f, ...calcular(pedidos.filter((p) => p.dia === f), metaDe([f])) }));
    const pedidosLista = desde === hasta ? pedidos : [];

    return new Response(pagina({ clave, desde, hasta, moneda, tasa, fuenteTasa, r, serie, pedidosLista, metaError: meta.error, metaMoneda: meta.moneda }), {
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return new Response(`Error al armar el panel: ${esc(e.message)}`, { status: 500 });
  }
}
