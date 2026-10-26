import { waitUntil } from '@vercel/functions';
import { verificarHmacShopify, obtenerOrden, agregarTags, quitarTags } from '../lib/shopify.js';
import { fixyPost, armarGuia } from '../lib/fixy.js';

// Shopify -> Fixy: cada orden creada genera una guía en Fixy
export async function POST(request) {
  const raw = await request.text();
  if (!verificarHmacShopify(raw, request.headers.get('x-shopify-hmac-sha256'))) {
    return new Response('Firma inválida', { status: 401 });
  }
  const orden = JSON.parse(raw);
  // Respondemos rápido a Shopify (tiene timeout de 5 s) y procesamos después
  waitUntil(procesarOrden(orden));
  return new Response('ok');
}

async function procesarOrden(orden) {
  const id = orden.admin_graphql_api_id;
  try {
    if (orden.cancelled_at || !orden.shipping_address) return;

    // Evita guías duplicadas si Shopify reenvía el webhook
    const actual = await obtenerOrden(id);
    if (actual.tags.some((t) => t.startsWith('fixy-guia-'))) return;

    const respuesta = await fixyPost('guias.json', armarGuia(orden));
    if (!respuesta.guia) throw new Error(`Fixy no devolvió guía: ${JSON.stringify(respuesta)}`);

    if (actual.tags.includes('fixy-error')) await quitarTags(id, ['fixy-error']);
    await agregarTags(id, [`fixy-guia-${respuesta.guia}`]);
    console.log(`[${orden.name}] guía Fixy ${respuesta.guia}`);
  } catch (e) {
    console.error(`[${orden.name}] ERROR`, e.message);
    // Queda marcada en el admin para revisarla a mano
    await agregarTags(id, ['fixy-error']).catch(() => {});
  }
}
