// Convierte el cuaderno (ya regenerado por combinar.js) en una página HTML autónoma:
// la matriz arriba, con cada casilla enlazando con su sección, y debajo todas las notas.
//
// Solo entiende el Markdown que se usa en el cuaderno: títulos, listas (con tareas
// `[ ]`, `[+]`, `[x]`, `[-]`), citas, bloques de código, párrafos y formato en línea
// (negrita, cursiva, tachado, resaltado, código, enlaces y wikilinks).
'use strict';

const EMBED_MATRIZ = /^!\[\[matriz(\.md|\.svg)?\]\]$/;
const MARCA_MATRIZ = '\u0000MATRIZ\u0000';

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
      salida.push(`<h${n}${id ? ` id="${id}"` : ''}>${enLinea(titulo[2], ids)}</h${n}>`);
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
      salida.push(`<blockquote>${bloques(cita, ids).join('\n')}</blockquote>`);
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
    salida.push(`<p>${parrafo.map(p => enLinea(p.trim(), ids)).join('<br>')}</p>`);
  }
  return salida;
}

const ESTILO = `
:root{--fondo:#fafaf7;--texto:#222;--suave:#777;--borde:#e2e2dc;--tarjeta:#fff;--acento:#2e7d32;--marca:#fff3c4;--pendiente:#f5c542;--aceptada:#43a047;--descartada:#9e9e9e}
@media (prefers-color-scheme:dark){:root{--fondo:#1b1b1a;--texto:#e6e6e3;--suave:#9a9a95;--borde:#3a3a37;--tarjeta:#242423;--acento:#7cc47f;--marca:#5a4b12}}
*{box-sizing:border-box}
html{scroll-behavior:smooth;scroll-padding-top:16px}
body{margin:0;background:var(--fondo);color:var(--texto);font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:860px;margin:0 auto;padding:24px 16px 96px}
h2{font-size:1.45rem;margin:2.2em 0 .4em;padding-bottom:.2em;border-bottom:2px solid var(--borde)}
h3{font-size:1.1rem;margin:1.6em 0 .3em;color:var(--suave);text-transform:uppercase;letter-spacing:.04em}
h4{font-size:1.05rem;margin:1.2em 0 .2em}
h4+h4,h4+h3,h4+h2{margin-top:.2em}
h4:has(+h4),h4:has(+h3),h4:has(+h2){color:var(--suave);font-weight:500}
:target{background:var(--marca);border-radius:4px;box-shadow:0 0 0 6px var(--marca);color:inherit!important}
a{color:var(--acento)}
.matriz{overflow-x:auto;margin:16px -16px;padding:0 16px;-webkit-overflow-scrolling:touch}
.matriz svg{display:block;border:1px solid var(--borde);border-radius:8px}
.matriz a rect{cursor:pointer;transition:opacity .1s}
.matriz a:hover rect{opacity:.7}
ul,ol{padding-left:1.4em;margin:.3em 0}
li.tarea{list-style:none;margin-left:-1.4em;display:flex;gap:.5em;align-items:baseline}
.marca{flex:none;display:inline-grid;place-items:center;width:1.05em;height:1.05em;border-radius:3px;font-size:.8em;color:#fff;transform:translateY(.12em)}
.pendiente .marca{border:2px solid var(--pendiente)}
.aceptada .marca{background:var(--aceptada)}
.descartada .marca{background:var(--descartada)}
.descartada>span:last-child{text-decoration:line-through;color:var(--suave)}
blockquote{margin:.5em 0;padding:.1em 1em;border-left:3px solid var(--borde);color:var(--suave)}
pre{background:var(--tarjeta);border:1px solid var(--borde);border-radius:6px;padding:10px;overflow-x:auto}
code{font-size:.9em}
.wikilink{border-bottom:1px dotted var(--suave)}
.subir{position:fixed;right:16px;bottom:16px;background:var(--tarjeta);color:var(--texto);border:1px solid var(--borde);border-radius:999px;padding:8px 14px;text-decoration:none;box-shadow:0 2px 8px rgba(0,0,0,.15);font-size:.9rem}
footer{color:var(--suave);font-size:.85rem;margin-top:4em}
`;

// `markdown`: el cuaderno regenerado. `matriz(enlace)`: devuelve el SVG, donde
// `enlace(titulo)` da el atributo href de cada casilla.
function generarHTML(markdown, matriz, titulo = 'Florilexio Combinator') {
  const cuerpo = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/, '').replace(/%%[\s\S]*?%%/g, '');
  const lineas = cuerpo.split(/\r?\n/);
  const { ids, porLinea } = asignarIds(lineas);
  const svg = matriz(t => {
    const id = ids.get(claveTitulo(t));
    return id ? `href="#${id}"` : null;
  }).trim();
  let html = bloques(lineas, ids, porLinea).join('\n');
  html = html.includes(MARCA_MATRIZ)
    ? html.replace(MARCA_MATRIZ, `<div class="matriz" id="matriz">${svg}</div>`)
    : `<div class="matriz" id="matriz">${svg}</div>\n${html}`;
  html = html.split(MARCA_MATRIZ).join('');
  return `<!doctype html>
<html lang="gl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapar(titulo)}</title>
<style>${ESTILO}</style>
</head>
<body>
<main>
${html}
<footer>Xerado por combinar.js. Non editar: os cambios fanse en combinacions.md.</footer>
</main>
<a class="subir" href="#matriz">↑ Matriz</a>
</body>
</html>
`;
}

module.exports = { generarHTML };
