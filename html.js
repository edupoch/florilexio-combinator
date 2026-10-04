// Convierte el cuaderno (ya regenerado por combinar.js) en una página HTML autónoma:
// la matriz arriba, con cada casilla enlazando con su sección, y debajo todas las notas.
//
// Solo entiende el Markdown que se usa en el cuaderno: títulos, listas (con tareas
// `[ ]`, `[+]`, `[x]`, `[-]`), citas, bloques de código, párrafos y formato en línea
// (negrita, cursiva, tachado, resaltado, código, enlaces y wikilinks).
'use strict';

const EMBED_MATRIZ = /^!\[\[matriz(\.md|\.svg)?\]\]$/;
const MARCA_MATRIZ = '\u0000MATRIZ\u0000';
const VER_TAMEN = 'Ver tamén:';

const escapar = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const claveTitulo = s => s.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();

// Identificador legible y único para cada título; el primero de cada texto es el que
// reciben los enlaces (como en Obsidian).
function asignarIds(lineas) {
  const ids = new Map();
  const usados = new Set();
  const porLinea = new Map();
  let enCodigo = false;
  lineas.forEach((l, i) => {
    if (/^\s*(```|~~~)/.test(l)) enCodigo = !enCodigo;
    const t = !enCodigo && l.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (!t) return;
    const base = claveTitulo(t[2]).normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'seccion';
    let id = base;
    for (let n = 2; usados.has(id); n++) id = `${base}-${n}`;
    usados.add(id);
    porLinea.set(i, id);
    if (!ids.has(claveTitulo(t[2]))) ids.set(claveTitulo(t[2]), id);
  });
  return { ids, porLinea };
}

function enLinea(texto, ids) {
  const guardados = [];
  const guardar = html => `\u0001${guardados.push(html) - 1}\u0001`;

  let s = texto.replace(/`([^`]+)`/g, (_, c) => guardar(`<code>${escapar(c)}</code>`));
  s = s.replace(/!?\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, destino, alias) => {
    const almohadilla = destino.indexOf('#');
    const titulo = almohadilla >= 0 ? destino.slice(almohadilla + 1) : '';
    const visible = escapar(alias || titulo || destino);
    const id = titulo && ids.get(claveTitulo(titulo));
    return guardar(id ? `<a href="#${id}">${visible}</a>` : `<span class="wikilink">${visible}</span>`);
  });
  s = s.replace(/\[([^\]]+)\]\(((?:https?:|mailto:)[^)\s]+)\)/g,
    (_, t, url) => guardar(`<a href="${escapar(url)}">${escapar(t)}</a>`));
  s = escapar(s)
    .replace(/\*\*(.+?)\*\*|__(.+?)__/g, (_, a, b) => `<strong>${a || b}</strong>`)
    .replace(/\*([^*\s][^*]*?)\*|(^|[^\p{L}\p{N}_])_([^_\s][^_]*?)_(?![\p{L}\p{N}])/gu,
      (_, a, antes, b) => (a ? `<em>${a}</em>` : `${antes}<em>${b}</em>`))
    .replace(/~~(.+?)~~/g, '<del>$1</del>')
    .replace(/==(.+?)==/g, '<mark>$1</mark>');
  return s.replace(/\u0001(\d+)\u0001/g, (_, n) => guardados[n]);
}

const TAREAS = { aceptada: '✓', pendiente: '', descartada: '✕' };

function lista(items, ids) {
  let html = '';
  const pila = [];
  for (const { sangria, etiqueta, texto } of items) {
    while (pila.length && sangria < pila[pila.length - 1].sangria) html += `</li></${pila.pop().etiqueta}>`;
    if (!pila.length || sangria > pila[pila.length - 1].sangria) {
      html += `<${etiqueta}>`;
      pila.push({ sangria, etiqueta });
    } else {
      html += '</li>';
    }
    const tarea = texto.match(/^\[(.)\]\s?(.*)$/s);
    if (tarea) {
      const tipo = '+xX'.includes(tarea[1]) ? 'aceptada' : tarea[1] === '-' ? 'descartada' : 'pendiente';
      html += `<li class="tarea ${tipo}"><span class="marca" aria-label="${tipo}">${TAREAS[tipo]}</span>` +
        `<span>${enLinea(tarea[2], ids)}</span>`;
    } else {
      html += `<li>${enLinea(texto, ids)}`;
    }
  }
  while (pila.length) html += `</li></${pila.pop().etiqueta}>`;
  return html;
}

// Devuelve una lista de bloques: cadenas HTML, salvo los títulos, que son objetos
// para poder agrupar después cada combinación con sus notas.
function bloques(lineas, ids, porLinea = new Map(), desplazamiento = 0) {
  const salida = [];
  let i = 0;
  const ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
  while (i < lineas.length) {
    const l = lineas[i];
    const valla = l.match(/^\s*(```|~~~)/);
    if (valla) {
      const codigo = [];
      for (i++; i < lineas.length && !lineas[i].trim().startsWith(valla[1]); i++) codigo.push(lineas[i]);
      i++;
      salida.push(`<pre><code>${escapar(codigo.join('\n'))}</code></pre>`);
      continue;
    }
    const titulo = l.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (titulo) {
      const n = titulo[1].length;
      const id = porLinea.get(i + desplazamiento);
      salida.push({ nivel: n, id, texto: titulo[2], contenido: enLinea(titulo[2], ids) });
      i++;
      continue;
    }
    if (EMBED_MATRIZ.test(l.trim())) {
      salida.push(MARCA_MATRIZ);
      i++;
      continue;
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) {
      salida.push('<hr>');
      i++;
      continue;
    }
    if (/^\s*>/.test(l)) {
      const cita = [];
      for (; i < lineas.length && /^\s*>/.test(lineas[i]); i++) cita.push(lineas[i].replace(/^\s*>\s?/, ''));
      salida.push(`<blockquote>${bloques(cita, ids).map(aHTML).join('\n')}</blockquote>`);
      continue;
    }
    if (ITEM.test(l)) {
      const items = [];
      for (; i < lineas.length; i++) {
        const item = lineas[i].match(ITEM);
        if (item) {
          items.push({ sangria: item[1].replace(/\t/g, '    ').length, etiqueta: /\d/.test(item[2]) ? 'ol' : 'ul', texto: item[3] });
        } else if (lineas[i].trim() && /^\s/.test(lineas[i]) && items.length) {
          items[items.length - 1].texto += '\n' + lineas[i].trim(); // continuación sangrada
        } else {
          break;
        }
      }
      salida.push(lista(items, ids).replace(/\n/g, '<br>'));
      continue;
    }
    if (!l.trim()) {
      i++;
      continue;
    }
    const parrafo = [];
    for (; i < lineas.length && lineas[i].trim() && !/^(#{1,6}\s|\s*>|\s*(```|~~~))/.test(lineas[i]) &&
      !ITEM.test(lineas[i]) && !EMBED_MATRIZ.test(lineas[i].trim()); i++) parrafo.push(lineas[i]);
    const clase = parrafo[0].startsWith(VER_TAMEN) ? ' class="ver-tamen"' : '';
    salida.push(`<p${clase}>${parrafo.map(p => enLinea(p.trim(), ids)).join('<br>')}</p>`);
  }
  return salida;
}

const aHTML = b => (typeof b === 'string' ? b : `<h${b.nivel}${b.id ? ` id="${b.id}"` : ''}>${b.contenido}</h${b.nivel}>`);
const esTitulo = (b, max = 6) => typeof b === 'object' && b.nivel <= max;

// Agrupa cada combinación (`####`) con sus notas en una sección marcada con su estado.
// Las combinaciones sin notas se juntan al final de su grupo (`###`), bajo "Sen notas",
// en una lista compacta de etiquetas.
function componer(lista, info) {
  const salida = [];
  let baleiras = [];
  const soltarBaleiras = () => {
    if (baleiras.length) salida.push(`<h4 class="sen-notas">Sen notas</h4>\n<ul class="baleiras">${baleiras.join('')}</ul>`);
    baleiras = [];
  };
  for (let i = 0; i < lista.length; i++) {
    const b = lista[i];
    if (!esTitulo(b) || b.nivel !== 4) {
      if (esTitulo(b, 3)) soltarBaleiras();
      salida.push(aHTML(b));
      continue;
    }
    const notas = [];
    while (i + 1 < lista.length && !esTitulo(lista[i + 1], 4)) notas.push(aHTML(lista[++i]));
    if (!notas.length) {
      baleiras.push(`<li id="${b.id}">${b.contenido}</li>`);
      continue;
    }
    const { estado = 'pendiente', total = 0 } = info(b.texto) || {};
    const cifra = total ? `<span class="total">${total} ${total === 1 ? 'nota' : 'notas'}</span>` : '';
    salida.push(`<section class="combinacion ${estado}"><h4 id="${b.id}">${b.contenido}${cifra}</h4>\n${notas.join('\n')}</section>`);
  }
  soltarBaleiras();
  return salida;
}

const ESTILO = `
*{box-sizing:border-box}
html{scroll-behavior:smooth;scroll-padding-top:24px}
body{margin:0;background:#fff;color:var(--texto);font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-text-size-adjust:100%}
main{max-width:720px;margin:0 auto;padding:32px 16px 96px}
a{color:inherit;text-decoration-color:var(--liña);text-underline-offset:3px}
a:hover{text-decoration-color:currentColor}
a:focus-visible,li:focus-visible{outline:2px solid var(--texto);outline-offset:2px;border-radius:2px}

h1{font-size:2.25rem;line-height:1.15;font-weight:700;letter-spacing:-.02em;margin:0 0 32px}
h2{font-size:1.75rem;line-height:1.2;font-weight:700;letter-spacing:-.01em;margin:64px 0 0;padding-top:24px;border-top:1px solid var(--liña)}
h3{font-size:.75rem;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--suave);margin:32px 0 12px}
h4{font-size:1rem;font-weight:600;margin:0 0 4px;display:flex;justify-content:space-between;align-items:baseline;gap:16px}
h5,h6{font-size:.9rem;margin:16px 0 4px}
p{margin:8px 0}

#indice{border:0;padding:0;margin:0 0 16px;font-size:.75rem;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--suave)}
#indice+ul{list-style:none;padding:0;margin:0 0 24px;display:flex;flex-wrap:wrap;gap:4px 16px;font-size:.95rem}
#indice+ul li{display:inline}
.matriz{overflow-x:auto;margin:0 -16px;padding:0 16px}
.matriz svg{display:block}
.matriz a rect{cursor:pointer}
.matriz a:hover rect,.matriz a:focus rect{stroke:var(--texto);stroke-width:1.5}

.ver-tamen{font-size:.875rem;color:var(--suave)}
.ver-tamen a{color:var(--texto)}

.combinacion{margin:12px 0;padding:8px 16px;border-left:3px solid var(--estado)}
.combinacion.pendiente{--estado:var(--pendiente)}
.combinacion.aceptada{--estado:var(--aceptada)}
.combinacion.descartada{--estado:var(--descartada)}
.combinacion.descartada h4{color:var(--suave)}
.total{flex:none;font-size:.75rem;font-weight:400;color:var(--suave)}
.combinacion:has(h4:target){background:var(--baleira)}

.sen-notas{font-size:.875rem;font-weight:600;color:var(--suave);margin:24px 0 8px}
.baleiras{list-style:none;padding:0;margin:0 0 12px;display:flex;flex-wrap:wrap;gap:4px}
.baleiras li{font-size:.75rem;line-height:1.5;padding:2px 8px;border-radius:3px;background:var(--baleira);color:var(--suave)}
.baleiras li:target{background:var(--texto);color:#fff}

ul,ol{padding-left:24px;margin:4px 0}
li{margin:2px 0}
li.tarea{list-style:none;margin-left:-24px;display:flex;gap:8px;align-items:flex-start}
.marca{flex:none;display:inline-grid;place-items:center;width:14px;height:14px;border-radius:2px;font-size:10px;line-height:1;color:#fff;margin-top:6px}
.tarea.pendiente .marca{background:var(--pendiente)}
.tarea.aceptada .marca{background:var(--aceptada)}
.tarea.descartada .marca{background:var(--descartada)}
.tarea.descartada>span:last-child{text-decoration:line-through;color:var(--suave)}

blockquote{margin:8px 0;padding:0 16px;border-left:2px solid var(--liña);color:var(--suave)}
pre{background:var(--baleira);border-radius:4px;padding:12px;overflow-x:auto}
code{font-size:.875em}
mark{background:color-mix(in srgb,var(--pendiente) 40%,transparent)}
.wikilink{border-bottom:1px dotted var(--suave)}

.subir{position:fixed;right:16px;bottom:16px;background:#fff;color:var(--texto);border:1px solid var(--liña);border-radius:4px;padding:6px 12px;font-size:.875rem;text-decoration:none}
.subir:hover{border-color:var(--texto)}
footer{color:var(--suave);font-size:.75rem;margin-top:64px}
`;

// `markdown`: el cuaderno regenerado. `matriz(enlace)`: devuelve el SVG, donde
// `enlace(titulo)` da el atributo href de cada casilla. `info(titulo)`: estado y número
// de notas de una combinación. `colores`: los colores de la matriz, por estado.
function generarHTML(markdown, matriz, { info = () => null, colores = {}, titulo = 'Florilexio Combinator' } = {}) {
  const cuerpo = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/, '').replace(/%%[\s\S]*?%%/g, '');
  const lineas = cuerpo.split(/\r?\n/);
  const { ids, porLinea } = asignarIds(lineas);
  const svg = matriz(t => {
    const id = ids.get(claveTitulo(t));
    return id ? `href="#${id}"` : null;
  }).trim();
  let html = componer(bloques(lineas, ids, porLinea), info).join('\n');
  html = html.includes(MARCA_MATRIZ)
    ? html.replace(MARCA_MATRIZ, `<div class="matriz" id="matriz">${svg}</div>`)
    : `<div class="matriz" id="matriz">${svg}</div>\n${html}`;
  html = html.split(MARCA_MATRIZ).join('');
  const color = (estado, porDefecto) => (colores[estado] && colores[estado].fondo) || porDefecto;
  const variables = `:root{--texto:#222;--suave:#6b6b6b;--liña:#e4e4e4;` +
    `--baleira:${color('vacia', '#f0f0f0')};--pendiente:${color('pendiente', '#f5c542')};` +
    `--aceptada:${color('aceptada', '#43a047')};--descartada:${color('descartada', '#9e9e9e')}}`;
  return `<!doctype html>
<html lang="gl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapar(titulo)}</title>
<style>${variables}${ESTILO}</style>
</head>
<body>
<main>
<h1>${escapar(titulo)}</h1>
${html}
<footer>Xerado por combinar.js a partir de combinacions.md.</footer>
</main>
<a class="subir" href="#matriz">↑ Matriz</a>
</body>
</html>
`;
}

module.exports = { generarHTML };
