# CONTEXT.md — por qué el código es así

Este documento no explica **cómo usar** la app (eso es el [README](README.md)) ni
**qué hace** cada archivo (eso lo dicen los comentarios). Registra el
**razonamiento**: qué se verificó, qué se descartó y por qué, y qué salió mal al
probarlo. Sin esto, la próxima persona que toque el proyecto —incluido tu yo de
dentro de tres meses— vuelve a tomar las mismas decisiones desde cero, o peor,
las revierte sin saber qué las motivó.

Escrito al final de la sesión de construcción inicial (26 de julio de 2026,
commits `8093c25`..`baa4e29`).

---

## 1. Hechos del entorno, ya verificados

Están comprobados en la máquina real. **No hay que re-derivarlos**, y varios
son la razón directa de decisiones posteriores.

| Hecho | Valor | Por qué importa |
|---|---|---|
| Windows build | `10.0.26200` | Muy por encima de 22000, así que `WDA_EXCLUDEFROMCAPTURE` da exclusión **total** de la captura. Los bugs conocidos de "rectángulo negro en lugar de invisible" afectan a builds ≤ 22000 y **no aplican aquí**. |
| Node / npm / git | 24.18.0 / 11.16.0 / 2.52.0 | npm 11 **bloquea los install scripts** por defecto (ver §3). |
| Rust / cargo | **ausente** | Por eso Electron y no Tauri. |
| MSVC / `cl.exe` / `vswhere` | **ausentes** | Ningún módulo nativo de Node es viable sin pedir ~5 GB de Visual Studio Build Tools. Esta es la razón de dos desviaciones del plan (ver §5). |
| Python | 3.13.11 | Presente, pero irrelevante sin MSVC: `node-gyp` necesita ambos. |
| Ruta del proyecto | dentro de **OneDrive**, con **espacios** | Rompe `electron-builder` con `EPERM` y obliga a evitar `shell: true` al pasar argumentos. |

---

## 2. Por qué Electron y no Tauri

El plan lo decidió con el usuario, pero conviene registrar el criterio: Tauri da
un binario de ~10 MB frente a ~98 MB, pero **no hay Rust instalado**, y sobre
todo el loopback de audio y la invisibilidad habría que implementarlos a mano en
Rust. Electron trae `setContentProtection`, `desktopCapturer` y captura de audio
loopback nativa (desde la 31; sin paquetes de terceros desde la 39) funcionando
de fábrica. Para un proyecto personal, ese trabajo ahorrado vale los 88 MB.

---

## 3. Matriz de versiones: por qué está clavada

Las versiones **no** son arbitrarias ni "las últimas". Cada una está fijada por
una restricción concreta que se descubrió al instalar. Si actualizas una, lee
esto antes.

- **`vite` en 7.3.6, no 8.** `electron-vite@5` declara `vite: ^5 || ^6 || ^7`.
  Vite 8 rompe la instalación.
- **`@vitejs/plugin-react` en 5.2.0, no 6.** La 6 exige `vite: ^8`. La 5.2.0 es
  la más nueva que todavía acepta Vite 7.
- **`typescript` en 6.0.3, no 7.** `typescript-eslint@8.65` declara
  `typescript: >=4.8.4 <6.1.0`. TypeScript 7 (el port a Go) queda fuera.
- **`@eslint/js` en 10.0.1**, que no sigue el número de versión de `eslint`
  (10.8.0). Son paquetes con versionado independiente.
- **TypeScript 6 deprecó `baseUrl`.** Los `paths` de los tsconfig necesitan
  prefijo `./` explícito, o `tsc` falla con TS5090.
- **`eslint-plugin-react-hooks@7`**: el flat config está en
  `configs.flat['recommended-latest']`. `configs['recommended-latest']` sigue
  siendo el formato eslintrc antiguo y ESLint 10 lo rechaza.
