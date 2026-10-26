import { fixyPost } from '../lib/fixy.js';

// Abrir en el navegador:
//   /api/admin?clave=TU_CLAVE&accion=test        -> prueba conexión con Fixy
//   /api/admin?clave=TU_CLAVE&accion=servicios   -> lista tus servicios y sucursales
//   /api/admin?clave=TU_CLAVE&accion=registrar   -> registra el webhook de estados en Fixy
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
    } else {
      return new Response('Acciones: test, servicios, registrar', { status: 400 });
    }

    return Response.json({ ok: true, resultado });
  } catch (e) {
    return Response.json({ ok: false, error: e.message }, { status: 500 });
  }
}
