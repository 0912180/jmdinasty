import { waitUntil } from '@vercel/functions';
import { verificarHmacShopify } from '../lib/shopify.js';
import { enviarOrdenAFixy } from '../lib/procesar.js';

// Shopify -> Fixy
// Recibe "Creación de pedido" y "Actualización de pedido" en esta misma URL.
// Con FIXY_REQUIERE_CONFIRMACION=si, solo carga en Fixy los pedidos que tengan la etiqueta de confirmación
// (por defecto CONFIRMADO, la que pone RedChat). Sin esa variable, carga todo pedido nuevo como antes.
export async function POST(request) {
  const raw = await request.text();
  if (!verificarHmacShopify(raw, request.headers.get('x-shopify-hmac-sha256'))) {
    return new Response('Firma inválida', { status: 401 });
  }
  const orden = JSON.parse(raw);
  const evento = request.headers.get('x-shopify-topic') || 'orders/create';
  const tags = String(orden.tags || '').split(',').map((t) => t.trim().toLowerCase());

  const requiereConfirmacion = process.env.FIXY_REQUIERE_CONFIRMACION === 'si';
  const etiqueta = (process.env.FIXY_ETIQUETA_CONFIRMADO || 'CONFIRMADO').toLowerCase();

  let enviar;
  if (requiereConfirmacion) {
    // Espera la etiqueta; si ya tiene guía, no hace nada (se chequea de nuevo adentro)
    enviar = tags.includes(etiqueta) && !tags.some((t) => t.startsWith('fixy-guia-'));
  } else {
    enviar = evento === 'orders/create';
  }

  if (enviar) waitUntil(enviarOrdenAFixy(orden));
  return new Response('ok'); // Shopify necesita respuesta rápida (5 s)
}
