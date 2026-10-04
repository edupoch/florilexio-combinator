#!/usr/bin/env node
// Vigila el cuaderno y regenera `matriz.md`, `matriz.svg` y `matriz.html` cada vez que se guarda.
// No modifica el cuaderno: para crear combinaciones nuevas, usa `npm run combinar`.
//
// Uso: node vigilar.js [fichero.md]   (por defecto: combinacions.md). Ctrl+C para salir.
'use strict';

const fs = require('fs');
const path = require('path');
const { actualizarMatrices } = require('./combinar.js');

const ESPERA_MS = 200; // agrupa los varios eventos que produce un mismo guardado

const ruta = path.resolve(process.argv[2] || 'combinacions.md');
const nombre = path.basename(ruta);
const hora = () => new Date().toLocaleTimeString('es-ES');

function actualizar() {
  try {
    const cambiados = actualizarMatrices(ruta);
    if (cambiados.length) console.log(`[${hora()}] Actualizado: ${cambiados.join(', ')}.`);
  } catch (e) {
    // Algunos editores borran y recrean el fichero al guardar: llegará otro evento.
    if (e.code === 'ENOENT') return;
    console.error(`[${hora()}] Error: ${e.message}`);
  }
}

if (!fs.existsSync(ruta)) {
  console.error(`Error: no existe ${ruta}`);
  process.exit(1);
}

// Se vigila la carpeta y no el fichero, para no perder el rastro si se reemplaza al guardar.
let temporizador = null;
fs.watch(path.dirname(ruta), (evento, fichero) => {
  if (fichero && fichero !== nombre) return;
  clearTimeout(temporizador);
  temporizador = setTimeout(actualizar, ESPERA_MS);
});

console.log(`Vigilando ${nombre}… (Ctrl+C para salir)`);
actualizar();
