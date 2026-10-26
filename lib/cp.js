import { fixyPost } from './fixy.js';

// Normaliza para comparar: "Katueté" -> "katuete"
const norm = (t) => String(t ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
const digitos = (t) => String(t ?? '').replace(/\D/g, '');

let cache = { lista: null, hasta: 0 };

// Busca dentro de la respuesta el primer array de objetos (Fixy puede devolverlo envuelto)
function buscarArray(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    for (const v of Object.values(data)) {
      const r = buscarArray(v);
      if (r.length && typeof r[0] === 'object') return r;
    }
  }
  return [];
}

function valor(obj, regex) {
  for (const [k, v] of Object.entries(obj)) {
    if (!regex.test(k) || v == null) continue;
    if (typeof v === 'object') return v.nombre || v.descripcion || v.name || '';
    return v;
  }
  return undefined;
}

function aEntrada(o) {
  return {
    cp: digitos(valor(o, /^(cp|codigo_?postal|cod_?postal|postal|cp_destino)$/i)),
    localidad: norm(valor(o, /localidad|ciudad|city/i) ?? valor(o, /^(nombre|descripcion)$/i)),
    provincia: norm(valor(o, /provincia|departamento/i)),
  };
}

export async function cargarLocalidades() {
  if (cache.lista && Date.now() < cache.hasta) return cache.lista;
  let lista = [];
  for (const ruta of ['localidades.json', 'listarCps']) {
    try {
      lista = buscarArray(await fixyPost(ruta)).map(aEntrada).filter((x) => x.cp && x.localidad);
      if (lista.length) break;
    } catch (e) {
      console.warn(`No se pudo leer ${ruta}:`, e.message);
    }
  }
  cache = { lista, hasta: Date.now() + 12 * 60 * 60 * 1000 };
  return lista;
}

// Devuelve un CP que Fixy acepte, o null si no hay forma de resolverlo
export async function resolverCp(direccion = {}) {
  const zip = digitos(direccion.zip);
  const ciudad = norm(direccion.city);
  const depto = norm(direccion.province);

  // 1) Correcciones manuales por ciudad: FIXY_CP_POR_CIUDAD={"katuete":"1234"}
  try {
    const manual = JSON.parse(process.env.FIXY_CP_POR_CIUDAD || '{}');
    for (const [c, cp] of Object.entries(manual)) if (norm(c) === ciudad && digitos(cp)) return Number(digitos(cp));
  } catch { console.warn('FIXY_CP_POR_CIUDAD no es JSON válido'); }

  // Si está activado, solo se aceptan las ciudades de FIXY_CP_POR_CIUDAD (zona de cobertura)
  if (process.env.FIXY_SOLO_COBERTURA === 'si') return null;

  const lista = await cargarLocalidades();

  // 2) El CP que puso el cliente, si Fixy lo tiene cargado (o si no pudimos leer la lista)
  if (zip && (!lista.length || lista.some((x) => x.cp === zip))) return Number(zip);

  // 3) Buscar el CP por ciudad (y departamento si coincide)
  if (ciudad) {
    const candidatos = lista.filter((x) => x.localidad === ciudad);
    const elegido = candidatos.find((x) => depto && x.provincia === depto) || candidatos[0];
    if (elegido) return Number(elegido.cp);
  }

  // 4) CP por departamento para ciudades que Fixy atiende desde otra sucursal:
  //    FIXY_CP_POR_DEPARTAMENTO={"canindeyu":"XXXX"}
  try {
    const porDepto = JSON.parse(process.env.FIXY_CP_POR_DEPARTAMENTO || '{}');
    for (const [dep, cp] of Object.entries(porDepto)) if (norm(dep) === depto && digitos(cp)) return Number(digitos(cp));
  } catch { console.warn('FIXY_CP_POR_DEPARTAMENTO no es JSON válido'); }

  // 5) Último recurso
  return Number(process.env.FIXY_CP_DEFAULT || 0) || null;
}
