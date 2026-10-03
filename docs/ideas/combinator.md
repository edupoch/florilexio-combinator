# Combinator

## Problem Statement
¿Cómo podríamos recorrer en equipo el espacio mecánica×mecánica y operación×mecánica
para generar ideas de diseño, sin perder notas cuando cambian las listas?

## Recommended Direction
Un script Node.js sin dependencias (`combinar.js`) que usa `combinacions.md` como
configuración (front matter) y como cuaderno de Obsidian. En cada ejecución lee las
listas, recoge las notas existentes por clave normalizada, regenera el cuerpo y
recoloca cada nota. Es idempotente: ejecutarlo dos veces no cambia nada.

Estructura, todo en orden alfabético (`localeCompare('gl')`): una `##` por mecánica
con dos grupos, `### Combinacións` (sus pares con las mecánicas que van después
alfabéticamente) y `### Operacións`, y cada combinación como `####`
(`Cortar + Moverse`, `Non · Cortar`). `### Combinacións` empieza con
"Ver tamén" y wikilinks a los pares que viven en otras secciones. Las notas se
marcan línea a línea con `[ ]` (sin validar), `[+]` (aceptada) y `[-]` (descartada).
El script las copia tal cual y solo las cuenta. Lo que ya no encaja va a `## Orfas`.

Aparte genera `matriz.svg` (mecánica×operación y mecánica×mecánica), con celdas
coloreadas según su estado (vacía / pendiente / alguna aceptada / todo descartado),
incrustada al principio del .md con `![[matriz.svg]]`.

## Key Assumptions to Validate
- [ ] 329 entradas son navegables con el esquema y el plegado de Obsidian: probar con las listas reales
- [ ] El equipo respeta el texto de los títulos `###`: contar las huérfanas tras la primera sesión
- [ ] Ningún nombre contiene `+ · # | ^ [ ] :`: el script lo valida y aborta con un mensaje claro
- [ ] La matriz SVG se lee bien en Obsidian con 17 operaciones en el eje: generarla y mirarla

## MVP Scope
Dentro: front matter (texto con comas o lista YAML), pares con clave independiente del
orden, op×mecánica, orden alfabético, "Ver tamén" con wikilinks, fusión de notas
literal, conteo de [ ]/[+]/[-] (con [x] = [+]), Orfas, matriz.svg, idempotencia.
Fuera: lo que sigue.

## Not Doing (and Why)
- Tríos: 364 entradas que nadie va a anotar
- Operaciones binarias con pares: se tratan como unarias; quien anota imagina la Y
- Valorar combinaciones enteras: la valoración vive en cada nota
- Reescribir o normalizar notas: el script nunca toca lo que escribe el equipo
- Duplicar pares en ambas mecánicas: rompería la fusión; se usa "Ver tamén"
- PNG: requeriría dependencias; SVG basta y Obsidian lo muestra
- Detectar renombrados: Orfas + recolocar a mano es más simple
- Edición concurrente: eso es cosa de git o del sync de Obsidian

## Open Questions
- ~~¿Se conserva el texto libre escrito antes de la primera sección?~~ Sí, tal cual.
