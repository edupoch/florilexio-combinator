'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const { procesar, contar, estado, claveDeTitulo } = require('../combinar.js');

const SCRIPT = path.join(__dirname, '..', 'combinar.js');

// --- Utilidades ---------------------------------------------------------------

function cuaderno(mecanicas, operacions, cuerpo = '') {
  return `---\nmecanicas: ${mecanicas.join(', ')}\noperacions: ${operacions.join(', ')}\n---\n${cuerpo}`;
}

const ejecutar = texto => procesar(texto).markdown;

// Sustituye las listas del front matter de un cuaderno ya generado.
function cambiarListas(md, mecanicas, operacions) {
  return md.replace(/^---\n[\s\S]*?\n---\n/, `---\nmecanicas: ${mecanicas.join(', ')}\noperacions: ${operacions.join(', ')}\n---\n`);
}

// Escribe notas debajo de un título `###` existente.
function anotar(md, titulo, ...lineas) {
  const cabecera = `### ${titulo}\n`;
  assert.ok(md.includes(cabecera), `no existe el título "${titulo}"`);
  return md.replace(cabecera, cabecera + lineas.join('\n') + '\n');
}

// Devuelve las líneas que hay entre `### titulo` (o `## titulo`) y el siguiente título.
function notasDe(md, titulo, nivel = '###') {
  const lineas = md.split('\n');
  const inicio = lineas.indexOf(`${nivel} ${titulo}`);
  if (inicio < 0) return null;
  const resto = [];
  let enCodigo = false;
  for (const l of lineas.slice(inicio + 1)) {
    if (/^\s*(```|~~~)/.test(l)) enCodigo = !enCodigo;
    if (!enCodigo && /^#{2,3}\s/.test(l)) break;
    resto.push(l);
  }
  while (resto.length && !resto[resto.length - 1].trim()) resto.pop();
  return resto;
}

const titulos = md => md.split('\n').filter(l => /^#{2,3}\s/.test(l));

// Generador pseudoaleatorio con semilla, para que los fallos sean reproducibles.
function aleatorio(semilla) {
  let s = semilla >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MECS = ['Moverse', 'Cortar', 'Recoller', 'Falar'];
const OPS = ['Non/Nunca', 'Máis', 'X <> Y'];

// --- Generación ---------------------------------------------------------------

test('genera todos los pares y todas las combinaciones operación · mecánica', () => {
  const md = ejecutar(cuaderno(MECS, OPS));
  const h3 = titulos(md).filter(t => t.startsWith('### '));
  assert.equal(h3.length, 6 + 4 * 3);
  assert.equal(new Set(h3).size, h3.length, 'no hay títulos duplicados');
  assert.ok(md.includes('### Cortar + Moverse\n'));
  assert.ok(md.includes('### X <> Y · Falar\n'));
});

test('ordena mecánicas, pares y operaciones alfabéticamente', () => {
  const md = ejecutar(cuaderno(MECS, OPS));
  const h2 = titulos(md).filter(t => t.startsWith('## '));
  assert.deepEqual(h2, ['## Cortar', '## Falar', '## Moverse', '## Recoller']);
  assert.deepEqual(notasDe(md, 'Cortar', '##'), []);
  const cortar = titulos(md).slice(1, 1 + 3 + 3);
  assert.deepEqual(cortar, [
    '### Cortar + Falar', '### Cortar + Moverse', '### Cortar + Recoller',
    '### Máis · Cortar', '### Non/Nunca · Cortar', '### X <> Y · Cortar',
  ]);
});

test('cada sección enlaza con wikilinks a sus pares que viven en otras secciones', () => {
  const md = ejecutar(cuaderno(MECS, OPS));
  assert.ok(md.includes('## Moverse\nVer tamén: [[#Cortar + Moverse|Cortar]] · [[#Falar + Moverse|Falar]]\n'));
  assert.ok(md.includes('## Cortar\n\n'), 'la primera sección no tiene "Ver tamén"');
});

test('incrusta la matriz al principio del cuerpo', () => {
  const md = ejecutar(cuaderno(MECS, OPS));
  assert.match(md, /^---\n[\s\S]*?\n---\n\n!\[\[matriz\.svg\]\]\n\n## /);
});

test('conserva intacto el resto del front matter', () => {
  const texto = '---\ntags: [xogo]\nmecanicas: Cortar, Moverse\n# comentario\noperacions: Non\n---\n';
  assert.ok(ejecutar(texto).startsWith(texto));
});

test('es idempotente', () => {
  const primera = ejecutar(cuaderno(MECS, OPS));
  const conNotas = anotar(primera, 'Cortar + Moverse', '- [+] idea');
  assert.equal(ejecutar(conNotas), conNotas);
  assert.equal(ejecutar(ejecutar(conNotas)), conNotas);
});

// --- Conservación de notas ----------------------------------------------------

test('copia las notas literalmente, con sublistas, espacios y líneas en blanco', () => {
  const lineas = [
    '- [+] aceptada',
    '- [ ] pendiente',
    '  - subidea con  dos espacios ',
    '',
    'Un párrafo libre.',
    '\t- tabulada',
    '#### un subtítulo propio',
    '- [-] descartada',
  ];
  let md = anotar(ejecutar(cuaderno(MECS, OPS)), 'Non/Nunca · Cortar', ...lineas);
  md = ejecutar(md);
  assert.deepEqual(notasDe(md, 'Non/Nunca · Cortar'), lineas);
});

test('los títulos dentro de bloques de código no se interpretan', () => {
  const lineas = ['```', '## no es una sección', '### ni una combinación', '```', '~~~', '## tampoco', '~~~'];
  let md = anotar(ejecutar(cuaderno(MECS, OPS)), 'Cortar + Falar', ...lineas);
  md = ejecutar(md);
  assert.deepEqual(notasDe(md, 'Cortar + Falar'), lineas);
  assert.ok(!md.includes('## Orfas'));
});

test('conserva el texto libre antes de la primera sección', () => {
  let md = ejecutar(cuaderno(MECS, OPS));
  md = md.replace('![[matriz.svg]]', '# Sesión do luns\n\nAsistentes: todo o equipo.\n\n![[matriz.svg]]');
  md = ejecutar(md);
  assert.ok(md.includes('---\n\n# Sesión do luns\n\nAsistentes: todo o equipo.\n\n![[matriz.svg]]\n\n## Cortar'));
  assert.equal(md.split('![[matriz.svg]]').length, 2, 'la matriz no se duplica');
});

test('conserva las notas generales de una mecánica sin duplicar "Ver tamén"', () => {
  let md = ejecutar(cuaderno(MECS, OPS));
  md = md.replace('## Moverse\nVer tamén: [[#Cortar + Moverse|Cortar]] · [[#Falar + Moverse|Falar]]\n',
    '## Moverse\nVer tamén: [[#Cortar + Moverse|Cortar]] · [[#Falar + Moverse|Falar]]\nMoverse é a base de todo.\n');
  md = ejecutar(md);
  md = ejecutar(md);
  assert.deepEqual(notasDe(md, 'Moverse', '##'), [
    'Ver tamén: [[#Cortar + Moverse|Cortar]] · [[#Falar + Moverse|Falar]]',
    '',
    'Moverse é a base de todo.',
  ]);
});

test('no borra líneas de nota que se parecen a las generadas', () => {
  const lineas = ['Ver tamén: o documento de deseño', '![[matriz.svg]]'];
  let md = anotar(ejecutar(cuaderno(MECS, OPS)), 'Máis · Falar', ...lineas);
  md = ejecutar(md);
  assert.deepEqual(notasDe(md, 'Máis · Falar'), lineas);
});

test('reordenar las listas no mueve ni pierde notas', () => {
  let md = ejecutar(cuaderno(MECS, OPS));
  md = anotar(md, 'Cortar + Moverse', '- [ ] par');
  md = anotar(md, 'Máis · Recoller', '- [ ] op');
  md = ejecutar(cambiarListas(md, [...MECS].reverse(), [...OPS].reverse()));
  assert.deepEqual(notasDe(md, 'Cortar + Moverse'), ['- [ ] par']);
  assert.deepEqual(notasDe(md, 'Máis · Recoller'), ['- [ ] op']);
  assert.ok(!md.includes('## Orfas'));
});

test('un par escrito en orden inverso se reconoce como el mismo par', () => {
  let md = ejecutar(cuaderno(MECS, OPS));
  md += '\n### Moverse + Cortar\n- [ ] escrito al revés\n';
  md = ejecutar(md);
  assert.deepEqual(notasDe(md, 'Cortar + Moverse'), ['- [ ] escrito al revés']);
  assert.ok(!md.includes('### Moverse + Cortar'));
});

test('ignora mayúsculas y espacios de más al emparejar notas', () => {
  let md = ejecutar(cuaderno(MECS, OPS));
  md = anotar(md, 'Cortar + Moverse', '- [ ] nota');
  md = ejecutar(cambiarListas(md, ['moverse', '  CORTAR ', 'Recoller', 'Falar'], OPS));
  assert.deepEqual(notasDe(md, 'CORTAR + moverse'), ['- [ ] nota']);
});

test('las notas de una mecánica eliminada van a Orfas y vuelven al restaurarla', () => {
  let md = ejecutar(cuaderno(MECS, OPS));
  md = anotar(md, 'Cortar + Moverse', '- [+] par');
  md = anotar(md, 'Non/Nunca · Cortar', '- [-] op');
  md = md.replace('## Cortar\n', '## Cortar\nGeneral de cortar.\n');

  const sinCortar = ejecutar(cambiarListas(md, ['Moverse', 'Recoller', 'Falar'], OPS));
  assert.ok(!titulos(sinCortar).includes('## Cortar'));
  const orfas = sinCortar.slice(sinCortar.indexOf('## Orfas'));
  assert.deepEqual(notasDe(orfas, 'Cortar + Moverse'), ['- [+] par']);
  assert.deepEqual(notasDe(orfas, 'Non/Nunca · Cortar'), ['- [-] op']);
  assert.deepEqual(notasDe(orfas, 'Cortar'), ['General de cortar.']);
  assert.equal(procesar(sinCortar).orfas, 3);
  assert.equal(ejecutar(sinCortar), sinCortar, 'Orfas también es estable');

  const restaurado = ejecutar(cambiarListas(sinCortar, MECS, OPS));
  assert.ok(!restaurado.includes('## Orfas'));
  assert.equal(restaurado, ejecutar(md));
});

test('las notas de una operación eliminada van a Orfas', () => {
  let md = anotar(ejecutar(cuaderno(MECS, OPS)), 'X <> Y · Falar', '- [ ] distinto');
  md = ejecutar(cambiarListas(md, MECS, ['Non/Nunca', 'Máis']));
  assert.deepEqual(notasDe(md.slice(md.indexOf('## Orfas')), 'X <> Y · Falar'), ['- [ ] distinto']);
});

test('las combinaciones vacías eliminadas desaparecen sin dejar huérfanas', () => {
  const md = ejecutar(cambiarListas(ejecutar(cuaderno(MECS, OPS)), ['Cortar', 'Moverse'], ['Máis']));
  assert.ok(!md.includes('## Orfas'));
  assert.equal(titulos(md).length, 2 + 1 + 2);
});

test('un título editado a mano lleva sus notas a Orfas', () => {
  let md = anotar(ejecutar(cuaderno(MECS, OPS)), 'Máis · Falar', '- [ ] idea');
  md = ejecutar(md.replace('### Máis · Falar', '### Máis · Falar moito'));
  assert.ok(md.includes('### Máis · Falar\n'), 'la combinación se regenera vacía');
  assert.deepEqual(notasDe(md.slice(md.indexOf('## Orfas')), 'Máis · Falar moito'), ['- [ ] idea']);
});

test('una sección `##` inventada se conserva en Orfas', () => {
  let md = ejecutar(cuaderno(MECS, OPS));
  md = md.replace('## Cortar\n', '## Ideas sueltas\nAlgo que no encaja.\n\n## Cortar\n');
  md = ejecutar(md);
  assert.deepEqual(notasDe(md.slice(md.indexOf('## Orfas')), 'Ideas sueltas'), ['Algo que no encaja.']);
});

test('fusiona las notas de un título repetido', () => {
  let md = anotar(ejecutar(cuaderno(MECS, OPS)), 'Máis · Falar', '- [ ] primera');
  md += '\n### Máis · Falar\n- [ ] segunda\n';
  md = ejecutar(md);
  assert.deepEqual(notasDe(md, 'Máis · Falar'), ['- [ ] primera', '', '- [ ] segunda']);
  assert.equal(titulos(md).filter(t => t === '### Máis · Falar').length, 1);
});

test('al restaurar, fusiona las notas de Orfas con las nuevas de la misma combinación', () => {
  let md = anotar(ejecutar(cuaderno(MECS, OPS)), 'Cortar + Falar', '- [ ] antigua');
  md = ejecutar(cambiarListas(md, ['Cortar', 'Moverse'], OPS));
  md += '\n### Falar + Cortar\n- [ ] nueva\n';
  md = ejecutar(cambiarListas(md, MECS, OPS));
  const notas = notasDe(md, 'Cortar + Falar');
  assert.ok(notas.includes('- [ ] antigua') && notas.includes('- [ ] nueva'));
  assert.ok(!md.includes('## Orfas'));
});

test('el texto escrito directamente bajo `## Orfas` se conserva', () => {
  let md = anotar(ejecutar(cuaderno(MECS, OPS)), 'Máis · Falar', '- [ ] x');
  md = ejecutar(cambiarListas(md, MECS, ['Non/Nunca']));
  md = md.replace('## Orfas\n', '## Orfas\nRevisar estas el viernes.\n');
  md = ejecutar(md);
  assert.deepEqual(notasDe(md, 'Orfas', '##').slice(0, 1), ['Revisar estas el viernes.']);
});

test('acepta saltos de línea de Windows sin perder notas', () => {
  let md = anotar(ejecutar(cuaderno(MECS, OPS)), 'Máis · Falar', '- [+] crlf');
  md = ejecutar(md.replace(/\n/g, '\r\n'));
  assert.deepEqual(notasDe(md, 'Máis · Falar'), ['- [+] crlf']);
});

// --- Propiedad general: ninguna línea de nota se pierde ----------------------

test('ninguna línea de nota se pierde ante cambios aleatorios de las listas', () => {
  const POOL_M = ['Moverse', 'Cortar', 'Recoller', 'Falar', 'Saltar', 'Gardar no inventario', 'Dar obxecto', 'Ánade'];
  const POOL_O = ['Non/Nunca', 'Máis', 'Menos', 'Ao revés', 'X = Y', 'X <> Y', 'Se X entón Y'];

  for (let semilla = 1; semilla <= 60; semilla++) {
    const azar = aleatorio(semilla);
    const elegir = lista => lista.filter(() => azar() < 0.6).sort(() => azar() - 0.5);
    const listas = () => {
      const m = elegir(POOL_M);
      const o = elegir(POOL_O);
      return [m.length ? m : ['Moverse'], o.length ? o : ['Máis']];
    };

    let [m, o] = listas();
    let md = ejecutar(cuaderno(m, o));
    const escritas = [];
    for (let ronda = 0; ronda < 4; ronda++) {
      const h3 = titulos(md).filter(t => t.startsWith('### '));
      for (let i = 0; i < 3; i++) {
        const titulo = h3[Math.floor(azar() * h3.length)].slice(4);
        const nota = `- [${' +-x'[Math.floor(azar() * 4)]}] s${semilla}r${ronda}n${i}`;
        md = anotar(md, titulo, nota);
        escritas.push(nota);
      }
      [m, o] = listas();
      md = ejecutar(cambiarListas(md, m, o));
      for (const nota of escritas) {
        assert.equal(md.split('\n').filter(l => l === nota).length, 1, `semilla ${semilla}: "${nota}"`);
      }
      assert.equal(ejecutar(md), md, `semilla ${semilla}: no es idempotente`);
    }

    // Con todas las mecánicas y operaciones de vuelta, no queda nada huérfano.
    md = ejecutar(cambiarListas(md, POOL_M, POOL_O));
    assert.ok(!md.includes('## Orfas'), `semilla ${semilla}: quedan huérfanas`);
    for (const nota of escritas) assert.ok(md.includes(nota + '\n'));
  }
});

// --- Front matter y validación -----------------------------------------------

test('acepta listas YAML, listas entre corchetes y valores entre comillas', () => {
  const yaml = '---\nmecanicas:\n  - Cortar\n  - "Moverse"\n\n  - Falar\noperacions: [Non, \'Máis\']\n---\n';
  const { mecanicas, operaciones } = procesar(yaml);
  assert.deepEqual(mecanicas, ['Cortar', 'Falar', 'Moverse']);
  assert.deepEqual(operaciones, ['Máis', 'Non']);
});

test('acepta las claves con tilde', () => {
  const { mecanicas, operaciones } = procesar('---\nmecánicas: Cortar\noperacións: Non\n---\n');
  assert.deepEqual([mecanicas, operaciones], [['Cortar'], ['Non']]);
});

test('elimina nombres repetidos', () => {
  const { mecanicas } = procesar(cuaderno(['Cortar', 'cortar', 'Moverse'], ['Non']));
  assert.deepEqual(mecanicas, ['Cortar', 'Moverse']);
});

test('rechaza nombres que romperían títulos o enlaces', () => {
  for (const nombre of ['A+B', 'A · B', 'A#', 'A|B', 'A^', '[A]', 'A: B']) {
    assert.throws(() => procesar(cuaderno([nombre, 'Cortar'], ['Non'])), /no válidos/, nombre);
  }
  assert.throws(() => procesar(cuaderno(['Orfas', 'Cortar'], ['Non'])), /reservado/);
});

test('rechaza un fichero sin front matter o sin listas', () => {
  assert.throws(() => procesar('## Cortar\n'), /front matter/);
  assert.throws(() => procesar('---\nmecanicas: Cortar\n---\n'), /operacions/);
});

// --- Conteo y estado ----------------------------------------------------------

test('cuenta las marcas de las notas, con [x] como aceptada', () => {
  const c = contar(['- [+] a', '- [x] b', '- [X] c', '- [-] d', '- [ ] e', '- sin marca', '  - subitem', 'texto']);
  assert.deepEqual(c, { aceptadas: 3, pendientes: 2, descartadas: 1, texto: true });
});

test('calcula el estado de una combinación', () => {
  assert.equal(estado(contar([])), 'vacia');
  assert.equal(estado(contar(['texto libre'])), 'pendiente');
  assert.equal(estado(contar(['- [ ] a', '- [-] b'])), 'pendiente');
  assert.equal(estado(contar(['- [-] a', '- [-] b'])), 'descartada');
  assert.equal(estado(contar(['- [-] a', '- [+] b'])), 'aceptada');
});

test('reconoce el tipo de cada título', () => {
  assert.equal(claveDeTitulo('Moverse + Cortar'), claveDeTitulo('cortar + MOVERSE'));
  assert.equal(claveDeTitulo('Non · Cortar'), 'o:non|cortar');
  assert.equal(claveDeTitulo('Cortar'), 's:cortar');
});

// --- Matriz SVG ---------------------------------------------------------------

test('la matriz tiene una celda por combinación con su estado', () => {
  let md = ejecutar(cuaderno(MECS, OPS));
  md = anotar(md, 'Cortar + Moverse', '- [+] a', '- [ ] b');
  md = anotar(md, 'X <> Y · Falar', '- [-] c');
  const { svg } = procesar(md);
  assert.match(svg, /^<svg [^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.ok(svg.trimEnd().endsWith('</svg>'));
  assert.equal((svg.match(/<title>/g) || []).length, 6 + 4 * 3);
  assert.ok(svg.includes('<title>Cortar + Moverse: 1 aceptadas, 1 pendentes, 0 descartadas</title>'));
  assert.ok(svg.includes('<title>X &lt;&gt; Y · Falar: 0 aceptadas, 0 pendentes, 1 descartadas</title>'));
  assert.ok(!/<[^>/!a-z]/.test(svg.replace(/<\/?[a-z]/g, '')), 'no hay "<" sin escapar');
});

// --- Línea de comandos --------------------------------------------------------

test('la línea de comandos escribe el cuaderno, la matriz y una copia de seguridad', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'combinator-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const ruta = path.join(dir, 'combinacions.md');
  const original = cuaderno(MECS, OPS);
  fs.writeFileSync(ruta, original);

  const salida = execFileSync('node', [SCRIPT], { cwd: dir, encoding: 'utf8' });
  assert.match(salida, /Combinaciones nuevas: 18/);
  assert.equal(fs.readFileSync(ruta + '.bak', 'utf8'), original);
  assert.ok(fs.existsSync(path.join(dir, 'matriz.svg')));
  assert.ok(!fs.existsSync(ruta + '.tmp'));

  fs.rmSync(ruta + '.bak');
  assert.match(execFileSync('node', [SCRIPT, ruta], { encoding: 'utf8' }), /Sin cambios/);
  assert.ok(!fs.existsSync(ruta + '.bak'), 'sin cambios no hay copia');
});

test('la línea de comandos no toca el fichero si hay un error', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'combinator-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const ruta = path.join(dir, 'malo.md');
  const original = cuaderno(['A+B'], ['Non'], '\n### nota\n- [+] importante\n');
  fs.writeFileSync(ruta, original);

  const r = spawnSync('node', [SCRIPT, ruta], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /no válidos/);
  assert.equal(fs.readFileSync(ruta, 'utf8'), original);
  assert.deepEqual(fs.readdirSync(dir), ['malo.md']);
});
