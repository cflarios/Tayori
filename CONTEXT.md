# CONTEXT.md — por qué el código es así

Este documento no explica **cómo usar** la app (eso es el [README](README.md)),
ni **dónde vive cada cosa** (eso es [ARCHITECTURE.md](ARCHITECTURE.md)), ni
**qué hace** cada archivo (eso lo dicen los comentarios). Registra el
**razonamiento**: qué se verificó, qué se descartó y por qué, y qué salió mal al
probarlo. Sin esto, la próxima persona que toque el proyecto —incluido tu yo de
dentro de tres meses— vuelve a tomar las mismas decisiones desde cero, o peor,
las revierte sin saber qué las motivó.

**Los tres documentos, y cuándo abrir cada uno:**

| | Responde a | Ábrelo cuando |
|---|---|---|
| [README.md](README.md) | Qué hace y cómo se usa | Quieres ejecutarlo |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Qué es y cómo circulan los datos | Vas a tocar código y no sabes dónde |
| CONTEXT.md | Por qué está así | Algo te parece raro y vas a "arreglarlo" |

Ese último caso es el importante. Buena parte de lo que hay aquí documenta cosas
que **parecen** errores y no lo son.

Escrito al final de la sesión de construcción inicial (26 de julio de 2026,
commits `8093c25`..`baa4e29`) y actualizado en la primera ronda de ajustes.

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

### La app escucha, no graba — matizado en julio de 2026

La versión original **no persistía nada**, y este apartado avisaba de que añadir
un historial rompería esa promesa y obligaría a actualizar el README y las
consideraciones legales *a la vez*. Eso es exactamente lo que pasó: el usuario
pidió un historial de conversaciones que se guarde, eligiendo explícitamente
incluir la transcripción y no sólo las respuestas.

Dónde queda la línea ahora, que es lo que hay que saber para no volver a moverla
sin darse cuenta:

- **El audio sigue sin tocar el disco. Nunca.** Los chunks del worklet van al
  motor y se descartan. No hay archivos de audio ni temporales — la única
  excepción es el WAV que Whisper local necesita para invocar `whisper-cli`, que
  se borra en el `finally` de cada invocación y vive en un `mkdtemp` que se
  destruye al parar. Esta parte **no se negocia**: es lo que separa la app de una
  grabadora.
- **El texto sí se guarda**, si `settings.historyEnabled` está activo: respuestas
  y transcripción completa, un JSON por conversación en
  `userData/conversations`. Ver `main/config/history.ts`.
- **Es un interruptor, no una constante.** Apagarlo devuelve el comportamiento
  antiguo por completo: `ensureConversation()` devuelve `null` y no se crea ni la
  carpeta. Esa forma —que el punto de entrada devuelva `null` en lugar de repartir
  comprobaciones por todo el orquestador— es lo que hace que no se pueda colar
  una escritura por olvido.

El cambio legal **no es cosmético**: en varias jurisdicciones un registro escrito
de una conversación cuenta igual que una grabación a efectos de consentimiento.
Por eso el README ya no dice "no graba nada" a secas, y «Consideraciones legales»
separa ahora tres cosas que antes iban juntas: grabación, a dónde va el audio, y
las políticas de la empresa en la que estés.

**La regla de antes sigue en pie, sólo se movió el listón:** si alguien añade
exportación, sincronización o cualquier salida nueva de estos datos, hay que
volver a tocar el README y este apartado en el mismo commit.

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

### Los controles del overlay y el candado de los clics atravesables

Hay una contradicción de fondo entre dos requisitos, y la solución no es obvia:
el overlay debe **dejar pasar los clics** durante una llamada, y a la vez tener
**botones pulsables** (engranaje, cerrar) y una zona de arrastre.

`setIgnoreMouseEvents(true, { forward: true })` hace que la ventana ignore los
clics *pero siga recibiendo los eventos de movimiento*. Eso es exactamente lo
que se explota: el renderer escucha `mousemove`, mira con `elementFromPoint` si
el cursor está sobre algo marcado con `data-interactive`, y pide al main que
deje de ignorar el ratón sólo durante ese rato (`useChromeMouse`).

Dos detalles que parecen de más y no lo son:

- Se escucha también `mouseleave` del documento. Si el cursor sale rápido por un
  borde puede no llegar un último `mousemove` sobre zona no interactiva, y la
  ventana se quedaría capturando clics encima de la videollamada.
- El arrastre es **manual** (`startOverlayDrag` sigue el cursor desde el main con
  `setPosition`), no `-webkit-app-region: drag`. Esa propiedad no funciona con
  `focusable: false`, y renunciar a `focusable: false` no es opción. El
  seguimiento va por intervalo y no por los `mousemove` del renderer porque al
  arrastrar rápido el cursor se sale de la ventana.

### Las dos pestañas: escucha y escritura

El panel de entrada tiene dos pestañas. **Escucha** es la transcripción de
siempre; **Escritura** es un textarea que llama a `askWithText`. La respuesta se
pinta en «Sugerencia» en los dos casos: cambia de dónde sale la pregunta, no
dónde aparece la respuesta.

Escribir exige que la ventana sea enfocable, así que la pestaña de escritura es
**la única situación en la que el overlay toma el foco**. Es aceptable porque la
pide el usuario explícitamente, pero tiene tres consecuencias que van juntas y no
se pueden separar:

- **Revertir no es opcional.** El efecto de `OverlayApp` llama a
  `setInteractive(false)` al cambiar de pestaña y al desmontar, y
  `toggleOverlayVisibility` lo fuerza antes de ocultar. Una ventana que se queda
  enfocable acaba robando el foco de la videollamada, que es exactamente lo que
  la app existe para evitar.
