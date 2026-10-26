import crypto from 'node:crypto';

const TIENDA = process.env.SHOPIFY_TIENDA; // ej: mitienda.myshopify.com
const API_VERSION = '2026-07';
let tokenCache = { valor: null, vence: 0 };

// Verifica que el webhook venga realmente de Shopify
export function verificarHmacShopify(rawBody, hmacHeader) {
  if (!hmacHeader || !process.env.SHOPIFY_WEBHOOK_SECRET) return false;
  const calculado = crypto
    .createHmac('sha256', process.env.SHOPIFY_WEBHOOK_SECRET)
    .update(rawBody, 'utf8')
    .digest('base64');
  const a = Buffer.from(calculado);
  const b = Buffer.from(hmacHeader);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Token de la app (client credentials). Se renueva solo cuando vence.
async function obtenerToken() {
  if (tokenCache.valor && Date.now() < tokenCache.vence) return tokenCache.valor;
  const res = await fetch(`https://${TIENDA}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.SHOPIFY_CLIENT_ID,
      client_secret: process.env.SHOPIFY_CLIENT_SECRET,
    }),
  });
  if (!res.ok) throw new Error(`Token Shopify ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const segundos = data.expires_in ?? 3600;
  tokenCache = { valor: data.access_token, vence: Date.now() + Math.max(segundos - 300, 60) * 1000 };
  return tokenCache.valor;
}

export async function shopifyGQL(query, variables = {}) {
  const token = await obtenerToken();
  const res = await fetch(`https://${TIENDA}/admin/api/${API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({ query, variables }),
  });
  const data = await res.json();
  if (!res.ok || data.errors) throw new Error(`GraphQL Shopify: ${JSON.stringify(data.errors || data)}`);
  return data.data;
}

function revisarErrores(resultado, nombre) {
  const errores = resultado?.userErrors || [];
  if (errores.length) throw new Error(`${nombre}: ${JSON.stringify(errores)}`);
}

const CAMPOS_ORDEN = `
  id name tags displayFinancialStatus
  fulfillmentOrders(first: 10) { nodes { id status } }
`;

export async function obtenerOrden(gid) {
  const d = await shopifyGQL(`query($id: ID!) { order(id: $id) { ${CAMPOS_ORDEN} } }`, { id: gid });
  return d.order;
}

// Busca la orden por el remito que le mandamos a Fixy (número de orden sin "#")
export async function buscarOrdenPorRemito(remito) {
  const r = String(remito).replace(/^#/, '');
  const d = await shopifyGQL(
    `query($q: String!) { orders(first: 1, query: $q) { nodes { ${CAMPOS_ORDEN} } } }`,
    { q: `name:#${r} OR name:${r}` }
  );
  return d.orders.nodes[0] || null;
}

export async function agregarTags(id, tags) {
  const d = await shopifyGQL(
    `mutation($id: ID!, $tags: [String!]!) { tagsAdd(id: $id, tags: $tags) { userErrors { field message } } }`,
    { id, tags }
  );
  revisarErrores(d.tagsAdd, 'tagsAdd');
}

export async function quitarTags(id, tags) {
  const d = await shopifyGQL(
    `mutation($id: ID!, $tags: [String!]!) { tagsRemove(id: $id, tags: $tags) { userErrors { field message } } }`,
    { id, tags }
  );
  revisarErrores(d.tagsRemove, 'tagsRemove');
}

// Marca la orden como enviada con el número de guía de Fixy
export async function crearEnvio(orden, nroGuia) {
  const abiertas = orden.fulfillmentOrders.nodes.filter((f) => ['OPEN', 'IN_PROGRESS'].includes(f.status));
  if (!abiertas.length) return false; // ya estaba enviada
  const d = await shopifyGQL(
    `mutation($f: FulfillmentInput!) { fulfillmentCreate(fulfillment: $f) { fulfillment { id } userErrors { field message } } }`,
    {
      f: {
        lineItemsByFulfillmentOrder: abiertas.map((f) => ({ fulfillmentOrderId: f.id })),
        trackingInfo: { number: nroGuia, company: 'Fixy Logística' },
        notifyCustomer: process.env.NOTIFICAR_CLIENTE === 'si',
      },
    }
  );
  revisarErrores(d.fulfillmentCreate, 'fulfillmentCreate');
  return true;
}

// Contra entrega: al entregarse, la orden queda como pagada
export async function marcarPagada(id) {
  const d = await shopifyGQL(
    `mutation($input: OrderMarkAsPaidInput!) { orderMarkAsPaid(input: $input) { userErrors { field message } } }`,
    { input: { id } }
  );
  revisarErrores(d.orderMarkAsPaid, 'orderMarkAsPaid');
}
