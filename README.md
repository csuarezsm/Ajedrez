# Ajedrez

Ajedrez para Android: contra la máquina, dos jugadores en el mismo móvil y problemas de mate.
App Capacitor + web (`www/`). Todos los datos se guardan en el móvil; solo el juego en línea usa el servidor de juegos (nombre y jugadas, sin guardarlos).
Paquete: `com.itcanarias.ajedrez` · versión 1.0.10

© 2026 IT Canarias. Todos los derechos reservados.

## Qué hace

- **Contra la máquina**: seis niveles (principiante, aficionado, intermedio, avanzado, experto y club), con blancas, negras o al azar. Deshacer, tablas (la máquina las acepta si su posición no es mejor) y rendirse.
- **Modo aprendizaje**: botón de pista y aviso cuando una jugada pierde 1,5 peones o más. Se puede deshacer o seguir: las jugadas legales se permiten siempre.
- **Dos jugadores** en el mismo móvil, con opción de girar el tablero en cada turno.
- **Reloj** opcional: 3+2, 5+0, 10+5, 15+10 o personalizado. Se para si sales de la app. Si se acaba el tiempo y el rival no puede dar mate, son tablas.
- **Análisis**: al terminar, el motor evalúa cada posición y marca ★ mejor, ?! imprecisión (≥ 0,6), ? error (≥ 1,3) y ?? error grave (≥ 3 peones). Enseña la mejor jugada en el tablero, la barra de evaluación y la precisión de cada jugador.
- **Problemas**: 170 problemas de mate (50 en 1, 70 en 2 y 50 en 3), ordenados de fácil a difícil. La máquina defiende lo mejor posible; se acepta cualquier jugada que mantenga el mate. Pistas y solución.
- **Problema del día** (el mismo para todos ese día) y **Elo de problemas**: cada problema tiene una dificultad aproximada y solo cuenta el primer intento. «Siguiente a tu nivel» elige el más cercano a tu Elo.
- **Editor de posiciones**: poner y quitar piezas, turno y enroques, copiar o pegar FEN, analizar la posición y jugar desde ella. Se abre desde el menú o desde el análisis («✏️ Editar»).
- **Jugar en línea** con el servidor común de juegos de IT Canarias (`wss://juegos.itcanarias.com/ws`, repo `csuarezsm/juegos-servidor`, el mismo que Chinchón): salas con código para compartir por WhatsApp, ficha propia para volver a la silla, partida validada por el servidor, reloj en el servidor, tablas y revancha. Salir en juego cuenta como abandono. Cuenta para el Elo. La dirección está en `ONLINE_URL` (`www/juego.js`).
- **Repasa tus errores**: con los errores (?) y errores graves (??) de las partidas analizadas se forman ejercicios: la posición antes del error y hay que encontrar algo mejor. Se acepta la jugada del motor o cualquier otra que no pierda más de 0,7 peones respecto a ella. Contra la máquina solo salen tus errores; en partidas de dos jugadores, los de los dos. Botón para analizar de golpe hasta 5 partidas sin analizar.
- **Jugar desde aquí**: desde cualquier jugada del análisis, desde un problema o desde un error repasado se empieza una partida nueva desde esa posición, contra la máquina o a dos jugadores. Estas partidas no cuentan para el Elo.
- **Clasificación**: Elo (inicial 1200, K = 40 las 10 primeras partidas y después 24). La máquina tiene un Elo fijo por nivel. Ficha de jugador, récords e historial con revisión jugada a jugada.
- **PGN**: exportar una partida o todas, e importar archivos PGN (con comentarios y variantes). Las importadas no cuentan para el Elo.
- **Aperturas**: nombre de la apertura bajo las jugadas (lista propia en `www/aperturas.js`, unas 140 líneas).
- **Sonidos** al mover, capturar, enrocar, dar jaque y al terminar. Se sintetizan en la app (sin archivos de audio) y se pueden quitar en ⋮ → Colores, tablero y sonido.
- **Botón atrás de Android**: cierra la ventana abierta, vuelve de la revisión o del problema, vuelve a la partida actual si estabas viendo una jugada anterior, y en una partida a medias pregunta si guardarla o descartarla. En la pantalla de inicio deja la app en segundo plano.
- **Igual que la plantilla**: temas de colores, colores del tablero, coordenadas, tamaño de letra, horizontal y tablet, márgenes de Android, bienvenida, Acerca de con privacidad y donativo (no en Play), compartir la app, copias automáticas, enviar partidas al grupo y borrar datos.

