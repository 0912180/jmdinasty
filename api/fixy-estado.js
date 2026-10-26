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

const normalizar = (t) =>
  String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
const slug = (t) => normalizar(t).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Estados según la planilla oficial de Fixy (se comparan sin tildes ni mayúsculas)
const DESPACHADO = ['ruteado para su entrega', 'yendo a entregar', 'entregado a agente postal'];
const DESPACHADO_EMPIEZA = ['recepcionado en cedi'];
const REVISAR = [
  'direccion incorrecta o incompleta', 'zona restringida por paro general', 'direccion no geolocalizada',
  'reprogramado por mal clima', 'reprogramado por el comprador', 'visita sin contacto', 'sin dinero',
  'zona no atendida', 'paquete danado o incompleto', 'envio extraviado', 'envio robado',
  'falla mecanica, averia de vehiculo', 'zona peligrosa o de muy dificil acceso',
  'destinatario rechaza el envio', 'esperando programacion',
];
const DEVUELTO = ['envio devuelto', 'cobro de servicio y deolucion de mercaderia a la empresa', 'cobro de servicio y devolucion de mercaderia a la empresa'];

async function procesarEstado({ estado, codigo_estado, remito, guia }) {
  const orden = await buscarOrdenPorRemito(remito);
  if (!orden) return console.warn(`Orden no encontrada para remito ${remito}`);

  const e = normalizar(estado);
  const codigo = String(codigo_estado || '').toUpperCase();
  const extraDespacho = (process.env.FIXY_ESTADOS_DESPACHO || '').split(',').map(normalizar).filter(Boolean);

  const entregada = e === 'entregada' || codigo === 'ENT';
  const despachado = entregada || DESPACHADO.includes(e) || DESPACHADO_EMPIEZA.some((p) => e.startsWith(p))
    || extraDespacho.includes(e) || extraDespacho.includes(normalizar(codigo));
  const revisar = REVISAR.includes(e);

  // Etiquetas: se reemplaza el estado anterior por el actual
  const quitar = orden.tags.filter((t) => t.startsWith('fixy-estado-') || t === 'fixy-revisar');
  if (quitar.length) await quitarTags(orden.id, quitar);

  const nuevas = [`fixy-estado-${slug(estado)}`];
  if (revisar) nuevas.push('fixy-revisar');
  if (DEVUELTO.includes(e)) nuevas.push('fixy-devuelto');
  if (e === 'anulado') nuevas.push('fixy-anulado');
  await agregarTags(orden.id, nuevas);

  if (despachado) await crearEnvio(orden, String(guia));
  if (entregada && process.env.MARCAR_PAGADA_AL_ENTREGAR !== 'no' && orden.displayFinancialStatus !== 'PAID') {
    await marcarPagada(orden.id);
  }
  console.log(`[${orden.name}] estado Fixy: ${estado}${revisar ? ' -> REVISAR' : ''}`);
}