- **`electron-store` está fuera del proyecto a propósito.** Desde la v10 es
  ESM-only (`"type": "module"`), y el proceso main se empaqueta como CommonJS.
  Se escribió un store propio de ~80 líneas en `src/main/config/store.ts`; lo
  que necesitábamos era trivial y no justificaba pelear con el interop.
- **El binario de Electron hay que instalarlo a mano tras `npm install`.** npm 11
  bloquea los install scripts, y el postinstall de Electron es el que descarga el
  binario. Si `node_modules/electron/dist/electron.exe` no existe:
  `node node_modules/electron/install.js`. Se eligió ejecutar **solo ese** script
  en lugar de aprobar todos en bloque. `esbuild` no lo necesita: su binario llega
  por optional dependencies.

**Main es CommonJS, no ESM.** El motivo original fue la compatibilidad con
módulos nativos (whisper, onnxruntime). Ese motivo **desapareció** cuando whisper
pasó a ser un binario externo (§5), así que hoy CJS se mantiene solo por
simplicidad de interop. Si algún día conviene migrar a ESM, ya no hay nada que lo
bloquee salvo revisar los `require` implícitos del bundle.

---

## 4. Decisiones de arquitectura y su razón

### Ventanas

- **Tres entradas de renderer** (overlay, dashboard, audio-worker).
- **El audio worker es una ventana oculta aparte**, no parte del overlay, por
  tres razones: `getUserMedia`/`getDisplayMedia` solo existen en un renderer;
  aislarlo evita que el pipeline de audio se detenga cuando el usuario oculta el
  overlay; y `backgroundThrottling: false` es imprescindible o Chromium
  estrangula los timers de una ventana sin foco y el audio llega a tirones.
- **`focusable: false` en el overlay.** Esto no es cosmético: robar el foco de
  Teams/Meet es lo que **de verdad** delata al asistente, más que la ventana en
  sí. Se muestra con `showInactive()`, nunca `show()`.
- **Re-aplicar `setContentProtection(true)` en `show`/`restore`/`focus`.**
  Electron pierde el flag al ocultar y volver a mostrar
  (electron/electron#29085, corregido a medias en #45868 pero inconsistente
  entre builds). **No quitar ese hook**: es la causa número uno de fugas en este
  tipo de app.

### Audio

- **Dos streams independientes** (mic = `me`, loopback = `them`) en lugar de
  diarización. El hablante se deduce del origen: más simple y exacto.
- **`echoCancellation` y `noiseSuppression` desactivados en el micrófono.** Con
  la cancelación activa, el mic borraría parte del audio del otro lado, que ya
  capturamos por separado.
- **Ningún carril se conecta a `context.destination`**: reproduciría el audio
  capturado y crearía realimentación con el loopback.
- **El worklet acumula ~100 ms por mensaje.** `process()` se llama cada 128
  frames (~2,9 ms): emitir en cada llamada serían ~344 mensajes IPC por segundo
  **y por stream**.
- **El worklet se compila desde un Blob URL**, no como archivo, para no depender
  del nombre con hash que Vite da a los assets en producción. Eso obliga a
  permitir `blob:` en `script-src` del audio-worker (ver §6).

### Transcripción

- **Una sesión de Gemini Live POR HABLANTE.** Más conexiones que mezclar los
  streams, pero es lo que mantiene exacta la atribución; una sola sesión con
  audio mezclado daría un transcript indistinguible.
- **Compromiso conocido y sin solución:** los modelos Live son
  conversacionales, no transcriptores puros, y **van a intentar responder**. Se
  mitiga con `responseModalities: [TEXT]` (la salida más barata), una system
  instruction que pide silencio, y descartando `modelTurn` por completo. La Live
  API **no permite desactivar la generación**, así que se paga un pequeño coste
  de salida. Si alguna vez lo permite, quitar el parche.
- **Reconexión con backoff**: la Live API cierra sesiones largas por diseño. Un
  `onclose` es normal, no un fallo.