## Archivos (`www/`)

| Archivo | Qué contiene |
|---|---|
| `ajedrez.js` | Reglas: tablero 0x88, jugadas legales, FEN, SAN, PGN, tablas. La partida es una lista de jugadas UCI (`e2e4`, `e7e8q`) y el estado se calcula a partir de ella. Funciona en la app, en el Web Worker, en Node y, más adelante, en el servidor de juegos en línea. |
| `motor.js` | Motor propio: alfa-beta (PVS) con profundización iterativa, quiescencia, tabla de transposición, jugada nula, reducciones tardías, jugadas asesinas e historia. Tablas de posición propias (calculadas con fórmulas), estructura de peones, pareja de alfiles y libro de aperturas. Niveles, análisis y búsqueda exacta de mates para los problemas. |
| `motor-worker.js` | Ejecuta el motor en segundo plano. Si el navegador no permite Workers, la app calcula en el propio hilo. |
| `piezas.js` | Piezas en SVG dibujadas para esta app. |
| `problemas.js` | Problemas de mate, generados con `tools/generar-problemas.js`. |
| `aperturas.js` | Nombres de aperturas. |
| `juego.js` | Tablero (tocar o arrastrar, animaciones), partida, reloj, análisis, problemas y PGN. |
| `index.html` | Estilos, menú, temas, actualizador, copias, clasificación y arranque (de la plantilla). |

**Licencias**: no se usa Stockfish ni ningún otro motor o librería GPL. El motor, las piezas, las tablas de posición y los problemas son propios. Las líneas del libro de aperturas son jugadas de teoría (no tienen autor).

### Niveles

| Nivel | Cómo juega | Elo para la clasificación |
|---|---|---|
| 1 Principiante | 1 jugada + capturas, mucho azar y algún error a propósito | 600 |
| 2 Aficionado | 2 jugadas, mucho azar | 800 |
| 3 Intermedio | 2 jugadas, algo de azar | 950 |
| 4 Avanzado | 3 jugadas, algo de azar | 1150 |
| 5 Experto | 0,35 s por jugada | 1450 |
| 6 Club | 2,5 s por jugada | 1650 |

Calibrados en la 1.0.3 con `tools/calibrar-niveles.js` (partidas entre niveles vecinos, con los nodos que calcularía un móvil de gama media): cada nivel saca al anterior un 85 % (1→2, 2→3, 3→4), un 93-95 % (4→5) y un 88 % (5→6) de los puntos. Las diferencias medidas se comprimen ×0,6 para pasarlas a Elo de personas y el nivel 1 se fija en 600: la escala relativa está medida; el punto de partida es una estimación. Con reloj, la máquina no gasta más de 1/40 de su tiempo restante por jugada.

### Preparado para el juego en línea

- La partida se guarda como `moves` (UCI) + `startFen`; `Ajedrez.replay()` reconstruye todo. El servidor común podrá usar `ajedrez.js` tal cual para validar las jugadas.
- El reloj guarda `times` y `tick`, igual que lo hará el servidor.
- El servidor común está en el repo `csuarezsm/juegos-servidor`. `tests/servidor/` es una copia de su `src/` para probar la app contra él en `npm test`.

## Versión web (iPhone)

La misma app se publica como web instalable en **https://csuarezsm.github.io/Ajedrez/app/** (GitHub Pages, carpeta `docs/app`, sin cargar el VPS). En iPhone: Safari → Compartir → «Añadir a pantalla de inicio». La app lo explica sola la primera vez que se abre en Safari.

- Funciona todo: contra la máquina, dos jugadores, en línea, problemas, análisis, clasificación, PGN y copias (exportar a mano).
- Se actualiza sola al abrirla (sin aviso). No hay actualizador de APK ni copia automática en el móvil.
- `docs/app` tiene que ser igual que `www/`: **antes de cada commit que cambie `www/`, `npm run web`**. Las pruebas y el workflow fallan si no.

## Publicar una versión

1. Sube `versionCode` y `versionName` en `android/app/build.gradle`.
   Después de los cambios en `www/`, ejecuta `npm run web` (versión web).
