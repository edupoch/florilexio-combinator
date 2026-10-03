# Combinator

Cuaderno de Obsidian para generar ideas de diseño combinando **mecánicas** entre sí
(`Cortar + Moverse`) y **operaciones** con mecánicas (`Non/Nunca · Cortar`).

El script `combinar.js` crea en `combinacions.md` una entrada por combinación y, cada
vez que se vuelve a ejecutar, añade las nuevas sin perder las notas que ya existen.

## Requisitos

- [Node.js](https://nodejs.org/) 18 o superior (probado con Node 22). No hay dependencias
  que instalar.

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run combinar` | Actualiza `combinacions.md`, `matriz.md` y `matriz.svg`. |
| `node combinar.js` | Lo mismo, sin pasar por npm. |
| `node combinar.js otro.md` | Actualiza otro cuaderno; la matriz se crea junto a él. |
| `npm run vigilar` | Se queda vigilando `combinacions.md` y regenera la matriz cada vez que se guarda. Ctrl+C para salir. |
| `node vigilar.js otro.md` | Lo mismo, con otro cuaderno. |
| `npm test` | Ejecuta los tests automáticos. |
| `node --test --test-reporter=spec` | Los tests, con un informe legible test a test. |

Al terminar, el script resume lo que ha hecho:

```
14 mecánicas, 17 operaciones → 91 pares + 238 operación·mecánica.
Combinaciones nuevas: 0. Huérfanas: 0.
Sin cambios.
```

Si algo está mal (por ejemplo, un nombre no válido), muestra el error y **no modifica
ningún fichero**.

## Flujo de trabajo

1. Edita las listas en el front matter de `combinacions.md`. Valen las dos formas, y
   también se pueden editar desde el panel de Propiedades de Obsidian:

   ```yaml
   ---
   mecanicas: Moverse, Cortar, Recoller
   operacions:
     - Non/Nunca
     - Máis
   ---
   ```

2. Ejecuta `npm run combinar`.
3. Abre `combinacions.md` en Obsidian y anota ideas bajo cada combinación.
4. Repite cuando cambien las listas. Ejecutarlo de más no hace daño: si no hay nada
   nuevo, no cambia nada.

Durante una sesión de trabajo puedes dejar `npm run vigilar` abierto en una terminal:
la matriz se actualiza sola mientras anotáis. El vigilante **solo regenera la matriz,
nunca el cuaderno** (para no pisar lo que se está escribiendo en Obsidian). Si cambias
las listas, ejecuta `npm run combinar` para crear las combinaciones nuevas.

## Estructura del cuaderno

Todo se ordena alfabéticamente, sin importar el orden de las listas:

```markdown
## Índice
- [[#Anotar|Anotar]]
- [[#Cortar|Cortar]]

![[matriz]]

## Cortar
Notas generales sobre Cortar.

### Combinacións
Ver tamén: [[#Anotar + Cortar|Anotar]]

#### Cortar + Moverse
- [+] Cortar el camino para poder moverse
- [ ] Moverse corta lo que toca
- [-] Cortar mientras te mueves

### Operacións

#### Non/Nunca · Cortar
```

- El **índice** del principio enlaza todas las mecánicas (y `Orfas`, si existe) y
  muestra la matriz. Se regenera solo; puedes añadir texto propio debajo.
- Cada **par** aparece una sola vez, bajo la mecánica que va antes alfabéticamente.
  En la otra, la línea **Ver tamén** enlaza con él.
- Se puede escribir texto libre en cualquier parte: antes del índice, bajo
  `## Índice`, bajo `## Mecánica`, bajo `### Combinacións` / `### Operacións` y bajo cada `####`.

### Marcar las notas

| Marca | Significado |
| --- | --- |
| `- [ ]` | Sin validar |
| `- [+]` | Aceptada (`[x]` también cuenta como aceptada) |
| `- [-]` | Descartada |

Una línea de lista sin marca (`- idea`) cuenta como sin validar.

### La matriz

La matriz muestra todas las combinaciones de un vistazo, coloreadas por estado:
vacía, pendiente, alguna aceptada o todo descartado. El número de cada casilla es su
cantidad de notas.

- En Obsidian está en la nota `matriz.md`, incrustada en el índice. **Al pulsar una
  casilla se salta a esa combinación**, y al pasar el ratón se ven sus notas.
- `matriz.svg` es la misma imagen sin enlaces, para verla fuera de Obsidian.

## Qué pasa con las notas al cambiar las listas

- **Reordenar** las listas o cambiar mayúsculas no mueve ni pierde nada.
- **Quitar** una mecánica u operación lleva sus notas a la sección `## Orfas`, al final.
  Las combinaciones vacías simplemente desaparecen.
- **Volver a añadirla** devuelve las notas de Orfas a su sitio automáticamente.
- **Renombrar** equivale a quitar y añadir: las notas van a Orfas y hay que moverlas a
  mano bajo el título nuevo (o devolver el nombre anterior).

Antes de sobrescribir el cuaderno, el script guarda la versión anterior en
`combinacions.md.bak` (Obsidian no lo muestra y git lo ignora).

## Reglas para no tener sorpresas

- **No edites el texto de los títulos** `##`, `###` ni `####`: el script reconoce cada
  combinación por su título. Si cambia, sus notas pasan a Orfas.
- **No uses `##`, `###` ni `####` dentro de las notas**: son la estructura del cuaderno.
  Para subtítulos propios usa `#####` o más. (Dentro de bloques de código no importa.)
- Bajo `## Índice`, las líneas con la forma `- [[#Algo]]` son del script y se
  regeneran. Para tus propios enlaces usa otra forma (por ejemplo, `- [[Otra nota]]`).
- Los nombres no pueden contener `+ · # | ^ [ ] :` ni llamarse `Índice`, `Orfas`,
  `Combinacións` u `Operacións`. El script avisa si ocurre.
- Dos nombres no pueden diferenciarse solo en signos de puntuación. Al resolver
  enlaces, Obsidian cambia por espacios ``! " # $ % & ( ) * + , . : ; < = > ? @ ^ ` { | } ~ / [ ] \``,
  así que para él `X <> Y` y `X = Y` son el mismo título y sus enlaces llevarían al mismo
  sitio. El script lo detecta y pide cambiar uno.
- Si varias personas editan a la vez, sincronizad (git, Obsidian Sync…) antes de
  ejecutar el script.

## Ficheros

| Fichero | Contenido |
| --- | --- |
| `combinar.js` | El script. |
| `vigilar.js` | Vigila el cuaderno y regenera la matriz al guardar. |
| `combinacions.md` | El cuaderno: listas en el front matter y notas del equipo. |
| `matriz.md` | Generado: la matriz con enlaces para Obsidian. No se edita a mano. |
| `matriz.svg` | Generado: la matriz como imagen. No se edita a mano. |
| `test/combinar.test.js` | Tests automáticos (`node:test`). |
| `docs/ideas/combinator.md` | Documento de diseño original. |
