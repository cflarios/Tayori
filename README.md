# Interview Helper

Asistente de IA en tiempo real para reuniones y entrevistas. Escucha la llamada,
transcribe quién dice qué, y sugiere respuestas en un overlay que **no aparece
cuando compartes pantalla**.

Open source, MIT, sin monetización. Todo corre en tu máquina y las llamadas van
directas al proveedor de IA que elijas — no hay servidor intermedio.

**No guarda audio, pero sí guarda texto.** Los fragmentos de audio van al motor
de transcripción y se descartan en el acto: **nunca se escribe un archivo de
audio**, ni siquiera temporal. Lo que sí se guarda, si dejas activo el historial,
es el **texto**: las respuestas del asistente y la transcripción de la
conversación, incluido lo que dijo la otra persona. Van a un JSON por
conversación en tu carpeta de datos, en tu máquina, y no se envían a ningún
sitio.

El historial se puede **apagar entero** desde el dashboard → *Historial de
conversaciones*. Con el interruptor apagado nada toca el disco y la app vuelve a
comportarse como antes: escucha y olvida. Ahí mismo puedes ver la ruta exacta,
borrar una conversación o borrarlas todas.

## Qué hace

- **Escucha dos fuentes por separado**: tu micrófono y el audio del sistema. Eso
  permite saber quién habla sin diarización.
- **Transcribe en vivo** con Gemini Live (~300 ms) o Whisper local (offline).
- **Sugiere respuestas** con Claude, Gemini u Ollama, en streaming.
- **Detecta preguntas** dirigidas a ti y responde sin que pulses nada, o solo con
  hotkey si prefieres controlarlo.
- **Adjunta capturas de pantalla** como contexto visual para preguntas sobre
  código o diagramas en pantalla.
- **Resuelve el código que tengas delante**: `Ctrl+Alt+C` lee la pantalla —un
  ejercicio de LeetCode, un test que falla, un stack trace— y devuelve la
  solución completa en un bloque que se copia de un clic.
- **Responde cuestionarios**: `Ctrl+Alt+Q` lee la pregunta de test que haya en
  pantalla y da la opción correcta en la primera línea. Si no lo tiene claro lo
  dice, porque en un examen con penalización hay que saber si arriesgas.
- **Se oculta de la captura de pantalla**, con un switch para volverlo visible.

## Requisitos

