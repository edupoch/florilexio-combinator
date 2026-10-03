#!/usr/bin/env node
// Combinator: genera y actualiza un cuaderno de combinaciones para Obsidian.
//
// Uso: node combinar.js [fichero.md]   (por defecto: combinacions.md)
//
// Lee las listas `mecanicas` y `operacions` del front matter, regenera el cuerpo
// (un `## Índice` con enlaces a cada mecánica y la matriz, y una `##` por mecánica, con sus pares en `### Combinacións` y sus operaciones
// en `### Operacións`, en orden alfabético) conservando las notas escritas bajo
// cada título `####`. Genera al lado `matriz.md`, una nota con la matriz en SVG
// cuyas casillas enlazan con su combinación, y `matriz.svg`, la misma imagen sin enlaces.
// Las notas que ya no encajan en ninguna combinación van a la sección `## Orfas`.
'use strict';

const fs = require('fs');
const path = require('path');

const LOCALE = 'gl';
const SEP_PAR = ' + ';
const SEP_OP = ' · ';
const VER_TAMEN = 'Ver tamén:';
const VER_TAMEN_GENERADO = /^Ver tamén: \[\[#[^\]]*\]\]( · \[\[#[^\]]*\]\])*\s*$/;
const ORFAS = 'Orfas';
const GRUPO_PARES = 'Combinacións';
const GRUPO_OPS = 'Operacións';
const INDICE = 'Índice';
const ENLACE_INDICE_GENERADO = /^- \[\[#[^\]]*\]\]\s*$/;
const RESERVADOS = [INDICE, ORFAS, GRUPO_PARES, GRUPO_OPS];
const SVG_NOME = 'matriz.svg';
const NOTA_MATRIZ = 'matriz';
const EMBED = `![[${NOTA_MATRIZ}]]`;
const EMBEDS_GENERADOS = new Set([EMBED, `![[${NOTA_MATRIZ}.md]]`, `![[${SVG_NOME}]]`]);
const PROHIBIDOS = /[+·#|^[\]:]/;

const comparar = (a, b) => a.localeCompare(b, LOCALE, { sensitivity: 'base' });
const normalizar = s => s.normalize('NFC').trim().replace(/\s+/g, ' ');
const clave = s => normalizar(s).toLowerCase();

const clavePar = (a, b) => 'p:' + [clave(a), clave(b)].sort().join('|');
const claveOp = (op, m) => 'o:' + clave(op) + '|' + clave(m);
const claveSeccion = m => 's:' + clave(m);
const claveGrupo = (grupo, m) => 'g:' + clave(grupo) + '|' + clave(m);

// Nombre canónico de un grupo (`Combinacións`/`Operacións`), o null si no lo es.
const grupo = titulo => [GRUPO_PARES, GRUPO_OPS].find(g => clave(g) === clave(titulo)) || null;

function claveDeTitulo(titulo) {
  const par = titulo.split(SEP_PAR);
  if (par.length === 2) return clavePar(par[0], par[1]);
  const op = titulo.split(SEP_OP);
  if (op.length === 2) return claveOp(op[0], op[1]);
  // Notas generales de un grupo que quedaron huérfanas: "Combinacións de Cortar".
  const deGrupo = titulo.match(/^(\S+) de (.+)$/);
  if (deGrupo && grupo(deGrupo[1])) return claveGrupo(deGrupo[1], deGrupo[2]);
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
    if (RESERVADOS.some(r => clave(r) === clave(item))) errores.push(`"${item}" es un nombre reservado.`);
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

// Obsidian resuelve los enlaces a títulos cambiando estos caracteres por espacios
// (función de normalización de títulos de Obsidian), así que dos títulos que solo se
// diferencian en ellos llevan al mismo sitio: el primero que aparece.
const IGNORADOS_OBSIDIAN = /[!"#$%&()*+,.:;<=>?@^`{|}~\/[\]\\\r\n]/g;
const destinoObsidian = s => s.replace(IGNORADOS_OBSIDIAN, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

function comprobarDestinos(mecanicas, operaciones) {
  const titulos = [INDICE, ORFAS, ...mecanicas];
  mecanicas.forEach((m, i) => mecanicas.slice(i + 1).forEach(otra => titulos.push(`${m}${SEP_PAR}${otra}`)));
  for (const op of operaciones) for (const m of mecanicas) titulos.push(`${op}${SEP_OP}${m}`);

  const vistos = new Map();
  const choques = [];
  for (const titulo of titulos) {
    const k = destinoObsidian(titulo);
    if (vistos.has(k)) choques.push(`"${vistos.get(k)}" y "${titulo}"`);
    else vistos.set(k, titulo);
  }
  if (choques.length) {
    const resto = choques.length > 5 ? `\n  … y ${choques.length - 5} más` : '';
    throw new Error(
      'Obsidian no distingue estos títulos, porque al resolver enlaces ignora ' +
      '! " # $ % & ( ) * + , . : ; < = > ? @ ^ ` { | } ~ / [ ] \\:\n  ' +
      choques.slice(0, 5).join('\n  ') + resto + '\nCambia uno de los nombres para que se diferencien en algo más.');
  }
}

// --- Lectura de notas -------------------------------------------------------

// Devuelve el preámbulo (texto antes del primer `##`) y un Map clave -> {titulo, lineas}.
// Solo `##`, `###` y `####` son estructura; todo lo demás es nota y se copia literal.
// Las entradas se reconocen por su título, así que también se leen las que están
// en `###` (formato anterior) o fuera de su sección.
function leerNotas(cuerpo) {
  const preambulo = [];
  const notas = new Map();
  let destino = preambulo;
  let seccion = null; // título de la `##` actual
  let generales = false; // notas generales de una mecánica o grupo, donde el script escribe "Ver tamén"
  let enIndice = false;
  let enCodigo = false;

  const abrir = (k, titulo) => {
    if (!notas.has(k)) notas.set(k, { titulo, lineas: [] });
    const entrada = notas.get(k);
    while (entrada.lineas.length && !entrada.lineas[entrada.lineas.length - 1].trim()) entrada.lineas.pop();
    if (entrada.lineas.length) entrada.lineas.push('');
    return entrada.lineas;
  };

  for (const linea of cuerpo.split(/\r?\n/)) {
    const generada =
      ((destino === preambulo || enIndice) && EMBEDS_GENERADOS.has(linea.trim())) ||
      (enIndice && ENLACE_INDICE_GENERADO.test(linea)) ||
      (generales && VER_TAMEN_GENERADO.test(linea));
    if (/^\s*(```|~~~)/.test(linea)) enCodigo = !enCodigo;
    const titulo = !enCodigo && linea.match(/^(#{2,4})\s+(.+?)\s*$/);
    if (titulo) {
      const nivel = titulo[1].length;
      const texto = normalizar(titulo[2]);
      enIndice = nivel === 2 && clave(texto) === clave(INDICE);
      let k = claveDeTitulo(texto);
      let nombre = texto;
      if (nivel === 2) {
        seccion = texto;
        k = claveSeccion(texto);
      } else if (nivel === 3 && grupo(texto) && seccion) {
        k = claveGrupo(texto, seccion);
        nombre = `${grupo(texto)} de ${seccion}`;
      }
      destino = abrir(k, nombre);
      generales = !k.startsWith('p:') && !k.startsWith('o:');
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
  const posicionIndice = salida.length; // el índice se inserta al final, cuando se sabe si hay Orfas

  const usadas = new Set();
  const conteos = new Map();
  let nuevas = 0;

  const notasDe = k => {
    usadas.add(k);
    return notas.has(k) ? notas.get(k).lineas : [];
  };
  const titulo = (cabecera, lineas, generadas = []) => {
    salida.push(cabecera, ...generadas);
    if (lineas.length) salida.push(...(generadas.length ? [''] : []), ...lineas);
    salida.push('');
  };
  const entrada = (k, texto) => {
    if (!notas.has(k)) nuevas++;
    const lineas = notasDe(k);
    conteos.set(k, contar(lineas));
    titulo(`#### ${texto}`, lineas);
  };

  mecanicas.forEach((m, i) => {
    titulo(`## ${m}`, notasDe(claveSeccion(m)));

    const anteriores = mecanicas.slice(0, i);
    const posteriores = mecanicas.slice(i + 1);
    const notasPares = notasDe(claveGrupo(GRUPO_PARES, m));
    if (anteriores.length || posteriores.length || notasPares.length) {
      const verTamen = anteriores.length
        ? [`${VER_TAMEN} ` + anteriores.map(a => `[[#${a}${SEP_PAR}${m}|${a}]]`).join(' · ')]
        : [];
      titulo(`### ${GRUPO_PARES}`, notasPares, verTamen);
      for (const otra of posteriores) entrada(clavePar(m, otra), `${m}${SEP_PAR}${otra}`);
    }

    const notasOps = notasDe(claveGrupo(GRUPO_OPS, m));
    if (operaciones.length || notasOps.length) {
      titulo(`### ${GRUPO_OPS}`, notasOps);
      for (const op of operaciones) entrada(claveOp(op, m), `${op}${SEP_OP}${m}`);
    }
  });

  const notasIndice = notasDe(claveSeccion(INDICE));
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

  const enlaces = [...mecanicas, ...(salida.includes(`## ${ORFAS}`) ? [ORFAS] : [])].map(t => `- [[#${t}|${t}]]`);
  const indice = [`## ${INDICE}`, ...enlaces, '', EMBED, ''];
  if (notasIndice.length) indice.push(...notasIndice, '');
  salida.splice(posicionIndice, 0, ...indice);

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

// Con `nota`, cada casilla enlaza con su título en esa nota de Obsidian.
function generarSVG(mecanicas, operaciones, conteos, nota = null) {
  const FUENTE = 12, ANCHO_LETRA = 6.8, CELDA = 22, MARGEN = 20;
  const anchoTexto = s => s.length * ANCHO_LETRA;
  const diagonal = lista => Math.max(0, ...lista.map(anchoTexto)) * Math.SQRT1_2;
  // Mismo ancho de etiquetas en los dos bloques para que las cuadrículas queden alineadas.
  const etiquetaFila = Math.max(...mecanicas.map(anchoTexto), ...operaciones.map(anchoTexto)) + 10;
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
        const titulo = tituloCelda(fila, col);
        let casilla =
          `<rect x="${cx + 1}" y="${fy + 1}" width="${CELDA - 2}" height="${CELDA - 2}" rx="3" fill="${color.fondo}">` +
          `<title>${escapar(`${titulo}: ${c.aceptadas} aceptadas, ${c.pendientes} pendentes, ${c.descartadas} descartadas`)}</title></rect>`;
        if (notasTotales) {
          casilla += texto(cx + CELDA / 2, fy + CELDA / 2 + 4, String(notasTotales),
            `text-anchor="middle" font-size="10" fill="${color.texto}" pointer-events="none"`);
        }
        if (nota) {
          const destino = escapar(`${nota}#${titulo}`);
          casilla = `<a class="internal-link" data-href="${destino}" href="${destino}">${casilla}</a>`;
        }
        piezas.push(casilla);
      });
    });
    anchoTotal = Math.max(anchoTotal, x0 + columnas.length * CELDA + diagonal(columnas.slice(-1)) + MARGEN);
    y += filas.length * CELDA + 40;
  };

  bloque('Operación · mecánica', operaciones, mecanicas,
    (op, m) => claveOp(op, m), (op, m) => `${op}${SEP_OP}${m}`);
  if (mecanicas.length > 1) {
    bloque('Mecánica + mecánica', mecanicas.slice(1), mecanicas.slice(0, -1),
      (a, b, i, j) => (j <= i ? clavePar(a, b) : null), (a, b) => `${b}${SEP_PAR}${a}`);
  }

  const ancho = Math.ceil(Math.max(anchoTotal, 520));
  const alto = Math.ceil(y);
  const estilo = nota ? ' style="max-width:100%;height:auto"' : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="${alto}" viewBox="0 0 ${ancho} ${alto}"${estilo} ` +
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

// Transforma el texto del cuaderno sin tocar el disco. `nota` es el nombre del
// cuaderno en Obsidian (sin `.md`), al que enlazan las casillas de la matriz.
function procesar(texto, nota = 'combinacions') {
  const fm = separarFrontMatter(texto);
  const mecanicas = validar(leerLista(fm.yaml, /^mec[aá]nicas\s*:/i, 'mecanicas'), 'mecanicas');
  const operaciones = validar(leerLista(fm.yaml, /^operaci[oó]ns\s*:/i, 'operacions'), 'operacions');
  comprobarDestinos(mecanicas, operaciones);
  const { preambulo, notas } = leerNotas(fm.cuerpo);
  const { markdown, conteos, nuevas, orfas } = generarMarkdown(fm.bruto, preambulo, notas, mecanicas, operaciones);
  const svg = generarSVG(mecanicas, operaciones, conteos);
  // Sin líneas en blanco dentro del SVG: Obsidian cortaría ahí el bloque HTML.
  const notaMatriz = `%% Generado por combinar.js a partir de ${nota}.md: no editar. %%\n\n` +
    generarSVG(mecanicas, operaciones, conteos, nota);
  return { markdown, svg, notaMatriz, conteos, nuevas, orfas, mecanicas, operaciones };
}

const leerCuaderno = ruta => procesar(fs.readFileSync(ruta, 'utf8'), path.basename(ruta, '.md'));

// Escribe `matriz.md` y `matriz.svg` junto al cuaderno; devuelve los nombres de los que cambiaron.
function escribirMatrices(ruta, { svg, notaMatriz }) {
  const carpeta = path.dirname(ruta);
  return [
    escribirSiCambia(path.join(carpeta, `${NOTA_MATRIZ}.md`), notaMatriz, false) && `${NOTA_MATRIZ}.md`,
    escribirSiCambia(path.join(carpeta, SVG_NOME), svg, false) && SVG_NOME,
  ].filter(Boolean);
}

// Regenera solo las matrices, sin tocar el cuaderno.
const actualizarMatrices = ruta => escribirMatrices(ruta, leerCuaderno(ruta));

function main(argumento) {
  const ruta = path.resolve(argumento || 'combinacions.md');
  const resultado = leerCuaderno(ruta);
  const { markdown, nuevas, orfas, mecanicas, operaciones } = resultado;

  const actualizados = [
    escribirSiCambia(ruta, markdown, true) && path.basename(ruta),
    ...escribirMatrices(ruta, resultado),
  ].filter(Boolean);

  const pares = (mecanicas.length * (mecanicas.length - 1)) / 2;
  console.log(`${mecanicas.length} mecánicas, ${operaciones.length} operaciones → ` +
    `${pares} pares + ${mecanicas.length * operaciones.length} operación·mecánica.`);
  console.log(`Combinaciones nuevas: ${nuevas}. Huérfanas: ${orfas}.`);
  console.log(actualizados.length ? `Actualizado: ${actualizados.join(', ')}.` : 'Sin cambios.');
}

module.exports = { procesar, actualizarMatrices, contar, estado, claveDeTitulo };

if (require.main === module) {
  try {
    main(process.argv[2]);
  } catch (e) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  }
}