- **La guarda vive en el main, no en React.** `setOverlayMouseIgnore` sale antes
  si `isOverlayInteractive()`. Sin ella los dos mecanismos se pelean: basta mover
  el cursor sobre una zona no interactiva para que el hover de `useChromeMouse`
  devuelva los clics atravesables a mitad de una frase y el botón de enviar deje
  de responder. Se puso ahí y no en el orden de los efectos de React porque ese
  orden es demasiado frágil para sostener una invariante.
- **Envía `Enter`, no `Ctrl+Enter`.** `Ctrl+Enter` es un hotkey **global**: lo
  intercepta el main y nunca llega al textarea. Si algún día se quiere que
  `Ctrl+Enter` envíe el borrador, hay que desregistrar el acelerador al entrar en
  la pestaña y volver a registrarlo al salir; no basta con un `onKeyDown`.

El aviso de que el overlay toma el foco está **en la propia pestaña**, no sólo
aquí: es una excepción a la promesa central del producto y callarla sería el tipo
de verdad a medias que el README se esfuerza en no contar.

### Qué salió a la superficie del overlay, y por qué

El overlay pasó de tres controles a unos cuantos más. El criterio para decidir
qué sube del dashboard al overlay es uno solo: **¿lo necesitarías a mitad de una
llamada?** El dashboard hay que abrirlo con el engranaje y roba el foco, así que
todo lo que esté allí es, en la práctica, inalcanzable mientras hablas.

- **Chips de perfil.** `promptProfileId` ya existía; sólo estaba en un
  desplegable del dashboard. Cambiar de registro es justo lo que quieres poder
  hacer sin parar. `custom` no es un chip porque se edita con un textarea.
- **Acciones rápidas** (Sigue / Más corto / Seguimiento / Resumen). Son prompts
  enlatados que van por `askWithText`, la misma vía que la pestaña de escritura:
  **no hay un camino nuevo hacia el LLM**. Sólo aparecen si hay una respuesta
  sobre la que actuar; "amplía tu última respuesta" sin respuesta previa le pide
  al modelo que amplíe el vacío.
- **Tamaño S/M/L/XL.** Cuatro presets y no redimensionado libre: la ventana es
  `frameless`, no hay bordes que arrastrar, y montar asas propias por un ajuste
  que se toca dos veces no compensa. `setOverlaySize` **reancla al borde
  derecho**: el overlay vive arriba a la derecha y crecer hacia fuera lo sacaría
  de la pantalla.
- **Marcas de tiempo relativas**, no la hora del reloj. Al repasar lo que importa
  es "hace cuánto se dijo esto"; una hora absoluta obliga a restar mentalmente.
- **Nueva conversación.** Aborta la respuesta en vuelo, vuelca la conversación,
  limpia el `TranscriptBuffer` **y** emite `onConversationReset`. Lo último no es
  opcional: el overlay tiene su propia copia de los segmentos en estado de React
  y sin el evento seguiría enseñando la conversación anterior.

### Discreción en Windows: barra de tareas y nombre del proceso

Dos cosas distintas que el usuario pidió, con alcances muy distintos:

- **Barra de tareas:** ni el overlay ni el dashboard aparecen. El overlay ya la
  evitaba; se añadió `skipTaskbar: true` al dashboard y un `setSkipTaskbar(true)`
  re-afirmado tras `showInactive()` en el overlay, por un gotcha de Electron en
  ventanas `transparent`+`frameless`. También se neutralizó el **título de
  ventana** del dashboard (BrowserWindow `title` y el `<title>` del HTML — este
  último gana tras cargar la página, así que hay que cambiar los dos), porque se
  filtra por Alt+Tab y la sección "Aplicaciones" del Administrador.

- **Nombre del proceso:** renombrado a `Audio Helper` en `electron-builder.yml`
  (`productName` + `executableName` + `nsis.shortcutName`). Es **cosmético**: no
  oculta el proceso, sólo evita que un vistazo casual muestre "Interview Helper".

**Se descartó explícitamente el ocultamiento tipo rootkit** (driver de kernel
que intercepte `NtQuerySystemInformation`, o hooking de `taskmgr.exe`): es
indistinguible de malware, lo marca el antivirus, exige driver firmado o
test-signing, y puede provocar BSOD con PatchGuard. No es la herramienta
correcta para un asistente personal, y cruza a territorio de rootkit. Si alguien
lo propone a futuro, la respuesta es no.

**Restricción crítica que hay que preservar:** NO cambiar el campo `name` de
`package.json` (`interview-helper`). `app.getPath('userData')` deriva de
`app.name`, que Electron toma de ese campo — no del `productName` del
empaquetado. Se ancló además con `app.setName('interview-helper')` al inicio de
`main/index.ts`, antes de cualquier `getPath('userData')`. Si esto se rompe, la
app deja de encontrar los settings y la API key cifrada con DPAPI: quedan
huérfanos en la carpeta vieja. Verificar siempre que userData sigue siendo
`%APPDATA%\interview-helper` tras tocar el empaquetado.

### El dashboard se abre sólo desde el engranaje

Decisión explícita del usuario. No hay apertura automática en el primer
arranque, y **no hay atajo de teclado** (se quitó `openDashboard` del
`HotkeyMap`). Consecuencias que hay que preservar juntas:

- El overlay muestra un aviso de configuración cuando el proveedor activo no
  tiene credencial, porque si no un usuario nuevo se queda sin pista alguna.
  Ollama cuenta como configurado sin credencial.
- Abrir una segunda instancia **recupera el overlay** en lugar de abrir el
  dashboard: es la vía de escape si se ocultó con `Ctrl+Shift+H` y no se
  recuerda el atajo.

