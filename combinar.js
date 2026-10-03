#!/usr/bin/env node
// Combinator: genera y actualiza un cuaderno de combinaciones para Obsidian.
//
// Uso: node combinar.js [ficheiro.md]   (por defecto: combinacions.md)
//
// Lee las listas `mecanicas` y `operacions` del front matter, regenera el cuerpo
// (pares de mecánicas y operación · mecánica, en orden alfabético) conservando
// las notas escritas bajo cada título `###`, y genera `matriz.svg` al lado.
// Las notas que ya no encajan en ninguna combinación van a la sección `## Orfas`.
'use strict';

const fs = require('fs');
const path = require('path');

const LOCALE = 'gl';
const SEP_PAR = ' + ';
const SEP_OP = ' · ';
const VER_TAMEN = 'Ver tamén:';
const ORFAS = 'Orfas';
const SVG_NOME = 'matriz.svg';
const EMBED = `![[${SVG_NOME}]]`;
const PROHIBIDOS = /[+·#|^[\]:]/;

const comparar = (a, b) => a.localeCompare(b, LOCALE, { sensitivity: 'base' });
const normalizar = s => s.normalize('NFC').trim().replace(/\s+/g, ' ');
const clave = s => normalizar(s).toLowerCase();

const clavePar = (a, b) => 'p:' + [clave(a), clave(b)].sort().join('|');
const claveOp = (op, m) => 'o:' + clave(op) + '|' + clave(m);
const claveSeccion = m => 's:' + clave(m);

function claveDeTitulo(titulo) {
  const par = titulo.split(SEP_PAR);
  if (par.length === 2) return clavePar(par[0], par[1]);
  const op = titulo.split(SEP_OP);
  if (op.length === 2) return claveOp(op[0], op[1]);
  return claveSeccion(titulo);
}

// --- Front matter -----------------------------------------------------------

function separarFrontMatter(texto) {
  const m = texto.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!m) throw new Error('No se encontró front matter (--- ... ---) al inicio del fichero.');
  return { bruto: m[0].replace(/\r?\n?$/, '\n'), yaml: m[1], cuerpo: texto.slice(m[0].length) };
}

