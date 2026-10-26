import { buscarOrdenPorRemito, agregarTags, quitarTags, crearEnvio, marcarPagada } from '../lib/shopify.js';

// Fixy -> Shopify: cada cambio de estado de una guía actualiza la orden
export async function POST(request) {
  let datos;
  try { datos = await request.json(); } catch { return new Response('JSON inválido', { status: 400 }); }

  if (!process.env.FIXY_WEBHOOK_TOKEN || datos.token !== process.env.FIXY_WEBHOOK_TOKEN) {
    return new Response('No autorizado', { status: 401 });
  }

  try {
    await procesarEstado(datos);
  } catch (e) {
    console.error(`[remito ${datos.remito}] ERROR`, e.message);
  }
  return new Response('ok'); // Fixy exige 200
}

const slug = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function procesarEstado({ estado, codigo_estado, remito, guia }) {
  const orden = await buscarOrdenPorRemito(remito);
  if (!orden) return console.warn(`Orden no encontrada para remito ${remito}`);

  // Deja visible el último estado como etiqueta: fixy-estado-entregada, etc.
  const viejas = orden.tags.filter((t) => t.startsWith('fixy-estado-'));
  if (viejas.length) await quitarTags(orden.id, viejas);
  await agregarTags(orden.id, [`fixy-estado-${slug(estado)}`]);

  const codigo = String(codigo_estado || '').toUpperCase();
  const estadosDespacho = (process.env.FIXY_ESTADOS_DESPACHO || '')
    .split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);

  if (codigo === 'ENT' || estadosDespacho.includes(codigo)) {
    await crearEnvio(orden, String(guia));
  }
  if (codigo === 'ENT' && process.env.MARCAR_PAGADA_AL_ENTREGAR !== 'no' && orden.displayFinancialStatus !== 'PAID') {
    await marcarPagada(orden.id);
  }
  console.log(`[${orden.name}] estado Fixy: ${estado} (${codigo})`);
}