### Qué se escucha es configurable

`Settings.audioSources` (`both` | `system` | `mic`) llega hasta dos sitios:
`capture.ts` (qué streams se abren; con `system` ni siquiera se pide permiso de
micrófono) y `STTStartOptions.speakers` (qué lanes crea el motor). Lo segundo
importa porque Gemini Live abre **una sesión WebSocket por hablante**: crear la
del micrófono cuando no se está escuchando gastaría una conexión vacía.

Matiz que la UI dice explícitamente porque es la confusión natural: **el
auto-disparo nunca reaccionó a tu propia voz** — `onFinalSegment` sólo evalúa
segmentos de `them`. Este ajuste decide qué entra en el *contexto* que se manda
al modelo, no cuándo se dispara. Escuchar el micrófono suele ser útil (el modelo
sabe qué has respondido ya y no te sugiere repetirlo); `system` existe para
quien prefiera que sus respuestas no salgan de la máquina en absoluto.

### Audio

- **Filtro antialiasing antes de decimar.** La primera versión remuestreaba
  48 kHz → 16 kHz con interpolación lineal y nada más, razonando que "el
  aliasing por encima de 8 kHz no afecta a la inteligibilidad". **Ese
  razonamiento estaba del revés y fue un bug real**: lo que hay por encima de
  8 kHz no desaparece al decimar, se **pliega** hacia abajo y aterriza dentro de
  la banda de la voz. Las sibilantes (s, f, z, ch) viven ahí, así que acababan
  superpuestas sobre las vocales. El efecto perverso es que **vocalizar mejor lo
  empeora**, porque mete más energía en la banda que se va a plegar. Se detectó
  porque la transcripción era mediocre con los DOS motores a la vez, que es lo
  que señaló que el fallo estaba aguas arriba de ambos.
  Ahora va un Butterworth de **8º orden** a 7 kHz. El orden no es celo: con 4º
  un tono de 12 kHz salía a -23 dB, audible de sobra para un reconocedor; con 8º
  baja de -40 dB. `pcm-worklet.test.ts` ejecuta el worklet real en un sandbox y
  fija ambos números.
- **Ni un `push` dentro de `process()`.** Corre en el hilo de audio, con deadline
  de tiempo real. La versión anterior usaba arrays JS con `push` por muestra y
  `slice`/`splice` en cada llamada (~cada 2,7 ms): basura para el GC en el peor
  sitio posible, y con Whisper y el LLM comiéndose la CPU se traduce en bloques
  perdidos. Todo el estado son `Float32Array` con índices y `copyWithin`.
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

### Audio directo: saltarse la transcripción entera

`gemini-audio` no es un motor de transcripción más. Manda el WAV del turno **al
propio modelo de lenguaje** y recibe transcripción y respuesta en la misma
llamada, con `responseSchema` para que la separación la garantice la API y no
una expresión regular.

Nació de un diagnóstico concreto: con el idioma forzado mal, el reconocedor
devolvía *"Are y'all gonna eat?"* a partir de una frase en español y el modelo
respondía impecablemente a algo que nadie dijo. Ese fallo tiene dos eslabones, y
este motor elimina el primero: el modelo **oye** el audio en lugar de leer lo
que otro entendió.

Lo que cambia en el orquestador, y por qué:

- **`STTProvider.answersDirectly`.** Con ese flag, `onFinalSegment` sale antes:
  disparar el detector generaría una segunda respuesta, esta vez leyendo el
  texto. Quien decide si algo merecía respuesta es el modelo que oyó el audio,
  y por eso el aviso de `autoTriggerIsInert` tampoco aplica aquí.
- **`AnswerEngine.present()`.** La respuesta no la pidió el motor de respuestas,
  pero todo lo de después —difusión al overlay, memoria de la conversación,
  historial en disco— tiene que ser idéntico. Por eso entra por el mismo sitio
  en lugar de difundirse suelta desde el orquestador.
- **El contexto se pasa como función, no como valor.** El motor lo consulta en
  cada turno; entre el arranque y la tercera pregunta el perfil o la memoria ya
  han cambiado.

**Sigue haciendo falta el VAD.** Alguien tiene que decidir cuándo termina el
turno; esto no es streaming. Para eso está Gemini Live.

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
- **Los context packs tienen tipo y perfil, no sólo nombre.** La primera versión
  eran cajas de texto libre: todas activas a la vez, todas volcadas al prompt
  bajo un `## Nombre`. Eso dejaba dos cosas al usuario que no le tocaban.
  La primera, **acordarse de activar y desactivar** al cambiar de tipo de
  reunión. Ahora cada pack declara en qué perfiles aplica —vacío significa
  siempre, que es lo que preserva los packs antiguos— y cambiar de «Entrevista»
  a «Reunión» en el overlay cambia también el material.
  La segunda, y más cara: **el modelo no podía distinguir qué era cada bloque**.
  Un CV es la fuente de verdad sobre alguien; una oferta dice hacia dónde
  alinear el discurso; una respuesta preparada hay que **reutilizarla**, no
  parafrasearla. Sin esa distinción, una respuesta que el usuario había
  redactado con cuidado salía aguada y genérica. `KIND_INSTRUCTIONS` en
  `prompt.ts` le da a cada tipo su propia instrucción.
  El tipo `vocabulary` es el único que **no entra en el prompt**: su sitio es el
  reconocedor de voz, y en el prompt sólo gastaría ventana de contexto.