- **`finalizeOpen()` en el buffer** cierra segmentos que el motor dejó abiertos:
  Gemini no siempre marca `finished` cuando alguien simplemente se calla, y un
  segmento abierto para siempre bloquearía el auto-disparo.
- **`customVocabulary` alimentado desde los context packs.** Un CV y una
  descripción de puesto están llenos de nombres propios y siglas, que es justo lo
  que un ASR generalista transcribe mal.

### Respuestas

- **`AbortSignal` es obligatorio en la firma de `LLMProvider`, no opcional.** Si
  el entrevistador pregunta otra cosa mientras se genera la respuesta anterior,
  hay que cancelarla: una respuesta obsoleta es **peor que ninguna**, porque el
  usuario la lee y contesta a algo que ya pasó. Una sola respuesta en vuelo,
  invariante garantizada por `abort()` al inicio de `ask()`.
- **Throttle de 60 ms al difundir el texto.** Sin él, cada token sería un mensaje
  IPC y un re-render de React: cientos por respuesta.
- **`cache_control: ephemeral` en el system prompt.** El CV y la descripción del
  puesto no cambian durante la entrevista, así que ese prefijo se cachea y las
  llamadas siguientes cuestan ~10% en esa parte. Mínimo 512 tokens en Opus 5
  para que el caché se cree; por debajo simplemente no cachea, sin error.
- **El prompt se diseñó bajo una sola restricción:** la respuesta se lee de reojo
  mientras alguien te mira a la cara. De ahí el máximo de 4 viñetas, la
  prohibición de preámbulos, y la regla de no inventar datos fuera de
  `<contexto>` — una respuesta genérica es recuperable, una mentira detectada no.

### Hechos de la API de Claude, verificados contra la referencia

Tres salieron **distintos** de lo que se habría escrito de memoria. Si algún día
el código parece "incompleto" en estos puntos, es deliberado:

1. **`temperature` / `top_p` / `top_k` devuelven 400** en Opus 5 y Sonnet 5. Están
   eliminados. El estilo se controla por prompt.
2. **El thinking está activo por defecto en Opus 5.** La palanca de latencia es
   `output_config.effort: 'low'`, **no** desactivarlo: desactivarlo tiene dos
   fallos conocidos (llamadas a herramientas emitidas como texto plano, que
   nunca se ejecutan y no dan error; y etiquetas `<thinking>` filtradas en la
   respuesta visible).
3. **`stop_reason: 'refusal'` llega como HTTP 200**, no como excepción. Hay que
   comprobarlo explícitamente o el overlay se queda en blanco sin motivo.

Model IDs correctos: `claude-opus-5`, `claude-sonnet-5`, `claude-haiku-4-5`.

Para Gemini Live, la documentación de Google listaba **tres model IDs distintos**
en páginas diferentes. La forma de la API se verificó contra los tipos del SDK
instalado (`node_modules/@google/genai/dist/genai.d.ts`), que es la fuente
autoritativa. `GEMINI_LIVE_MODELS` está ordenado por preferencia: si el primero
da 404 o permission denied, probar el siguiente.

---

## 5. Desviaciones del plan aprobado, y por qué

El plan original está en `~/.claude/plans/vamos-a-crear-un-luminous-hippo.md`.
Dos piezas se implementaron de otra forma. **Ambas cumplen el mismo requisito**;
cambió el mecanismo, no el objetivo.

### Whisper local: binario externo, no binding nativo

El plan decía `smart-whisper`. Al ir a instalarlo:

- Es un binding nativo (`node-addon-api`) que hay que **recompilar contra el ABI
  de Electron** con `electron-rebuild`.
- Eso exige **Visual Studio Build Tools (~5 GB)**, ausente en esta máquina.
- Y se rompe en **cada actualización de Electron**.

