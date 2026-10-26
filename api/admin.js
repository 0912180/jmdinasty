import { fixyPost } from '../lib/fixy.js';
import { cargarLocalidades } from '../lib/cp.js';
import { obtenerOrdenParaFixy } from '../lib/shopify.js';
import { enviarOrdenAFixy } from '../lib/procesar.js';

// Abrir en el navegador:
//   /api/admin?clave=TU_CLAVE&accion=test                   -> prueba conexión con Fixy
//   /api/admin?clave=TU_CLAVE&accion=servicios              -> lista tus servicios y sucursales
//   /api/admin?clave=TU_CLAVE&accion=registrar              -> registra el webhook de estados en Fixy
//   /api/admin?clave=TU_CLAVE&accion=localidades&buscar=katuete  -> busca CPs en la lista de Fixy
//   /api/admin?clave=TU_CLAVE&accion=reenviar&pedido=1033   -> reenvía a Fixy un pedido que falló
export async function GET(request) {
  const url = new URL(request.url);
  if (!process.env.CLAVE_ADMIN || url.searchParams.get('clave') !== process.env.CLAVE_ADMIN) {
    return new Response('No autorizado', { status: 401 });
  }

  try {
    const accion = url.searchParams.get('accion');
    let resultado;

    if (accion === 'test') {
      resultado = await fixyPost('dummy-test.json');
    } else if (accion === 'servicios') {
      resultado = {
        servicios: await fixyPost('serviciosByCliente.json').catch((e) => e.message),
        sucursales: await fixyPost('sucursalesByCliente.json').catch((e) => e.message),
      };
    } else if (accion === 'registrar') {
      resultado = await fixyPost('integracion.json', {
        url: `${url.origin}/api/fixy-estado`,
        notificacion: true,
        token: process.env.FIXY_WEBHOOK_TOKEN,
        usuario: 'shopify',
        sucursal: process.env.FIXY_CODIGO_SUCURSAL,
      });
    } else if (accion === 'localidades') {
      const buscar = (url.searchParams.get('buscar') || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
      const lista = await cargarLocalidades();
      resultado = {
        total_en_fixy: lista.length,
        encontrados: buscar ? lista.filter((x) => x.localidad.includes(buscar)).slice(0, 30) : lista.slice(0, 10),
      };
    } else if (accion === 'reenviar') {
      const pedido = url.searchParams.get('pedido');
      const orden = await obtenerOrdenParaFixy(pedido);
      if (!orden) return Response.json({ ok: false, error: `No encontré el pedido ${pedido}` }, { status: 404 });
      if (!orden.shipping_address) {
        return Response.json({ ok: false, error: 'Shopify no devolvió la dirección. Revisá el acceso a datos protegidos del cliente en el Dev Dashboard.' }, { status: 400 });
      }
      resultado = await enviarOrdenAFixy(orden);
    } else {
      return new Response('Acciones: test, servicios, registrar, localidades, reenviar', { status: 400 });
    }

    return Response.json({ ok: !resultado?.error, resultado });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
