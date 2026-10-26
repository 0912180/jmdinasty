const BASE = (process.env.FIXY_URL_BASE || 'https://paraguay.fixylogistica.com').replace(/\/$/, '');
const env = (nombre, porDefecto) => process.env[nombre] || porDefecto;

export async function fixyPost(ruta, body = {}) {
  const res = await fetch(`${BASE}/api/v2/${ruta}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ api_token: process.env.FIXY_API_TOKEN, ...body }),
  });
  const texto = await res.text();
  let data;
  try { data = JSON.parse(texto); } catch { data = { respuesta: texto }; }
  if (!res.ok) throw new Error(`Fixy ${ruta} ${res.status}: ${texto.slice(0, 800)}`);
  return data;
}

// "Mcal. López 1234" -> { calle: "Mcal. López", altura: 1234 }
// Sin número ("Brasilia casi España") -> altura 0 y la dirección completa va en info_adicional_1
export function separarCalleAltura(direccion = '') {
  const limpio = direccion.trim();
  const m = limpio.match(/^(.*?)[\s,]*(?:n[°º.]?\s*)?(\d{1,6})\s*$/i);
  if (m && m[1].trim()) return { calle: m[1].trim(), altura: Number(m[2]) };
  return { calle: limpio, altura: 0 };
}

const numero = (v) => Math.round(Number(v || 0) * 100) / 100;
const mayusSinTildes = (t = '') => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();

// Same Day vs 24 hs según el método de envío que eligió el cliente en el checkout
function elegirServicio(orden) {
  const metodo = (orden.shipping_lines || []).map((l) => l.title || '').join(' ').toLowerCase();
  const textoExpress = env('FIXY_TEXTO_EXPRESS', '').toLowerCase();
  if (textoExpress && metodo.includes(textoExpress) && env('FIXY_CODIGO_SERVICIO_EXPRESS')) {
    return env('FIXY_CODIGO_SERVICIO_EXPRESS');
  }
  return env('FIXY_CODIGO_SERVICIO');
}

export function armarGuia(orden) {
  const d = orden.shipping_address || {};
  const { calle, altura } = separarCalleAltura(d.address1);
  const remito = String(orden.name).replace(/^#/, '');
  const total = numero(orden.total_price);
  const items = orden.line_items || [];

  // Nombre comercial por SKU, ej: {"1-MAG-700MG":"UltraLabs - Magnesio 12 en 1"}
  let nombres = {};
  try { nombres = JSON.parse(env('FIXY_NOMBRES_SKU', '{}')); } catch { console.warn('FIXY_NOMBRES_SKU no es JSON válido'); }
  const marca = env('FIXY_MARCA', '');
  const nombreDe = (i) => nombres[i.sku] || (marca ? `${marca} - ${i.title}` : i.title);

  // Solo productos físicos (sin envíos ni servicios), una línea por SKU con su cantidad real
  const fisicos = items.filter((i) => i.requires_shipping !== false && i.quantity > 0);
  const contenido = fisicos.map((i) => `${i.quantity} x ${nombreDe(i)}`).join(', ').slice(0, 250);
  const cp = Number(String(d.zip || '').replace(/\D/g, '')) || Number(env('FIXY_CP_DEFAULT', '0'));

  // Referencias del domicilio: según el manual de Fixy van repetidas en los 3 campos de info adicional
  const referencias = [d.address2, orden.note].filter(Boolean).join(' | ').slice(0, 250);

  const vd = env('FIXY_VALOR_DECLARADO', '0');
  const valorDeclarado = vd === 'total' ? total : numero(vd);

  return {
    codigo_sucursal: env('FIXY_CODIGO_SUCURSAL'),
    codigo_servicio: elegirServicio(orden),
    fragil: false,
    remito, // Fixy rechaza remitos repetidos: evita guías duplicadas
    guia_agente: String(orden.id),
    internacional: false,
    isInversa: false,
    valor_declarado: valorDeclarado, // seguro: 0 si no lo tenés contratado
    contrareembolso: total, // monto que cobra el repartidor
    observaciones: referencias,
    pago_en: env('FIXY_PAGO_EN', 'ORIGEN'),
    tipo_operacion: env('FIXY_TIPO_OPERACION', 'ENTREGA'),
    is_urgente: false,
    valida_stock: env('FIXY_VALIDA_STOCK', 'no') === 'si',
    canal: 'API',
    comprador: {
      empresa: d.company || '',
      destinatario: d.name || `${d.first_name || ''} ${d.last_name || ''}`.trim(),
      calle,
      altura,
      piso: '',
      dpto: '',
      localidad: d.city || '',
      provincia: mayusSinTildes(d.province || d.city || ''),
      cp,
      email: orden.email || '',
      celular: d.phone || orden.phone || orden.customer?.phone || '',
      contenido,
      hora_desde: env('FIXY_HORA_DESDE', '10:30:00'),
      hora_hasta: env('FIXY_HORA_HASTA', '20:00:00'),
      info_adicional_1: referencias,
      info_adicional_2: referencias,
      info_adicional_3: `Dirección: ${d.address1 || ''}`.slice(0, 250),
      latitud: d.latitude ? String(d.latitude) : '',
      longitud: d.longitude ? String(d.longitude) : '',
    },
    productos: fisicos.map((i) => ({
      sku: i.sku || '',
      bultos: i.quantity, // debe coincidir con las unidades para que cuadre el stock
      peso: i.grams > 0 ? i.grams / 1000 : Number(env('FIXY_PESO_KG', '1')),
      descripcion: nombreDe(i).slice(0, 100),
      dimensiones: {
        alto: Number(env('FIXY_ALTO', '0.1')),
        largo: Number(env('FIXY_LARGO', '0.2')),
        profundidad: Number(env('FIXY_PROFUNDIDAD', '0.15')),
      },
    })),
  };
}