En su lugar se usa el **binario oficial de whisper.cpp** (`whisper-bin-x64.zip`,
v1.9.1, **7,6 MB**) como proceso hijo: sin toolchain, sin `node-gyp`, sin
acoplamiento de ABI, y se empaqueta sin ceremonia (`npmRebuild: false`). Se
descomprime con el `tar.exe` que Windows 10 1803+ trae de serie, para no añadir
una dependencia de unzip por una operación que se hace una vez.

El ejecutable se **busca** en lugar de asumir su ruta: el nombre cambió entre
versiones (`main.exe` → `whisper-cli.exe`) y el zip no tiene estructura estable.

### VAD: energía en TypeScript, no Silero

Por el mismo criterio. El plan decía `@ricky0123/vad-web` + `onnxruntime-node`,
que es **otro** módulo nativo. Silero es más preciso rechazando ruido que no es
voz, pero para lo único que hace falta aquí —**saber dónde termina un turno**—
la energía RMS basta, y Whisper filtra después lo que no sea habla.

Detalles que no son opcionales en `core/vad.ts`:

- **Suelo de ruido adaptativo**, actualizado **solo en silencio**. Un umbral fijo
  falla entre un micro de portátil y uno de diadema, que difieren en un orden de
  magnitud; y si se actualizara durante el habla, la propia voz arrastraría el
  suelo hacia arriba hasta dejar de detectarse.
- **Corte forzado a los 20 s**, o quien habla sin pausas nunca se transcribiría.
- **Descarte de picos cortos** (< 250 ms): un golpe en la mesa supera el umbral
  un instante, y sin filtro se mandaría a Whisper, que devolvería una
  alucinación.
- **Pre-roll de 300 ms**, para no comerse la primera sílaba, que es justo la que
  desambigua muchas preguntas.

También se filtran las **alucinaciones típicas de whisper.cpp sobre silencio**
("subtítulos realizados por…", "thanks for watching", `[música]`): son
artefactos conocidos del corpus de entrenamiento, y colarlas en el transcript
envenenaría el contexto del LLM.

### Auto-disparo: precisión sobre recall

Decisión de producto que conviene no revertir por descuido. El detector
(`core/question-detector.ts`) prefiere **fallar preguntas** antes que disparar de
más: una sugerencia que aparece cuando nadie preguntó nada distrae en el peor
momento posible, y el usuario **siempre** tiene el hotkey manual como red.

- **No depende del signo de interrogación**, porque muchos motores de STT no
  puntúan de forma fiable; depender de él perdería la mayoría de las preguntas.
- **Las muletillas se comprueban ANTES que todo lo demás**: "¿me escuchas?" lleva
  signo *y* empieza por interrogativo, y aun así no se responde.
- **Debounce de 2,5 s**: una pregunta larga puede cerrarse en varios segmentos
  seguidos, y sin él se dispararían varias respuestas abortándose entre sí.

---

## 6. Bugs encontrados al verificar, y qué enseñó cada uno

Todos salieron **ejecutando la app**, no leyendo el código. Están corregidos;
se registran porque cada uno marca una trampa que es fácil volver a pisar.

| Síntoma | Causa | Lección |
|---|---|---|
| Una ventana que arranca con stealth apagado no se podía encender después | `registerWindow()` solo se llamaba desde `applyStealth`, así que la ventana nunca entraba en `tracked` | El registro debe ser independiente del estado inicial |
| El texto de la ventana de atrás se leía **nítido** a través del overlay | `backdrop-filter: blur()` **no compone** de forma fiable sobre una ventana `transparent: true` en Windows | No confiar en blur en ventanas transparentes; fondo sólido. Una translucidez del 4% no da sensación de transparencia, solo ruido |
| La configuración se ignoraba **en silencio** | **BOM UTF-8** en `settings.json` → `JSON.parse` lanza → el store caía a defaults. Notepad y `Set-Content -Encoding utf8` de PowerShell 5.1 escriben BOM | Un archivo pensado para editarse a mano debe tolerar BOM |
| `Unable to load a worklet's module` | La propia CSP: `script-src 'self'` bloquea el Blob URL del worklet | Las CSP estrictas también bloquean tu propio código generado |
| ~344 mensajes IPC/s por stream | El worklet emitía en cada `process()` | Acumular a un tamaño de bloque útil |
| `session.bind()` resolvía a `Function.prototype.bind` | Colisión de nombre con el módulo `session` de Electron | TypeScript avisó con "Duplicate identifier"; sin él habría sido un fallo silencioso |
| El selector mostraba los modelos del proveedor equivocado | `listModels()` lento del proveedor A resolviendo **después** de cambiar a B | Lo detectó la regla `set-state-in-effect` de eslint. Se arregló guardando el resultado junto al proveedor y descartándolo por comparación |
| `EPERM` al empaquetar | **OneDrive** mantiene un lock sobre `release/` | Ver §7 |

