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
  // "1034R" = pedido 1034 recargado en Fixy con un remito nuevo
  const r = String(remito).replace(/^#/, '').replace(/[-_ ]?R\d*$/i, '');
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
        trackingInfo: {
          number: nroGuia,
          company: 'Fixy Logística',
          url: process.env.FIXY_URL_SEGUIMIENTO || 'https://sistema.fixylogistica.com/seguimiento',
        },
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

// Trae una orden por número y la devuelve con el mismo formato que el webhook,
// para poder reenviarla a Fixy
export async function obtenerOrdenParaFixy(numero) {
  const r = String(numero).replace(/^#/, '');
  const d = await shopifyGQL(
    `query($q: String!) { orders(first: 1, query: $q) { nodes {
      id legacyResourceId name note email phone cancelledAt currencyCode
      totalPriceSet { shopMoney { amount } }
      shippingAddress { name firstName lastName company address1 address2 city province zip phone latitude longitude }
      shippingLines(first: 5) { nodes { title } }
      lineItems(first: 50) { nodes { title sku quantity requiresShipping } }
    } } }`,
    { q: `name:#${r} OR name:${r}` }
  );
  const o = d.orders.nodes[0];
  if (!o) return null;
  return {
    id: o.legacyResourceId,
    admin_graphql_api_id: o.id,
    name: o.name,
    note: o.note,
    email: o.email,
    phone: o.phone,
    cancelled_at: o.cancelledAt,
    currency: o.currencyCode,
    total_price: o.totalPriceSet.shopMoney.amount,
    shipping_address: o.shippingAddress
      ? {
          name: o.shippingAddress.name, first_name: o.shippingAddress.firstName, last_name: o.shippingAddress.lastName,
          company: o.shippingAddress.company, address1: o.shippingAddress.address1, address2: o.shippingAddress.address2,
          city: o.shippingAddress.city, province: o.shippingAddress.province, zip: o.shippingAddress.zip,
          phone: o.shippingAddress.phone, latitude: o.shippingAddress.latitude, longitude: o.shippingAddress.longitude,
        }
      : null,
    shipping_lines: o.shippingLines.nodes,
    line_items: o.lineItems.nodes.map((i) => ({ title: i.title, sku: i.sku, quantity: i.quantity, requires_shipping: i.requiresShipping, grams: 0 })),
  };
}