- **`customVocabulary` alimentado desde los context packs.** Un CV y una
  descripción de puesto están llenos de nombres propios y siglas, que es justo lo
  que un ASR generalista transcribe mal. **Durante un tiempo sólo se le pasaba a
  Gemini**: whisper.cpp acepta el mismo sesgo por `--prompt` y no se estaba
  usando, desperdiciando la mitad del valor de una función que ya existía.
- **Búsqueda por haces (`-bs 5`) en Whisper.** Es la palanca que más ayuda con
  un acento marcado: en lugar de quedarse con el token más probable en cada
  paso, mantiene varias hipótesis y elige la mejor frase completa. Se midió
  antes de adoptarla, porque la intuición decía que sería cara: 494–611 ms con
  haces frente a 498–563 ms voraz, o sea **dentro del ruido**. En turnos cortos
  manda el paso del encoder —constante, ventana de 30 s— y la decodificación
  apenas pesa.

### Respuestas

- **El asistente recuerda sus propios turnos, y eso hubo que añadirlo.** La
  primera versión mandaba cada consulta como un turno **único**: system prompt
  más un mensaje de usuario. Las respuestas anteriores del modelo no volvían
  nunca. El transcript no lo suplía, porque sólo contiene voz —micrófono y
  sistema—, jamás lo generado.
  El síntoma, sacado de una conversación real: a los 90 segundos de haber dicho
  *"yo trabajo como comercial"*, el asistente contestaba *"no tengo información
  sobre cuál es mi profesión en esta conversación"*. Y olvidaba un nombre que le
  acababan de asignar en menos de un minuto.
  Ahora `AnswerRequest.history` lleva los últimos 8 intercambios y **cada
  proveedor los envía como mensajes reales** (`user`/`assistant`, o `model` en
  Gemini), no resumidos dentro del prompt: es lo que hace que el modelo los trate
  como cosas que dijo él. Se guardan sólo los turnos completados con texto —una
  respuesta abortada no es algo que el modelo dijera— y "nueva conversación" los
  borra, que es justamente para lo que existe ese botón.
- **`manualContextSeconds` NO es la memoria**, aunque lo parezca. Es cuántos
  segundos de transcripción acompañan a la pregunta. Con el valor en 10 el modelo
  recibía poco más que la frase en curso; la memoria de la conversación es cosa
  de `history`. La etiqueta del dashboard se cambió a "ventana de voz" porque
  "contexto enviado" invitaba exactamente a esa confusión.
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

### Modo código: por qué es un camino aparte y no un prompt más

El pedido era simple —"si tengo LeetCode en pantalla, dame la solución"— y la
tentación era resolverlo con un perfil nuevo en `PROFILES` y ya. No basta, y
conviene saber por qué antes de "simplificarlo":

- **Las reglas de formato del proyecto entero lo impedían.** `BASE_RULES` dice
  máximo cuatro viñetas, sin párrafos, y que cada viñeta se pueda leer en voz
  alta de un tirón. Todo eso es correcto para hablar y letal para un algoritmo:
  con esas reglas puestas el modelo devuelve el enfoque resumido y **ninguna
  implementación**. Por eso `RULES` pasó a ser un `Record<PromptProfileId,…>`:
  `coding` sustituye las reglas, no se suma a ellas. Si algún día alguien
  "unifica" eso en una constante única, el modo código deja de dar código.
- **El tope de tokens también.** 700 corta una solución de Java a media función,
  y una implementación truncada no vale para nada. `MAX_CODE_TOKENS` son 2200.
  El tope se elige por el modo, y el modo se activa por **dos** caminos: el
  disparo `code` y el perfil `coding` puesto a mano. Olvidar el segundo dejaba
  el caso más obvio —el usuario elige el chip "Código"— cortando respuestas.
- **La pregunta no está en el audio.** `ask('hotkey')` toma la última
  intervención cerrada como pregunta. Aquí el enunciado está en la pantalla, así
  que eso sólo mete una frase suelta de la llamada compitiendo con él.
  `solveOnScreen()` manda una instrucción fija y deja la transcripción como
  contexto secundario, que es su papel real: a veces la aclaración importante se
  dijo en voz alta.
- **Tiene que funcionar con la escucha parada**, que es el caso normal: un
  ejercicio delante y ninguna llamada abierta. Nada en ese camino toca el STT.
- **No persiste el perfil.** Ctrl+Alt+C fuerza `coding` sólo en esa consulta. Si
  lo guardara, quien lo usa en mitad de una entrevista se quedaría respondiendo
  las preguntas habladas en bloques de código hasta que se acordara de
  desactivarlo, y acordarse es justo lo que no puede hacer en ese momento.
- **Al revés que `Ctrl+Shift+S`, sin captura no se pregunta.** El hotkey de
  captura normal responde igual si la captura falla, porque la pregunta venía del
  audio. Aquí no hay nada que leer, así que preguntar sería gastar una llamada
  para que el modelo confiese que no ve nada.

**Calidad de la captura: 92, no 72.** El JPEG a 72 vale para "hay un diagrama en
pantalla" y se come exactamente lo que aquí importa: `l` contra `1`, `;` contra
`:`, los subíndices de un enunciado. Una firma mal leída produce una solución que
no compila, y el síntoma es desconcertante porque la respuesta parece perfecta.
No se subió a PNG porque los modelos escalan a ~1,5k px de todas formas.

**El atajo es `Ctrl+Alt+C` y no `Ctrl+Shift+X`.** Un acelerador global gana al de
la aplicación que tenga el foco, y quien usa esto tiene VS Code delante:
`Ctrl+Shift+X` le habría robado el panel de extensiones. `Ctrl+Shift+C` ya estaba
tomado por los clics atravesables, y `Ctrl+Alt+` es la familia de las flechas que
mueven el overlay.