Dos reglas del tooling encontraron cosas reales, no ruido:
`noUncheckedIndexedAccess` (desestructurar `getPosition()`, que devuelve
`number[]`, no una tupla) y `preserve-caught-error` (re-lanzar sin `cause`).

---

## 7. El problema de OneDrive

`electron-builder` falla de forma **reproducible** con:

```
EPERM: operation not permitted, rename 'release\win-unpacked.tmp' -> 'release\win-unpacked'
```

No es configuración: OneDrive mantiene un lock sobre la carpeta mientras la
sincroniza. Además, sincronizar ~215 MB de artefactos no tiene ningún sentido.

`scripts/build-win.mjs` detecta si el proyecto vive en una carpeta sincronizada
y saca la salida a `%LOCALAPPDATA%\InterviewHelper-release`, avisando por
consola. Se puede forzar otra ruta con `IH_BUILD_OUT`.

Ese script invoca `cli.js` con `process.execPath` en lugar de `npx` con
`shell: true`, por dos motivos: pasar argumentos con shell los concatena **sin
escapar** (Node avisa con DEP0190), y la ruta de este proyecto **contiene
espacios** ("Interview Helper").

---

## 8. Qué está verificado y qué no

Distinción importante: casi todo se probó **ejecutando la app y mirando
capturas de pantalla**, no solo compilando.

### Verificado ejecutándolo

- **Stealth en las dos direcciones.** Con el modo activo el overlay **no
  aparece** en una captura GDI; desactivándolo **sí aparece**. Probar solo una
  dirección no habría demostrado nada: la ausencia también es compatible con
  "el overlay no renderiza".
- **Hotkeys globales** con el foco en otra aplicación (`Ctrl+Alt+Left` movió el
  overlay exactamente 120 px en tres pulsaciones).
- **Separación de los dos streams**: con un tono de 440 Hz por los altavoces, el
  medidor "Ellos" sube y "Yo" se queda a cero.
- **Chunks de PCM llegando al main** de ambos hablantes a 16 kHz.
- **Captura de pantalla** → thumbnail en el overlay → motor de respuestas
  llamando al proveedor y mostrando el error de key ausente en el panel.
- **Ruta de error del STT**: sin key, falla con mensaje accionable y **la captura
  de audio sigue funcionando** (comportamiento resiliente buscado).
- **Dashboard completo**, con el selector de modelos poblado por IPC.
- **La app empaquetada arranca**: instalador NSIS + portable de ~98 MB, y el
  `.exe` levanta dashboard y overlay leyendo settings de `userData`.
- `typecheck`, `lint` y **45 tests** limpios.

### NO verificado — requiere claves o intervención manual

- **Streaming real de tokens** de Claude/Gemini (necesita API key del usuario).
- **Transcripción en vivo** con Gemini Live (ídem).
- **Auto-disparo sobre habla real** (la heurística sí está cubierta por tests).
- **Whisper local end-to-end**: los assets nunca se descargaron en esta sesión.
- **Ollama**: no hay servidor corriendo en la máquina.
- **La prueba en una videollamada real** (Meet / Teams / Zoom / OBS). La
  verificación se hizo con captura GDI/BitBlt.
  `WDA_EXCLUDEFROMCAPTURE` cubre también las rutas DXGI y Windows Graphics
  Capture que usan esas apps, **pero conviene confirmarlo**. Es la prueba de la
  fase 1 que queda pendiente, y la más importante de todas.

