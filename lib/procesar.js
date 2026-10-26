import { obtenerOrden, agregarTags, quitarTags } from './shopify.js';
import { fixyPost, armarGuia } from './fixy.js';
import { resolverCp } from './cp.js';

// Envía una orden (formato webhook de Shopify) a Fixy. Devuelve el número de guía.
export async function enviarOrdenAFixy(orden) {
  const id = orden.admin_graphql_api_id;
  try {
    if (orden.cancelled_at) return { omitida: 'orden cancelada' };
    if (!orden.shipping_address) return { omitida: 'sin dirección de envío' };

    // Evita guías duplicadas
    const actual = await obtenerOrden(id);
    const previa = actual.tags.find((t) => t.startsWith('fixy-guia-'));
    if (previa) return { omitida: `ya tenía guía (${previa})` };

    const cp = await resolverCp(orden.shipping_address);
    if (!cp) {
      const ciudad = `${orden.shipping_address.city || '?'} (${orden.shipping_address.province || '?'})`;
      console.warn(`[${orden.name}] SIN COBERTURA: ${ciudad}`);
      await agregarTags(id, ['fixy-sin-cobertura']);
      return { omitida: `Fixy no cubre ${ciudad}` };
    }

    const respuesta = await fixyPost('guias.json', armarGuia(orden, cp));
    if (!respuesta.guia) throw new Error(`Fixy no devolvió guía: ${JSON.stringify(respuesta)}`);

    const viejas = actual.tags.filter((t) => t === 'fixy-error' || t === 'fixy-sin-cobertura');
    if (viejas.length) await quitarTags(id, viejas);
    await agregarTags(id, [`fixy-guia-${respuesta.guia}`]);
    console.log(`[${orden.name}] guía Fixy ${respuesta.guia} (CP ${cp})`);
    return { guia: respuesta.guia, cp };
  } catch (e) {
    console.error(`[${orden.name}] ERROR`, e.message);
    await agregarTags(id, ['fixy-error']).catch(() => {});
    return { error: e.message };
  }
}
