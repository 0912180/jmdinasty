import { waitUntil } from '@vercel/functions';
import { verificarHmacShopify } from '../lib/shopify.js';
import { enviarOrdenAFixy } from '../lib/procesar.js';

// Shopify -> Fixy: cada orden creada genera una guía en Fixy
export async function POST(request) {
  const raw = await request.text();
  if (!verificarHmacShopify(raw, request.headers.get('x-shopify-hmac-sha256'))) {
    return new Response('Firma inválida', { status: 401 });
  }
  const orden = JSON.parse(raw);
  // Respondemos rápido a Shopify (timeout de 5 s) y procesamos después
  waitUntil(enviarOrdenAFixy(orden));
  return new Response('ok');
}