// Acepta `clave: a, b, c`, `clave: [a, b, c]` o una lista YAML con `- a` por línea.
function leerLista(yaml, patron, nombre) {
  const lineas = yaml.split(/\r?\n/);
  const i = lineas.findIndex(l => patron.test(l));
  if (i < 0) throw new Error(`Falta la lista \`${nombre}\` en el front matter.`);
  const valor = lineas[i].slice(lineas[i].indexOf(':') + 1).trim();
  let items = [];
  if (valor) {
    items = valor.replace(/^\[/, '').replace(/\]$/, '').split(',');
  } else {
    for (const l of lineas.slice(i + 1)) {
      const item = l.match(/^\s*-\s*(.*)$/);
      if (item) items.push(item[1]);
      else if (l.trim()) break;
    }
  }
  return items
    .map(s => normalizar(normalizar(s).replace(/^(["'])(.*)\1$/, '$2')))
    .filter(Boolean);
}

function validar(lista, nombre) {
  const errores = [];
  const vistos = new Map();
  const resultado = [];
  for (const item of lista) {
    if (PROHIBIDOS.test(item)) errores.push(`"${item}" contiene alguno de estos caracteres: + · # | ^ [ ] :`);
    if (clave(item) === clave(ORFAS)) errores.push(`"${item}" es un nombre reservado.`);
    if (vistos.has(clave(item))) {
      console.warn(`Aviso: "${item}" está repetido en ${nombre}; se usa una sola vez.`);
      continue;
    }
    vistos.set(clave(item), item);
    resultado.push(item);
  }
  if (errores.length) throw new Error(`Nombres no válidos en ${nombre}:\n  ${errores.join('\n  ')}`);
  return resultado.sort(comparar);
}

// --- Lectura de notas -------------------------------------------------------

// Devuelve el preámbulo (texto antes del primer `##`) y un Map clave -> {titulo, lineas}.
// Solo `##` y `###` son estructura; todo lo demás es nota y se copia literal.
function leerNotas(cuerpo) {
  const preambulo = [];
  const notas = new Map();
  let destino = preambulo;
  let trasH2 = false; // la línea justo después de `##` es donde el script escribe "Ver tamén"
  let enCodigo = false;

  const abrir = (k, titulo) => {
    if (!notas.has(k)) notas.set(k, { titulo, lineas: [] });
    const entrada = notas.get(k);
    while (entrada.lineas.length && !entrada.lineas[entrada.lineas.length - 1].trim()) entrada.lineas.pop();
    if (entrada.lineas.length) entrada.lineas.push('');
    return entrada.lineas;
  };

  for (const linea of cuerpo.split(/\r?\n/)) {
    const generada = (destino === preambulo && linea.trim() === EMBED) || (trasH2 && linea.startsWith(VER_TAMEN));
    trasH2 = false;
    if (/^\s*(```|~~~)/.test(linea)) enCodigo = !enCodigo;
    const h2 = !enCodigo && linea.match(/^##\s+(.+?)\s*$/);
    const h3 = !enCodigo && linea.match(/^###\s+(.+?)\s*$/);
    if (h2) {
      const titulo = normalizar(h2[1]);
      destino = abrir(claveSeccion(titulo), titulo);
      trasH2 = true;
    } else if (h3) {
      const titulo = normalizar(h3[1]);
      destino = abrir(claveDeTitulo(titulo), titulo);
    } else if (!generada) {
      destino.push(linea);
    }
  }

  const recortar = lineas => {
    while (lineas.length && !lineas[0].trim()) lineas.shift();
    while (lineas.length && !lineas[lineas.length - 1].trim()) lineas.pop();
    return lineas;
  };
  for (const entrada of notas.values()) recortar(entrada.lineas);
  return { preambulo: recortar(preambulo), notas };
}

// --- Conteo de notas --------------------------------------------------------

function contar(lineas) {
  const c = { aceptadas: 0, pendientes: 0, descartadas: 0, texto: false };
  for (const l of lineas) {
    if (!l.trim()) continue;
    c.texto = true;
    const tarea = l.match(/^\s*[-*+]\s+\[(.)\]/);
    if (tarea) {
      if ('+xX'.includes(tarea[1])) c.aceptadas++;
      else if (tarea[1] === '-') c.descartadas++;
      else c.pendientes++;
    } else if (/^[-*+]\s+\S/.test(l)) {
      c.pendientes++;
    }
  }
  return c;
}

function estado(c) {
  if (!c.texto) return 'vacia';
  if (c.aceptadas) return 'aceptada';
  if (c.descartadas && !c.pendientes) return 'descartada';
  return 'pendiente';
}

// --- Generación del markdown ------------------------------------------------

function generarMarkdown(frontMatter, preambulo, notas, mecanicas, operaciones) {
  const salida = [frontMatter.trimEnd(), ''];
  if (preambulo.length) salida.push(...preambulo, '');
  salida.push(EMBED, '');

  const usadas = new Set();
  const conteos = new Map();
  let nuevas = 0;

  const entrada = (k, titulo) => {
    usadas.add(k);
    const lineas = notas.has(k) ? notas.get(k).lineas : (nuevas++, []);
    conteos.set(k, contar(lineas));
    salida.push(`### ${titulo}`, ...lineas, '');
  };

  mecanicas.forEach((m, i) => {
    salida.push(`## ${m}`);
    const anteriores = mecanicas.slice(0, i);
    if (anteriores.length) {
      salida.push(`${VER_TAMEN} ` + anteriores.map(a => `[[#${a}${SEP_PAR}${m}|${a}]]`).join(' · '));
    }
    const ks = claveSeccion(m);
    usadas.add(ks);
    if (notas.has(ks) && notas.get(ks).lineas.length) salida.push('', ...notas.get(ks).lineas);
    salida.push('');
    for (const otra of mecanicas.slice(i + 1)) entrada(clavePar(m, otra), `${m}${SEP_PAR}${otra}`);
    for (const op of operaciones) entrada(claveOp(op, m), `${op}${SEP_OP}${m}`);
  });

  const claveOrfas = claveSeccion(ORFAS);
  usadas.add(claveOrfas);
  const orfas = [...notas.entries()]
    .filter(([k, e]) => !usadas.has(k) && e.lineas.length)
    .sort(([, a], [, b]) => comparar(a.titulo, b.titulo));
  const textoOrfas = notas.has(claveOrfas) ? notas.get(claveOrfas).lineas : [];
  if (orfas.length || textoOrfas.length) {
    salida.push(`## ${ORFAS}`);
    if (textoOrfas.length) salida.push(...textoOrfas);
    salida.push('');
    for (const [, e] of orfas) salida.push(`### ${e.titulo}`, ...e.lineas, '');
  }

  return { markdown: salida.join('\n').trimEnd() + '\n', conteos, nuevas, orfas: orfas.length };
}

// --- Matriz SVG -------------------------------------------------------------

const COLORES = {
  vacia: { fondo: '#f0f0f0', texto: '#999', nombre: 'Baleira' },
  pendiente: { fondo: '#f5c542', texto: '#333', nombre: 'Pendente' },
  aceptada: { fondo: '#43a047', texto: '#fff', nombre: 'Algunha aceptada' },
  descartada: { fondo: '#9e9e9e', texto: '#fff', nombre: 'Todo descartado' },
};

const escapar = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function generarSVG(mecanicas, operaciones, conteos) {
  const FUENTE = 12, ANCHO_LETRA = 6.8, CELDA = 22, MARGEN = 20;
  const anchoTexto = s => s.length * ANCHO_LETRA;
  const diagonal = lista => Math.max(0, ...lista.map(anchoTexto)) * Math.SQRT1_2;
  const etiquetaFila = Math.max(...mecanicas.map(anchoTexto)) + 10;
  const piezas = [];
  let y = MARGEN;
  let anchoTotal = 0;

  const total = { combinacions: 0, exploradas: 0, aceptadas: 0, pendientes: 0, descartadas: 0 };
  for (const c of conteos.values()) {
    total.combinacions++;
    if (c.texto) total.exploradas++;
    total.aceptadas += c.aceptadas;
    total.pendientes += c.pendientes;
    total.descartadas += c.descartadas;
  }

  const texto = (x, yy, contenido, extra = '') =>
    `<text x="${x}" y="${yy}" ${extra}>${escapar(contenido)}</text>`;

  piezas.push(texto(MARGEN, y + 4, 'Combinator', 'font-size="18" font-weight="bold"'));
  y += 24;
  piezas.push(texto(MARGEN, y,
    `${total.exploradas}/${total.combinacions} combinacións con notas · ` +
    `${total.aceptadas} aceptadas · ${total.pendientes} pendentes · ${total.descartadas} descartadas`));
  y += 20;
  let x = MARGEN;
  for (const { fondo, nombre } of Object.values(COLORES)) {
    piezas.push(`<rect x="${x}" y="${y - 11}" width="14" height="14" rx="2" fill="${fondo}"/>`);
    piezas.push(texto(x + 20, y, nombre));
    x += 30 + anchoTexto(nombre);
  }
  y += 30;

  // Dibuja una cuadrícula; celda(fila, col) devuelve la clave o null si no hay celda.
  const bloque = (titulo, filas, columnas, celda, tituloCelda) => {
    piezas.push(texto(MARGEN, y, titulo, 'font-size="15" font-weight="bold"'));
    y += 10 + diagonal(columnas);
    const x0 = MARGEN + etiquetaFila;
    columnas.forEach((col, j) => {
      const cx = x0 + j * CELDA + CELDA / 2;
      piezas.push(texto(cx, y - 4, col, `transform="rotate(-45 ${cx} ${y - 4})"`));
    });
    filas.forEach((fila, i) => {
      const fy = y + i * CELDA;
      piezas.push(texto(x0 - 8, fy + CELDA / 2 + 4, fila, 'text-anchor="end"'));
      columnas.forEach((col, j) => {
        const k = celda(fila, col, i, j);
        if (!k) return;
        const c = conteos.get(k);
        const color = COLORES[estado(c)];
        const notasTotales = c.aceptadas + c.pendientes + c.descartadas;
        const cx = x0 + j * CELDA;
        piezas.push(
          `<rect x="${cx + 1}" y="${fy + 1}" width="${CELDA - 2}" height="${CELDA - 2}" rx="3" fill="${color.fondo}">` +
          `<title>${escapar(`${tituloCelda(fila, col)}: ${c.aceptadas} aceptadas, ${c.pendientes} pendentes, ${c.descartadas} descartadas`)}</title></rect>`);
        if (notasTotales) {
          piezas.push(texto(cx + CELDA / 2, fy + CELDA / 2 + 4, String(notasTotales),
            `text-anchor="middle" font-size="10" fill="${color.texto}" pointer-events="none"`));
        }
      });
    });
    anchoTotal = Math.max(anchoTotal, x0 + columnas.length * CELDA + diagonal(columnas.slice(-1)) + MARGEN);
    y += filas.length * CELDA + 40;
  };

  bloque('Operación · mecánica', mecanicas, operaciones,
    (m, op) => claveOp(op, m), (m, op) => `${op}${SEP_OP}${m}`);
  if (mecanicas.length > 1) {
    bloque('Mecánica + mecánica', mecanicas.slice(1), mecanicas.slice(0, -1),
      (a, b, i, j) => (j <= i ? clavePar(a, b) : null), (a, b) => `${b}${SEP_PAR}${a}`);
  }

  const ancho = Math.ceil(Math.max(anchoTotal, 520));
  const alto = Math.ceil(y);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}" viewBox="0 0 ${ancho} ${alto}" ` +
    `font-family="sans-serif" font-size="${FUENTE}" fill="#222">\n` +
    `<rect width="100%" height="100%" fill="#fff"/>\n${piezas.join('\n')}\n</svg>\n`;
}

// --- Principal --------------------------------------------------------------

function escribirSiCambia(ruta, contenido, copia) {
  const anterior = fs.existsSync(ruta) ? fs.readFileSync(ruta, 'utf8') : null;
  if (anterior === contenido) return false;
  if (copia && anterior !== null) fs.writeFileSync(ruta + '.bak', anterior);
  fs.writeFileSync(ruta + '.tmp', contenido);
  fs.renameSync(ruta + '.tmp', ruta);
  return true;
}

// Transforma el texto del cuaderno sin tocar el disco.
function procesar(texto) {
  const fm = separarFrontMatter(texto);
  const mecanicas = validar(leerLista(fm.yaml, /^mec[aá]nicas\s*:/i, 'mecanicas'), 'mecanicas');
  const operaciones = validar(leerLista(fm.yaml, /^operaci[oó]ns\s*:/i, 'operacions'), 'operacions');
  const { preambulo, notas } = leerNotas(fm.cuerpo);
  const { markdown, conteos, nuevas, orfas } = generarMarkdown(fm.bruto, preambulo, notas, mecanicas, operaciones);
  const svg = generarSVG(mecanicas, operaciones, conteos);
  return { markdown, svg, conteos, nuevas, orfas, mecanicas, operaciones };
}

function main(argumento) {
  const ruta = path.resolve(argumento || 'combinacions.md');
  const { markdown, svg, nuevas, orfas, mecanicas, operaciones } = procesar(fs.readFileSync(ruta, 'utf8'));

  const cambioMd = escribirSiCambia(ruta, markdown, true);
  const cambioSvg = escribirSiCambia(path.join(path.dirname(ruta), SVG_NOME), svg, false);

  const pares = (mecanicas.length * (mecanicas.length - 1)) / 2;
  console.log(`${mecanicas.length} mecánicas, ${operaciones.length} operaciones → ` +
    `${pares} pares + ${mecanicas.length * operaciones.length} operación·mecánica.`);
  console.log(`Combinaciones nuevas: ${nuevas}. Huérfanas: ${orfas}.`);
  console.log(cambioMd || cambioSvg
    ? `Actualizado: ${[cambioMd && path.basename(ruta), cambioSvg && SVG_NOME].filter(Boolean).join(', ')}.`
    : 'Sin cambios.');
}

module.exports = { procesar, contar, estado, claveDeTitulo };

if (require.main === module) {
  try {
    main(process.argv[2]);
  } catch (e) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  }
}