---

## 9. Cabos sueltos concretos

Cosas que existen a medias. No son bugs; son trabajo no terminado, y está mejor
escrito aquí que descubierto por sorpresa.

- **`setOverlayInteractive()` es código muerto.** Existe en
  `src/main/windows/overlay.ts` y resuelve bien el problema (volver el overlay
  enfocable para escribir sin romper la regla de no robar foco), pero **nada la
  llama**: falta el input de texto en el overlay y su handler IPC.
- **`askWithText` está completo salvo la UI.** La cadena IPC → preload →
  `session.askWithText()` funciona; ningún renderer la invoca.
- **`resizeOverlay` no lo llama nadie.** El handler y el preload existen; la idea
  era que el overlay se ajustara a la altura de la respuesta.
- **`overlayOpacity` no se puede cambiar.** El overlay lo respeta; el dashboard
  no lo expone.
- **Los hotkeys no se pueden remapear desde la UI.** `settings.hotkeys` y
  `registerHotkeys()` ya lo soportan (y `registerHotkeys` devuelve los
  aceleradores que Windows rechazó, para poder avisar), pero el dashboard no
  tiene el editor.
- **`'heuristic+classifier'` está en el tipo `AutoTriggerMode` pero no
  implementado.** El dashboard solo ofrece `off` y `heuristic`; si alguien
  escribe ese valor en `settings.json` se comportará como `heuristic`. Era el
  escalón de clasificador con Haiku.
- **No hay icono de la app.** `electron-builder` avisa: *"default Electron icon
  is used"*. Falta `build/icon.ico`.
- **`build/` no existe** (es `buildResources` en la config de electron-builder).

---

## 10. Cómo repetir las verificaciones

Los procedimientos que se usaron, por si hay que revalidar tras un cambio.

**Stealth (siempre en las dos direcciones):** con el modo activo, hacer una
captura de pantalla y comprobar que el overlay **no** está; desactivarlo en el
dashboard, repetir, y comprobar que **sí** está. Una sola dirección no demuestra
nada.

**Audio dual:** reproducir un tono o un vídeo por los altavoces mientras se
habla al micrófono; los dos medidores del dashboard deben moverse de forma
independiente. El log del main imprime una línea por hablante al llegar su
primer chunk (`[capture] primer chunk de "them" (16000 Hz)`) — está justamente
para distinguir "no se oye nada" de "el pipeline está roto", que desde fuera se
ven igual.

**Hotkeys globales:** dispararlos con el foco en **otra** aplicación. Si solo
funcionan con la app enfocada, no están registrados como globales.

**Empaquetado:** `npm run build:win` y después **ejecutar el `.exe`
empaquetado**. Que se generen los archivos no prueba que arranque: el bundle de
producción resuelve las rutas de los renderers de otra forma que el dev server.

```bash
npm run typecheck && npm run lint && npm test
```

---

## 11. Regla de oro para este proyecto

**El modo invisible se verifica, no se asume.** Es la única función cuyo fallo
es silencioso *y* costoso: si deja de funcionar, la app sigue pareciendo
perfecta y el usuario se enterará en el peor momento posible. Cualquier cambio
que toque `windows/stealth.ts`, `windows/overlay.ts` o el ciclo de vida de las
ventanas exige repetir la prueba de las dos direcciones **antes** de dar el
cambio por bueno.

Y en el README están escritos sin adornos los límites reales: no protege de una
cámara apuntando a la pantalla, no oculta el proceso frente a software de
proctoring que enumere ventanas, y no oculta lo que digas por el micrófono. Esa
honestidad es parte del producto; no conviene diluirla.