2. Pon el mismo número en `APP_VERSION` (`www/index.html`) y en `CACHE` (`www/sw.js`).
3. Haz push a `main`. El workflow `.github/workflows/android.yml`:
   - pasa las **pruebas automáticas** (`npm test`); si alguna falla, no se publica nada;
   - compila el **APK** (`ajedrez.apk`, sabor `github`, con actualizador) y el **AAB** para Google Play (`ajedrez-play.aab`, sabor `play`, sin actualizador ni donativo, Android 16 / API 36);
   - los firma con la clave fija y crea la Release `vX.Y.Z`. La app instalada la detecta y se actualiza sola.

### Secretos del repositorio (Settings → Secrets and variables → Actions)

- `ANDROID_KEYSTORE_BASE64`: el archivo `ajedrez-release.jks` en base64.
- `ANDROID_KEYSTORE_PASSWORD`: su contraseña (alias de la clave: `ajedrez`).

**Guarda el `.jks` y la contraseña en un lugar seguro.** Si se pierden, las versiones de GitHub ya instaladas no podrán actualizarse sin desinstalar la app.

## Pruebas

`npm test` (unos 2 minutos) comprueba:

- el generador de jugadas con *perft* en 6 posiciones de referencia;
- enroque, captura al paso, coronación, notación, FEN, mate, ahogado, triple repetición, 50 movimientos y material insuficiente;
- 300 partidas al azar: todas terminan, la clave de posición siempre cuadra y todas pasan por PGN sin cambios;
- el motor (mates, piezas regaladas, simetría, libro, análisis) y que el nivel 3 gana al 1 y el 5 al 3;
- que los 170 problemas tienen una solución legal, terminan en mate y no tienen un mate más corto;
- el juego en línea: dos móviles simulados juegan una partida completa contra el servidor (crear sala, unirse, turnos, reconexión, mate, Elo, revancha y tablas);
- la interfaz: partida contra la máquina, dos jugadores, coronación, reloj, tablas, modo aprendizaje, análisis, problemas, PGN, copias con datos maliciosos, clasificación, temas, y que el tablero cabe en móvil vertical, horizontal y tablet.

## Desarrollo local

```bash
npm install
npm test                  # pruebas (Playwright 1.63 + Chromium)
npx cap sync android
npx cap open android      # Android Studio
npm run icons             # iconos y splash a partir de assets/
node tools/buscar-candidatos.js 1 cand.json 30   # busca candidatos a problemas durante 30 min
node tools/elegir-problemas.js cand.json        # elige los mejores y los añade a www/problemas.js
```

## Google Play

`play-store/` tiene la ficha (`FICHA-GOOGLE-PLAY.md`), el icono de 512, el gráfico destacado y las capturas de móvil y de tablet de 7" y 10". Para regenerarlas: `node play-store/capturas.mjs`.

## Web

- `docs/index.html`: página de descarga (GitHub Pages).
- `docs/privacidad.html`: política de privacidad (la pide Google Play).
- `docs/descargas.html`: contador de descargas del APK.

## Más juegos de IT Canarias

En el menú ⋮ → «🎲 Más juegos de IT Canarias» y en la página de descarga aparecen los otros juegos (Ajedrez, Damas, Chinchón, Pumba). El código es `www/masjuegos.js`, **el mismo archivo en todas las apps**, con la lista y los iconos (`www/juegos/`) dentro para que funcione sin conexión. Con internet, la app lee como mucho cada 12 horas el catálogo común `https://csuarezsm.github.io/juegos-servidor/juegos.json` (repo `juegos-servidor`, carpeta `docs/`): un juego nuevo añadido allí aparece en todas las apps sin actualizarlas. En Android, si el otro juego está instalado, el botón lo abre (plugin `OtrasApps` y `<queries>` del manifiesto); si no, lleva a su página de descarga, o a Google Play si el catálogo tiene su enlace `play` y esta es la versión de Play. En iPhone abre su versión web.

## Aviso de turno en línea

En una partida en línea, cuando pasa a ser tu turno suena un «ding-dong» corto y el móvil vibra (`www/turno.js`, el mismo archivo en todas las apps; sonido sintetizado). Se quita en ⋮ → Colores… → «🔔 Aviso de turno en línea». Suena con la app abierta; con la app en segundo plano el sistema puede pausarla.

**Despistes de la máquina (niveles 1 a 4)**: de vez en cuando la máquina juega a propósito una jugada peor, pero con un límite según el nivel (`maxLoss` en `www/motor.js`): Principiante puede perder bastante, mientras que Avanzado nunca pierde más de algo más de un peón en ese despiste. Nunca juega una jugada al azar que regale una pieza grande sin motivo.