- Windows 10 versión 2004 o superior (Windows 11 recomendado).
- Node.js 20+ y npm, solo para compilar desde el código.
- Al menos una API key: [Anthropic](https://console.anthropic.com) o
  [Google AI Studio](https://aistudio.google.com). Ollama y Whisper local no
  necesitan ninguna.

## Instalación

```bash
npm install
npm run dev
```

Para generar un instalador y un ejecutable portable (~98 MB cada uno):

```bash
npm run build:win
```

Los artefactos quedan en `release/`. **Si el proyecto está dentro de OneDrive,
Dropbox o similar**, el script los saca automáticamente a
`%LOCALAPPDATA%\InterviewHelper-release` y avisa por consola: OneDrive mantiene
un lock sobre la carpeta y electron-builder falla con `EPERM` al desempaquetar
Electron. Puedes forzar otra ruta con la variable `IH_BUILD_OUT`.

El binario no está firmado, así que Windows SmartScreen avisará la primera vez:
"Más información" → "Ejecutar de todas formas".

## Primeros pasos

1. Arranca la app. Aparece solo el overlay, arriba a la derecha.
2. Pulsa el **engranaje** de su barra superior para abrir la configuración. Es
   la única forma de abrirla: no hay atajo ni se abre sola. Arriba del todo hay
   una guía de **primeros pasos** con las cuatro cosas que hay que hacer; se
   marca sola según las completas y desaparece al terminar.
3. Pega tu API key de Anthropic o de Google.
4. Elige **qué se escucha**. Por defecto son ambas fuentes; si prefieres que el
   asistente no procese tus propias respuestas, cambia a *Solo la salida del
   sistema*.
5. En **Contexto**, añade tu CV y la descripción del puesto. Esto es lo que
   evita que el modelo invente experiencia que no tienes, y además mejora el
   reconocimiento de nombres propios y siglas.
6. Pulsa **Empezar a escuchar** y comprueba que los medidores se mueven.

### Manejar el overlay

Todo lo que se usa a mitad de una llamada está en la barra superior, sin abrir la
configuración:

- **Escuchar / Escuchando**: empieza y para la escucha. Si algo falla, el botón
  pasa a «Reintentar» y su tooltip dice qué pasó.
- **Yo / Ellos**: qué fuentes se escuchan. Pulsa para apagar tu micrófono y dejar
  sólo la salida del sistema, o al revés. La barra de cada chip es el nivel real
  de entrada, y si un chip se pone **ámbar** significa que esa fuente está
  configurada pero **no llegó a abrirse** — revisa el dispositivo o los permisos.
  Es el aviso que distingue "no se oye nada" de "no se está escuchando".
- **`</>`**: resolver el código de la pantalla.
- **Plegar**: modo compacto, deja sólo la respuesta. Esconde los perfiles, la
  transcripción y el pie de atajos.
- **`‹ 2/5 ›`**: junto a «Sugerencia», para volver a respuestas anteriores sin
  abrir el historial. Mientras estés mirando una antigua no aparecen las
  acciones rápidas: dicen «tu última respuesta» y la última para el modelo es la
  suya, no la que tengas delante.
- **Moverlo**: arrastra la barra superior con el botón izquierdo, o usa
  `Ctrl+Alt+flechas`.
- **Configuración**: el botón del engranaje.
- **Cerrar la app**: la **X**. Para ocultarla temporalmente sin cerrarla,
  `Ctrl+Shift+H`.

Los botones de la barra funcionan aunque tengas activados los *clics
atravesables*: el overlay deja de ignorar el ratón mientras el cursor está sobre
la barra, y vuelve a dejarlo pasar en cuanto sales.

## Atajos de teclado

Todos son globales: funcionan aunque la ventana de la videollamada tenga el foco.

| Atajo | Acción |
|---|---|
| `Ctrl+Enter` | Responder ahora |
| `Ctrl+Shift+S` | Capturar pantalla y responder |
| `Ctrl+Alt+C` | Resolver el código que hay en pantalla |
| `Ctrl+Alt+Q` | Responder el test que hay en pantalla |
| `Ctrl+Shift+H` | Mostrar u ocultar el overlay |
| `Ctrl+Shift+M` | Empezar o parar de escuchar |
| `Ctrl+Shift+C` | Alternar clics atravesables |
| `Ctrl+Alt+←↑→↓` | Mover el overlay |

La configuración **no tiene atajo** a propósito: se abre solo con el engranaje
del overlay.

**Todos se pueden cambiar** desde el dashboard → *Atajos de teclado*: pulsa el
campo y teclea la combinación. Si Windows rechaza alguno porque otra aplicación
lo tiene tomado, aparece marcado en rojo — importa, porque un atajo tomado no da
ningún error: simplemente no hace nada.

## Las dos acciones de pantalla

`Ctrl+Alt+C` resuelve **código** y `Ctrl+Alt+Q` responde **tests**. Comparten
todo el camino —captura de alta calidad, perfil propio, modelo con visión— y se
separan sólo en cómo responden, porque un algoritmo y una pregunta de opción
múltiple no se contestan igual. Los dos tienen su botón en la barra del overlay.

En el modo test, la primera línea es la respuesta y nada más: la letra y el
texto de la opción. Si el modelo no está seguro, esa línea empieza por `DUDA:` y
da igualmente su mejor opción — en un examen con penalización por fallo, una
respuesta insegura disfrazada de segura es peor que ninguna.

### Con qué modelo

Puedes usar **uno distinto** del que responde a lo que se habla:
*dashboard → Modelo para la pantalla*. Las dos tareas piden cosas opuestas —
conversar necesita latencia, leer una captura necesita vista y cabeza — así que
una combinación razonable es un modelo local pequeño para hablar y uno grande
para la pantalla, o al revés si te preocupa que las capturas salgan de tu
máquina. Por defecto se usa el mismo para todo, como antes.

**Tiene que admitir imágenes.** Si eliges uno sin visión, los dos botones fallan
con un aviso en lugar de inventarse el enunciado. El dashboard marca cuáles ven
imágenes y avisa antes de que lo descubras a mitad de examen.

## Modo código

`Ctrl+Alt+C` captura la pantalla y devuelve la solución del problema de
programación que haya en ella. Está pensado para lo que tienes delante en una
prueba técnica: un enunciado de LeetCode o HackerRank, un editor con la firma a
medias, un test en rojo o un stack trace.

Qué lo diferencia de `Ctrl+Shift+S` (capturar y responder):

- **Otras reglas de salida.** El resto de la app está afinada para respuestas de
  cuatro viñetas que se leen en voz alta. Aquí eso sobra: devuelve el enfoque con
  su complejidad en una línea, el código **completo** en un bloque, y como mucho
  tres apuntes. El tope de tokens sube en consecuencia.
- **No necesita audio.** Funciona con la escucha parada, que es el caso normal
  cuando estás resolviendo un ejercicio y no hay ninguna llamada abierta. Si hay
  transcripción, se envía como contexto secundario.
- **No cambia tu perfil.** Puedes estar en «Entrevista» y pulsarlo: sólo esa
  consulta usa el modo código, y la siguiente pregunta hablada vuelve a salir en
  viñetas. Si quieres que todo sea código, está el chip **Código** del overlay.
- **La captura se envía con más calidad.** A la calidad normal, el JPEG se come
  la diferencia entre `l` y `1`, y una firma mal leída da una solución que no
  compila.

El código sale en un bloque con botón **Copiar**, en monoespaciada y con scroll
horizontal: las líneas largas no se parten, porque una expresión partida se lee
como otra cosa.

El lenguaje se deduce de lo que se vea seleccionado en la pantalla. Si prefieres
fijarlo (o el enunciado está en blanco), hay un campo en el dashboard →
*Lenguaje del modo código*.

El botón `</>` de la barra del overlay hace exactamente lo mismo que el atajo.

## El modo invisible: qué protege y qué no

Esta es la parte que conviene entender bien antes de confiar en ella.

En Windows, el modo invisible llama a `SetWindowDisplayAffinity` con
`WDA_EXCLUDEFROMCAPTURE`. El compositor del sistema (DWM) omite la ventana al
construir el buffer de captura, así que **no aparece** en:

- Compartir pantalla de Google Meet, Microsoft Teams, Zoom, Discord y similares.
- Grabadores como OBS con "Display Capture".
- La herramienta de recorte de Windows y las capturas de la propia app.

**No te protege de:**

- Una **cámara** apuntando a tu pantalla.
- Software de **proctoring o monitorización** que enumere procesos o ventanas
  abiertas. El proceso es visible en el Administrador de tareas (ver abajo).
- Lo que **digas por el micrófono**. Si lees la sugerencia en voz alta, se oye.
- Alguien mirando por encima de tu hombro.

Requiere Windows 10 2004 o superior. En versiones anteriores el sistema degrada
a `WDA_MONITOR` y la ventana sale como un **rectángulo negro** — más llamativo
que no ocultarla. Verifica tu versión con `winver` antes de confiar en esto.

### Presencia en Windows: barra de tareas y Administrador de tareas

Ni el overlay ni la ventana de configuración aparecen en la **barra de tareas**.
La configuración se recupera con el engranaje del overlay; el overlay, con
`Ctrl+Shift+H`.

En el build empaquetado, el proceso se llama **Audio Helper**, no "Interview
Helper", así que un vistazo casual al Administrador de tareas no lo delata (sus
subprocesos se agrupan bajo ese nombre, igual que cualquier app de Electron
como Slack o VS Code). Esto es **cosmético, no ocultamiento**:

- En la pestaña **Detalles** se ve la ruta del `.exe`.
- Un software de **proctoring** que enumere procesos o compare firmas/binarios
  lo detecta sin importar el nombre.
- En **modo desarrollo** (`npm run dev`) el proceso siempre es "Electron".

Ocultar de verdad el proceso del Administrador exigiría técnicas de rootkit
(driver de kernel, hooking de `taskmgr.exe`) que son indistinguibles de malware,
las marca el antivirus y pueden desestabilizar el sistema. **No se implementan
a propósito.** El nombre se cambia en `electron-builder.yml` (`productName` /
`executableName`) si prefieres otro.

## Latencia y privacidad: el compromiso

| Motor | Latencia | Dónde va el audio |
|---|---|---|
| Gemini Live | ~300 ms | A Google |
| Gemini audio directo | ~1–2 s, pero **sustituye también la llamada al modelo** | A Google |
| Whisper local | ~0,8–1,5 s | A ningún sitio |

**Gemini audio directo** no transcribe y luego pregunta: manda tu voz al propio
modelo, que devuelve transcripción y respuesta a la vez. Una transcripción mala
deja de poder estropear la respuesta, porque el modelo oye lo que dijiste en
lugar de leer lo que otro entendió. A cambio, el audio sale de tu máquina.

### Modelos locales: cuál le pega a tu equipo

El dashboard mide tu RAM, tu CPU y tu GPU y recomienda dos modelos: uno para
conversar y otro para leer la pantalla, con el comando `ollama pull` listo para
copiar. Elegir a ciegas cuesta una descarga de varios gigas para acabar con
respuestas de un minuto.

Lo que **no** hace es estimar la VRAM de la tarjeta gráfica, que es el dato que
de verdad decide si un modelo va rápido: no hay forma fiable de leerla desde la
app, y dar una cifra inventada sería peor que no darla. Si el modelo no cabe en
la GPU, Ollama lo reparte con la CPU y la velocidad se desploma aunque quepa en
memoria.

### Ollama recorta el contexto sin avisar

Ollama **no usa la ventana de contexto del modelo**: aplica la suya, 2048
tokens por defecto, y lo que no cabe lo descarta por el principio **sin ningún
error**. Con el CV, la transcripción y la memoria de la conversación, esos 2048
se agotan enseguida, y el síntoma es que el modelo olvida lo que le acabas de
decir. Se ajusta en *dashboard → Transcripción → Ventana de contexto de Ollama*;
por defecto la app pide 8192.

Relacionado: el overlay muestra un chip **`memoria n/8`** junto a «Sugerencia»
con los intercambios que el asistente reenvía en cada consulta. Se pulsa para
que los olvide, y **no** es lo mismo que «nueva conversación»: la transcripción
y el historial se quedan como están.

Whisper local descarga el binario oficial de whisper.cpp (7,6 MB) y un modelo
GGML (74–465 MB según el que elijas) la primera vez que lo activas. No usa un
binding nativo de Node a propósito: eso exigiría Visual Studio Build Tools y
recompilar en cada actualización de Electron.

Combinado con Ollama, la app funciona **completamente sin conexión**.

## Arquitectura

```
Overlay (transparente, always-on-top, excluido de la captura)
Dashboard (ventana normal: keys, providers, contexto)
Audio Worker (ventana oculta: getUserMedia + getDisplayMedia → PCM16 16 kHz)
                              ↓ IPC
main: SessionOrchestrator → STTProvider → TranscriptBuffer
                                    ↓
                          QuestionDetector → AnswerEngine → LLMProvider
```

Todo secreto y toda llamada de red viven en el proceso main. El renderer nunca
ve una API key: solo recibe un booleano de "está configurada o no". Las keys se
guardan cifradas con `safeStorage` (DPAPI en Windows), atadas a tu cuenta de
usuario de Windows.

### Añadir un proveedor

Implementa la interfaz y añade una entrada al factory. Nada más cambia:

- **LLM**: `src/main/llm/types.ts` → un archivo nuevo → `src/main/llm/index.ts`
- **Transcripción**: `src/main/stt/types.ts` → un archivo nuevo → `src/main/stt/index.ts`

Los factories usan un `never` exhaustivo, así que añadir un id al tipo sin
implementarlo rompe el build en lugar de fallar en ejecución.

## Desarrollo

```bash
npm run dev         # app en modo desarrollo con HMR
npm run typecheck   # tsc en los dos proyectos (node y web)
npm run lint        # eslint
npm test            # vitest — lógica pura: buffer, detector, VAD
npm run build:win   # instalador NSIS + portable
```

## Builds y releases

GitHub Actions ejecuta typecheck, lint, tests y genera el `.exe` portable en
cada push. El archivo queda disponible durante 30 días como artefacto del run.

Las publicaciones se gestionan con Release Please: al fusionar en `main` un
commit con formato [Conventional Commits](https://www.conventionalcommits.org/)
(`fix:`, `feat:`, `feat!:`, etc.), crea o actualiza una PR de release. Al
fusionarla, actualiza la versión, `CHANGELOG.md`, crea el GitHub Release y le
adjunta `Audio Helper-<versión>-portable.exe` junto a un `.zip` con el ejecutable.

## Consideraciones legales

Hay tres cosas distintas aquí, y conviene no mezclarlas:

**1. Grabación.** La app no graba audio en ningún caso. Pero con el historial
activo **sí almacena la transcripción** de lo que dijo la otra persona, y en
varias jurisdicciones un registro escrito de una conversación cuenta igual que
una grabación a efectos de las normas de consentimiento (de una o de todas las
partes, según el sitio). Si eso te afecta, **apaga el historial** en el
dashboard: entonces sí es cierto que no queda nada.

**2. Dónde va el audio.** Con Gemini Live, el audio de la reunión se envía a
Google para transcribirlo. Con **Whisper local + Ollama** no sale nada de tu
máquina.

**3. Dónde vives esa conversación.** Muchas empresas restringen el uso de
asistentes de IA en sus procesos de selección, con independencia de lo que
guardes o dejes de guardar. Esto aplica con más motivo al modo código: las
plataformas de evaluación técnica suelen prohibirlo explícitamente en sus
condiciones, y varias detectan pegado masivo aunque no vean la ventana.

Comprueba qué aplica en tu caso; la responsabilidad de usar esto es tuya.

## Documentación

Tres archivos, con trabajos distintos:

| | Responde a | Ábrelo cuando |
|---|---|---|
| README.md | Qué hace y cómo se usa | Quieres ejecutarlo |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Qué es y cómo circulan los datos, con diagramas | Vas a tocar código y no sabes dónde |
| [CONTEXT.md](CONTEXT.md) | Por qué está así: qué se probó, qué se descartó y qué salió mal | Algo te parece raro y vas a "arreglarlo" |

El tercero es el que más ahorra: buena parte de lo que registra son cosas que
**parecen** errores y no lo son, con la medición o el mensaje de error que lo
demuestra.

## Licencia

MIT.
