# Ajedrez

Ajedrez para Android: contra la máquina, dos jugadores en el mismo móvil y problemas de mate.
App Capacitor + web (`www/`). No usa servidor: todos los datos se guardan en el móvil.
Paquete: `com.itcanarias.ajedrez` · versión 1.0.0

© 2026 IT Canarias. Todos los derechos reservados.

## Qué hace

- **Contra la máquina**: seis niveles (principiante, aficionado, intermedio, avanzado, experto y club), con blancas, negras o al azar. Deshacer, tablas (la máquina las acepta si su posición no es mejor) y rendirse.
- **Modo aprendizaje**: botón de pista y aviso cuando una jugada pierde 1,5 peones o más. Se puede deshacer o seguir: las jugadas legales se permiten siempre.
- **Dos jugadores** en el mismo móvil, con opción de girar el tablero en cada turno.
- **Reloj** opcional: 3+2, 5+0, 10+5, 15+10 o personalizado. Se para si sales de la app. Si se acaba el tiempo y el rival no puede dar mate, son tablas.
- **Análisis**: al terminar, el motor evalúa cada posición y marca ★ mejor, ?! imprecisión (≥ 0,6), ? error (≥ 1,3) y ?? error grave (≥ 3 peones). Enseña la mejor jugada en el tablero, la barra de evaluación y la precisión de cada jugador.
- **Problemas**: 66 problemas de mate (24 en 1, 24 en 2 y 18 en 3). La máquina defiende lo mejor posible; se acepta cualquier jugada que mantenga el mate. Pistas y solución.
- **Clasificación**: Elo (inicial 1200, K = 40 las 10 primeras partidas y después 24). La máquina tiene un Elo fijo por nivel. Ficha de jugador, récords e historial con revisión jugada a jugada.
- **PGN**: exportar una partida o todas, e importar archivos PGN (con comentarios y variantes). Las importadas no cuentan para el Elo.
- **Igual que la plantilla**: temas de colores, colores del tablero, coordenadas, tamaño de letra, horizontal y tablet, márgenes de Android, bienvenida, Acerca de con privacidad y donativo (no en Play), compartir la app, copias automáticas, enviar partidas al grupo y borrar datos.

## Archivos (`www/`)

| Archivo | Qué contiene |
|---|---|
| `ajedrez.js` | Reglas: tablero 0x88, jugadas legales, FEN, SAN, PGN, tablas. La partida es una lista de jugadas UCI (`e2e4`, `e7e8q`) y el estado se calcula a partir de ella. Funciona en la app, en el Web Worker, en Node y, más adelante, en el servidor de juegos en línea. |
| `motor.js` | Motor propio: alfa-beta (PVS) con profundización iterativa, quiescencia, tabla de transposición, jugada nula, reducciones tardías, jugadas asesinas e historia. Tablas de posición propias (calculadas con fórmulas), estructura de peones, pareja de alfiles y libro de aperturas. Niveles, análisis y búsqueda exacta de mates para los problemas. |
| `motor-worker.js` | Ejecuta el motor en segundo plano. Si el navegador no permite Workers, la app calcula en el propio hilo. |
| `piezas.js` | Piezas en SVG dibujadas para esta app. |
| `problemas.js` | Problemas de mate, generados con `tools/generar-problemas.js`. |
| `juego.js` | Tablero (tocar o arrastrar, animaciones), partida, reloj, análisis, problemas y PGN. |
| `index.html` | Estilos, menú, temas, actualizador, copias, clasificación y arranque (de la plantilla). |

**Licencias**: no se usa Stockfish ni ningún otro motor o librería GPL. El motor, las piezas, las tablas de posición y los problemas son propios. Las líneas del libro de aperturas son jugadas de teoría (no tienen autor).

### Niveles

| Nivel | Cómo juega | Elo para la clasificación |
|---|---|---|
| 1 Principiante | 1 jugada + capturas, mucho azar y algún error a propósito | 700 |
| 2 Aficionado | 2 jugadas, bastante azar | 1000 |
| 3 Intermedio | 3 jugadas, algo de azar | 1300 |
| 4 Avanzado | 0,5 s por jugada (máx. 6 de profundidad) | 1550 |
| 5 Experto | 1,2 s por jugada | 1750 |
| 6 Club | 2,5 s por jugada | 1950 |

Los Elo de la máquina son aproximados, para comparar jugadores entre sí. Con reloj, la máquina no gasta más de 1/40 de su tiempo restante por jugada.

### Preparado para el juego en línea

- La partida se guarda como `moves` (UCI) + `startFen`; `Ajedrez.replay()` reconstruye todo. El servidor común podrá usar `ajedrez.js` tal cual para validar las jugadas.
- El reloj guarda `times` y `tick`, igual que lo hará el servidor.
- Falta: botón «Jugar en línea», salas con código y el módulo de Ajedrez en el servidor (ver el documento de arranque).

## Publicar una versión

1. Sube `versionCode` y `versionName` en `android/app/build.gradle`.
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
- que los 66 problemas tienen una solución legal, terminan en mate y no tienen un mate más corto;
- la interfaz: partida contra la máquina, dos jugadores, coronación, reloj, tablas, modo aprendizaje, análisis, problemas, PGN, copias con datos maliciosos, clasificación, temas, y que el tablero cabe en móvil vertical, horizontal y tablet.

## Desarrollo local

```bash
npm install
npm test                  # pruebas (Playwright 1.63 + Chromium)
npx cap sync android
npx cap open android      # Android Studio
npm run icons             # iconos y splash a partir de assets/
node tools/generar-problemas.js   # vuelve a generar los problemas (tarda unos minutos)
```

## Google Play

`play-store/` tiene la ficha (`FICHA-GOOGLE-PLAY.md`), el icono de 512, el gráfico destacado y las capturas de móvil y de tablet de 7" y 10". Para regenerarlas: `node play-store/capturas.mjs`.

## Web

- `docs/index.html`: página de descarga (GitHub Pages).
- `docs/privacidad.html`: política de privacidad (la pide Google Play).
- `docs/descargas.html`: contador de descargas del APK.