**El overlay tuvo que aprender a pintar código.** Pintaba `answer.text` en un
`div` con `pre-wrap`; con una solución dentro eso deja las tres comillas a la
vista, parte las líneas largas a mitad de expresión —que es lo contrario de lo
que se quiere en código— y obliga a seleccionar a mano dentro de una ventana sin
foco y con los clics atravesándola. `answer-format.ts` es un parser mínimo de
vallas ``` y nada más: **no es un renderizador de Markdown y no debe convertirse
en uno**; meter una librería de 40 KB en una ventana que arranca en cada sesión
no sale a cuenta para el único formato que el prompt promete.

Su caso difícil no es parsear: es el **streaming**. La valla de cierre tarda
segundos en llegar, así que un bloque a medias se pintaría como párrafo y saltaría
de estilo a mitad de respuesta. De ahí el flag `open`, que abre la caja en cuanto
llega la valla de apertura y esconde el botón "Copiar" hasta que el bloque cierra
— copiar una función sin cerrar es peor que no poder copiarla.

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

**Cuarto hecho, aprendido a golpes:** el punto 2 se verificó contra Opus 5 y se
aplicó a los tres modelos. `output_config.effort` es de la **generación 5**, y
Haiku 4.5 devuelve `400: "This model does not support the effort parameter"` —
así que Haiku fallaba en TODAS las preguntas mientras Opus funcionaba, un patrón
que desde fuera no tiene ningún sentido. `EFFORT_UNSUPPORTED` en `claude.ts`
lleva la lista y además **aprende en caliente**: si un modelo futuro también lo
rechaza, la primera petición lo detecta, reintenta sin el parámetro y las
siguientes ya salen bien. La lección general es que un parámetro comprobado
contra un modelo no está comprobado para su familia.

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

**Desde julio de 2026 se usa `whisper-server`, no el CLI por turno.** El mismo
zip trae `whisper-server.exe`, que mantiene el modelo cargado entre peticiones y
acepta WAV por HTTP. Medido con los mismos hilos y el mismo audio:

| | por turno |
|---|---|
| `whisper-cli` (proceso nuevo cada vez) | ~1440 ms |
| `whisper-server` (modelo residente) | ~825 ms |

Los ~1440 ms del CLI coinciden con los tiempos reales del log de una sesión
(1380–1540 ms), así que la medida es representativa y no de laboratorio.

Dos cosas que conviene no confundir:

- **El CLI sigue ahí y no es código muerto.** Si el servidor no arranca —puerto
  ocupado, binario viejo sin `whisper-server.exe`— se cae al CLI. Una mejora de
  latencia no puede tumbar la transcripción entera.
- **Lo que NO arregla:** whisper.cpp procesa siempre una ventana de 30 segundos,
  así que el paso del encoder cuesta lo mismo con 1,7 s de audio que con 8,2 s.
  Ese suelo es del modelo, no del transporte, y es la razón de que los tiempos
  del log fueran tan planos. Quien busque bajar de ahí tiene que tocar
  `--audio-ctx`, a costa de precisión, o cambiar a un motor con streaming real
  (Gemini Live).

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
- **Rescate del enganche.** Actualizar el suelo *sólo* en silencio tiene un fallo
  que aparece después de un rato: si el ruido de fondo sube por encima de 2,5×
  el suelo aprendido —el ventilador acelerando porque Whisper y el LLM están
  cargando la CPU, o el AGC del micrófono subiendo ganancia— todos los frames
  pasan a contar como habla, y entonces el suelo **ya no vuelve a actualizarse
  nunca**, porque sólo se actualizaba en silencio. El VAD se queda enganchado y
  todo sale por corte forzado a 20 s. Por eso, pasados 30 s seguidos de "habla",
  se asume que es ruido y se deja que el suelo lo aprenda. El campo `forced` de
  `Utterance` existía desde el principio y no lo leía nadie; ahora se registra,
  porque varios cortes forzados seguidos son la firma exacta de este fallo.
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
- **Se acumula antes de decidir, no se descarta después.** El VAD cierra el
  turno a los 700 ms de silencio, y quien titubea hace pausas más largas que eso
  a mitad de frase: *"entonces… eh… lo que quería preguntarte es… ¿cómo lo
  harías?"* llega como tres segmentos.
  La primera versión disparaba con el **primer** fragmento y silenciaba 2,5 s
  los siguientes. El comentario del código identificaba bien el problema —"una
  pregunta larga puede cerrarse en varios segmentos"— y sacaba la conclusión
  contraria: respondía al titubeo y **descartaba la pregunta**.
  Ahora los fragmentos se acumulan y se juzga el conjunto tras `AUTO_SETTLE_MS`
  (900 ms) sin habla nueva. Sumados a los 700 ms del VAD, hacen falta ~1,6 s de
  silencio para dar la intervención por terminada: más de lo que dura una pausa
  de duda, menos de lo que dura el final de una pregunta. El debounce de 2,5 s
  sobrevive sólo como red contra dobles disparos por caminos distintos.
- **Las aperturas imperativas se buscan en cualquier posición.** Consecuencia
  directa de lo anterior: al unir fragmentos, "cuéntame" deja de encabezar la
  frase y la comprobación de prefijo dejaba de verla. Pedir algo sigue siendo
  pedir algo aunque haya un titubeo delante.

**Julio 2026: el equilibrio se volvió configurable, con datos.** La primera
prueba de escucha real dio la medida: de cinco frases seguidas dictadas al
micrófono, **sólo disparó una**, y desde fuera se vivió como "la app se quedó
colgada". No estaba colgada — el detector las descartaba en silencio.

Lo que enseñaron las transcripciones literales (recuperadas del historial, que
para esto ya valió lo que costó) es que **el mismo motor puntúa de forma
irregular en la misma sesión**:

```
"¿Qué tanto sabes de ingeniería software?"     ← con signos
"que empresa creó Kotlin."                      ← sin signos ni acento
"Si yo quiero programar una aplicación escritorio que lenguaje… deberiosa ahora."
```

Dos causas concretas, las dos arregladas:

- **`normalize()` tira los acentos**, y en español el acento es lo único que
  separa "qué" de "que" — la señal más fuerte del idioma se perdía antes de
  mirarla. Ahora los interrogativos acentuados se buscan sobre el texto **crudo**
  y **en cualquier posición**, no sólo en las dos primeras palabras.
- **El filtro de muletillas sólo miraba el principio.** "Hola, ¿cómo estás?
  ¿Me escuchas?" no empieza por muletilla y trae signo de interrogación, así que
  disparaba. Ahora también se comprueba por contenido en frases cortas.

Y como el equilibrio correcto **depende de para qué uses la app**, se añadió
`autoTriggerSensitivity` (`strict` | `balanced` | `all`, default `balanced`).
`all` existe porque el caso real del usuario era dictarle él las preguntas a
propósito: ahí no hay ruido del que protegerse y cualquier heurística sobra.

**Lo que se probó y se descartó:** meter variantes de "debería" entre los
marcadores (`que deberia`, `deberia usar`…). Disparaban con subordinadas
normales — *"creo que debería haber estudiado más"* no es una pregunta. Lo que
distingue una pregunta no es el verbo, es el interrogativo. El test de falsos
positivos de `question-detector.test.ts` fija esa decisión para que no vuelva.

**Quién dispara es configurable, pero el default no cambia.**
`settings.autoTriggerSpeaker` acepta `them` (default), `me` y `any`. El default
sigue siendo el interlocutor por la razón de siempre: responder a lo que dices tú
no tiene sentido en una entrevista. Se hizo configurable porque la combinación
`audioSources: 'mic'` + disparo en `them` deja el auto-disparo **muerto en
silencio** — el carril `them` ni siquiera se crea, así que `onFinalSegment`
descartaba todos los segmentos sin emitir una sola traza, y desde fuera se veía
exactamente igual que "el modelo no responde". Quien usa la app dictando las
preguntas necesita `me`.

Esa combinación imposible se detecta con `autoTriggerIsInert()` en
`shared/types.ts`, que usan a la vez el main (avisa por consola al arrancar la
transcripción) y el dashboard (banner rojo). Está en shared **a propósito**: la
regla tiene que decir lo mismo en los dos sitios o el aviso deja de coincidir con
el comportamiento.

El hotkey manual (`session.lastRelevantSegment()`) sigue la misma preferencia,
pero cae al otro hablante **sólo si el preferido ni se escucha**. Si sí se
escucha y todavía no ha dicho nada, no hay fallback: mandar la última línea de
otro como si fuera la pregunta es peor que dejar que el modelo la deduzca.

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
| El dashboard mostraba `llama3.2:3b` elegido y los settings guardaban `""` | Un `<select>` controlado cuyo `value` **no existe entre sus `<option>`**: el navegador pinta la primera opción como seleccionada pero **no dispara `onChange`** | Un select controlado tiene que tener siempre una `<option>` con su valor, aunque sea un hueco. Si no, la UI miente y el fallo aparece muy lejos de su causa |
| Whisper local fallaba con `Command failed` en cada intervención | `findWhisperBinary()` recorría el directorio y devolvía la **primera** coincidencia; `main.exe` ordena antes que `whisper-cli.exe` y desde whisper.cpp 1.7 es un stub de deprecación que sale con **código 1** | Buscar por prioridad del array de candidatos, nunca por orden de directorio. Y que un ejecutable exista no significa que sirva |
| Frases con "you" desaparecían del transcript | `'you'` estaba en la lista de alucinaciones y se comparaba con `includes()` | Un filtro de subcadenas necesita que las entradas sean lo bastante largas para no aparecer dentro de texto legítimo; las cortas van a comparación exacta |
| `error: input file not found 'false'` en whisper-cli | `--output-txt false`: `-otxt` es un flag booleano SIN argumento, así que `false` se tomaba por un fichero de entrada | Verificar cada bandera contra el CLI real; whisper.cpp no falla, solo lo ignora y escribe un `.txt` de más |
| Gemini Live no funcionaba y no había forma de saber por qué | `GEMINI_LIVE_MODELS` está ordenado por preferencia y este mismo documento decía que se probaba el siguiente si el primero fallaba — **pero nadie lo implementó**: el constructor cogía el `[0]` y ahí acababa | Documentar una intención no la implementa. Si CONTEXT dice que algo hace X, debe haber un test o una lectura del código que lo confirme |
| "La app dejó de responder" sin ningún error | El detector descartaba las frases **en silencio**: no había log del descarte ni del motivo | Un camino que decide no actuar necesita dejar rastro tanto como uno que falla. El `return` mudo es el peor de los dos |
| Ningún diagnóstico posible en el `.exe` empaquetado | Los `console.*` del main sólo existían arrancando desde una terminal | Si la app se usa empaquetada, el log tiene que ir a un archivo desde el primer día |
| Transcripción mediocre con los DOS motores | Sin filtro antialiasing, el contenido sobre 8 kHz se plegaba dentro de la banda de voz al decimar a 16 kHz | Que un fallo afecte por igual a dos implementaciones independientes es la señal de que está aguas arriba de ambas |
| "¿Qué tal es la idea de software?" descartada como muletilla | El filtro hacía `startsWith('que tal ')`, así que cualquier pregunta que empezara por una muletilla moría | Una lista de frases a ignorar debe compararse contra la frase ENTERA; un prefijo compartido no significa lo mismo |
| Respuesta eternamente en "Pensando…" | No había ningún tiempo límite en la generación: un proveedor colgado dejaba el estado ahí para siempre | Todo lo que espera a un proceso ajeno necesita reloj. Sin él, "lento" y "muerto" son la misma pantalla |
| Haiku 4.5 fallaba con 400 en cada pregunta | `output_config.effort` es de la generación Claude 5 y se enviaba a todos los modelos. La API lo dice claro: *"This model does not support the effort parameter"* | Un parámetro verificado contra UN modelo no está verificado para toda la familia. Ver `EFFORT_UNSUPPORTED` |
| Respuestas sin relación con lo preguntado, mezclando idiomas | `settings.language` estaba en `en` con alguien hablando español. Whisper **no falla** al forzar idioma: devuelve texto plausible inventado a partir de los sonidos (*"Are y'all gonna eat?"*) | Un ajuste cuyo error no produce ningún error tiene que estar a la vista. Por eso el idioma forzado sale ahora en la barra del overlay |
| "¿Podrías presentarte?" descartada | `MIN_WORDS = 3`, y en español abundan las preguntas completas de dos palabras | Un umbral de longitud necesita excepción cuando hay una señal inequívoca |
| El asistente olvidaba lo que él mismo había dicho | Cada consulta era un turno único: sus respuestas anteriores no volvían al modelo, y el transcript sólo contiene voz | "Contexto" y "memoria" no son lo mismo. Un transcript no es un historial de conversación |
| Gemini Live "no funcionaba" sin dejar rastro | `live.connect()` **no tiene tiempo límite**: si el handshake no llega a completarse, la promesa no resuelve ni rechaza nunca. `startTranscription` quedaba colgado, la captura seguía diciendo "Escuchando" y no había ni transcripción ni error | Lo detectó el log: `[capture] primer chunk` sin ningún `[stt] transcripción iniciada` detrás. Toda promesa de red necesita reloj, y una que cuelga es peor que una que falla |
| El timeout decía "sin respuesta en 15s" y no servía de nada | La causa **sí llegaba**: el servidor cierra el socket con `1007` y un motivo legible (*"API key not valid"*), pero **sin enviar ningún mensaje**. El SDK espera un `setupComplete` que no va a llegar y el timeout tapaba el motivo | Se comprobó abriendo el WebSocket a mano con una clave falsa. Un timeout que sustituye a un error es un parche: hay que escuchar el canal por el que llega la causa —aquí, el `onclose` |
| JSON cortado a media cadena en el audio directo | Gemini 2.5 razona por defecto y **los tokens de razonamiento se descuentan de `maxOutputTokens`**: se gastaban pensando y el JSON se truncaba | `thinkingConfig: { thinkingBudget: 0 }`. Un presupuesto de salida compartido con el razonamiento no es un presupuesto de salida |
| El botón "Copiar" de un bloque de código no hacía nada | `navigator.clipboard.writeText()` exige que el documento tenga el **foco**, y el overlay es `focusable: false` a propósito para no robárselo a la videollamada: rechazaba siempre con *"Document is not focused"*. Y el `.then()` sin `.catch()` se tragaba el rechazo | Dos lecciones. Una: en el overlay, cualquier API del navegador que dependa del foco está descartada por diseño, no por casualidad — se hace desde el main (`clipboard.writeText`), que además se salta el `setPermissionRequestHandler` que sólo concede `clipboard-read`. Otra: una promesa sin `catch` en un manejador de click convierte un error en "no pasa nada", que es el síntoma más caro de diagnosticar |
| ~1,3 s fijos por turno en Whisper local | `whisper-cli` **carga el modelo en cada invocación**: tarda lo mismo con 1,7 s que con 8,2 s de audio | Medir el coste contra el tamaño de la entrada delata al instante lo que es fijo y lo que es proporcional |

Dos reglas del tooling encontraron cosas reales, no ruido:
`noUncheckedIndexedAccess` (desestructurar `getPosition()`, que devuelve
`number[]`, no una tupla) y `preserve-caught-error` (re-lanzar sin `cause`).
La regla `set-state-in-effect` de eslint ha encontrado **dos** condiciones de
carrera reales (el selector de modelos y el sondeo de Ollama); merece la pena
tratar sus avisos como bugs y no como pedantería.

### Los clics sintéticos NO sirven para probar el overlay

Vale la pena dejarlo escrito porque casi provoca un "arreglo" de código sano.

Al verificar el botón del engranaje con `SetCursorPos` + `mouse_event` desde
PowerShell, **el click no llegaba nunca**, ni siquiera con los clics
atravesables desactivados. La conclusión tentadora era que el mecanismo de
hover estaba roto. Era falso: probado a mano con un ratón real, **funciona**.

La causa es que la entrada sintética no reproduce fielmente el camino de
mensajes que Electron reenvía con `forward: true` hacia una ventana con
`focusable: false` (`WS_EX_NOACTIVATE`).

**Regla práctica:** las capturas de pantalla sirven para verificar que el
overlay *renderiza* y que el stealth funciona, pero **la interacción con el
ratón sobre el overlay hay que probarla a mano**. Si un click sintético falla,
la hipótesis por defecto debe ser el arnés de pruebas, no el código.

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
- **Whisper local end-to-end**: los assets **ya están descargados** y se
  comprobó, ejecutándolo, que `whisper-cli.exe` transcribe un WAV generado a
  mano con la lista de argumentos exacta que usa la app, y que
  `findWhisperBinary()` elige `whisper-cli.exe` y no el stub `main.exe`. Lo que
  sigue sin probarse es la cadena completa con voz real: VAD → turno → texto.
- **Ollama**: el servidor **sí corre** ahora, con `llama3.2:3b`. Lo verificado es
  el listado de modelos; el streaming de tokens sobre una pregunta real no.
- **Gemini Live sigue sin probarse contra la API real.** El fallback de modelo
  está implementado y hay un botón "Probar" en Diagnóstico que abre una sesión
  de verdad, pero requiere la API key del usuario. Hasta que alguien lo pulse,
  **no sabemos qué modelo Live acepta la cuenta** — sólo que ya no se falla en
  silencio sobre el primer candidato.
- **El modo código contra una pantalla real.** Lo cubierto por tests es lo que se
  puede cubrir sin clave: que `coding` sustituye las reglas de formato, que el
  perfil forzado no toca los ajustes, y el parser de vallas con su caso de
  streaming. Lo que falta es el bucle entero —captura de un LeetCode de verdad →
  modelo con visión → solución que compile—, que necesita API key y una prueba a
  ojo. Lo primero que hay que mirar ahí es si a calidad 92 el modelo lee bien la
  **firma** del método: es el fallo silencioso del modo, porque una respuesta
  perfecta sobre una firma mal leída no se distingue de una buena hasta que el
  evaluador la rechaza.
- **La prueba en una videollamada real** (Meet / Teams / Zoom / OBS). La
  verificación se hizo con captura GDI/BitBlt.
  `WDA_EXCLUDEFROMCAPTURE` cubre también las rutas DXGI y Windows Graphics
  Capture que usan esas apps, **pero conviene confirmarlo**. Es la prueba de la
  fase 1 que queda pendiente, y la más importante de todas.

---

## 9. Cabos sueltos concretos

Cosas que existen a medias. No son bugs; son trabajo no terminado, y está mejor
escrito aquí que descubierto por sorpresa.

- **`resizeOverlay` no lo llama nadie.** El handler y el preload existen; la idea
  era que el overlay se ajustara a la altura de la respuesta. Ahora que la
  pestaña de escritura cambia la altura útil del panel, es más visible que antes.
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

**Interacción con el overlay (a mano, sin excepción):** arrastrar por la barra,
pulsar el engranaje y pulsar la X — con los **clics atravesables activados**,
que es el caso difícil. Los clics sintéticos no valen aquí (ver §6).

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

---

## 12. Build and release automation

Two GitHub Actions workflows live under `.github/workflows/`:

- **`ci.yml`** runs on every `push` and `pull_request` in Windows. It runs
  `npm ci`, typecheck, lint and tests, then builds only the portable target via
  `npm run build:portable` (`electron-builder --win portable`). The `.exe` is
  available as a run artifact for 30 days. `build:win` remains available for a
  local NSIS installer build.
- **`release.yml`** runs on pushes to `main`. Release Please reads Conventional
  Commits and opens or updates a release PR. Once that PR is merged, it updates
  `package.json`, `package-lock.json`, `CHANGELOG.md` and the versions manifest,
  then creates the tag, GitHub Release and its generated change notes.

When Release Please creates a release, a Windows runner rebuilds the portable
from **that tag** and attaches two files to the Releases page:
`Audio Helper-<version>-portable.exe` and a `.zip` containing that same
executable. The CI artifact is deliberately not reused, so the published binary
always belongs to the versioned commit.

Version bumps require Conventional Commits on `main`: `fix:` bumps patch,
`feat:` bumps minor, and `feat!:` (or `BREAKING CHANGE`) marks a breaking
change. The base version is tracked in `.release-please-manifest.json`; do not
manually edit it except for an intentional bootstrap.

### Lo que costó la primera publicación de verdad

Los dos workflows estaban bien escritos desde el principio y **aun así el
repositorio pasó semanas sin un solo release**, con los runs en verde. Tres
trampas encadenadas, las tres silenciosas:

1. **Ningún commit de `main` seguía Conventional Commits.** El historial entero
   era `Workflow added`, `Controles en el overlay…`. Release Please busca
   `feat:`/`fix:`, no encuentra nada que publicar, y **termina correctamente**.
   Verde y sin resultado, que es el peor tipo de fallo.
2. **GitHub prohíbe por defecto que Actions cree pull requests.** Con esa opción
   apagada, release-please calcula la versión, genera el CHANGELOG, crea la
   rama y el commit... y muere en el último paso con
   `GitHub Actions is not permitted to create or approve pull requests`. Se
   arregla en Settings → Actions → General → Workflow permissions.
3. **Release Please identifica su PR por una etiqueta que pone él.** Al crearla
   a mano para desbloquear la publicación, al fusionarla no la reconoció como
   release: no creó el tag y se puso a calcular la versión siguiente. Si alguna
   vez hay que desbloquearlo a mano, es mejor crear el tag y el release
   directamente que falsificar su PR.

De ahí salió **`publish.yml`**: reconstruye y publica el `.exe` de un tag que ya
existe, sólo por `workflow_dispatch`. Crear un *release* sí está permitido con
`contents: write` —lo único bloqueado son las PRs—, así que no depende de
ninguna configuración del repositorio. **No** se engancha a `push: tags` a
propósito: con `release.yml` funcionando, ambos compilarían el mismo binario en
paralelo, unos ocho minutos de runner de Windows para nada.

**El formato del tag tiene que coincidir en los dos sitios.**
`include-component-in-tag: false` deja los tags en `v{version}`. Sin eso,
release-please los nombraba `interview-helper-v{version}`, no reconocía como
publicado un tag `v0.2.0` creado a mano, y volvía a empaquetar todo lo anterior
en la versión siguiente.
