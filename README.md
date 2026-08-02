# Tayori

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
`%LOCALAPPDATA%\Tayori-release` y avisa por consola: OneDrive mantiene
un lock sobre la carpeta y electron-builder falla con `EPERM` al desempaquetar
Electron. Puedes forzar otra ruta con la variable `IH_BUILD_OUT`.

El binario no está firmado, así que Windows SmartScreen avisará la primera vez:
"Más información" → "Ejecutar de todas formas".

## Configuración guiada

La primera vez que abres el dashboard sale un asistente que lo deja todo
funcionando sin que tengas que saber qué es un proveedor ni cuánta RAM tienes.
Mide tu equipo y te propone uno de dos caminos:

- **En la nube.** Eliges Claude o Gemini, pegas la API key y listo. Nada que
  instalar. Pagas por uso al proveedor.
- **En tu equipo.** Si no tienes Ollama, lo instala con `winget` —el gestor de
  paquetes de Windows, con su aviso de permiso— y descarga los dos modelos que
  le pegan a tu hardware: uno para conversar y otro para leer la pantalla.

Después resuelve la transcripción (Gemini Live si tienes clave de Google, o
Whisper local, que descarga solo) y te ofrece pegar el CV, que es lo que separa
una respuesta correcta de una tuya.

Nada se instala ni se descarga sin que lo pidas: cada acción va detrás de un
botón que dice antes qué va a hacer. Puedes salir en cualquier momento y
configurarlo a mano, y volver a llamarlo desde **Configuración guiada**, al pie
de la barra lateral.

Si tu equipo no tiene `winget`, el asistente **no** se descarga ningún
ejecutable por su cuenta: te manda a ollama.com y detecta la instalación cuando
vuelvas.

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

El modo test responde **todas las preguntas que se vean**, una línea por
pregunta y nada más: el número, la letra y el texto de la opción. Sin
explicaciones — con el examen delante lo que hace falta es la respuesta.

Dos marcas que sí aparecen, porque cambian lo que haces con ellas:

- **`DUDA:`** al principio de una línea significa que el modelo no está seguro,
  y da igualmente su mejor opción. En un examen con penalización por fallo, una
  respuesta insegura disfrazada de segura es peor que ninguna.
- **`NO SE VE:`** significa que de esa pregunta no se leían todas las opciones en
  la captura. Repite el disparo con la pregunta entera a la vista.

El porqué no desaparece: con la respuesta en pantalla salen los botones
**¿Por qué?**, **Las descartadas** y **Revisa las dudas**, que lo piden cuando
lo quieres.

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

### Un modelo que no está en la lista

Los desplegables de Claude y de Gemini traen los modelos que la app conoce, y esa
lista envejece con cada versión. Si tu cuenta tiene acceso a otro, elige
**«Otro…»** y escribe su id: se guarda tal cual y se usa como cualquiera de la
lista. Un id inventado no falla al guardarlo, falla en la primera pregunta, así
que confírmalo con **Probar conexión**.

Con **Ollama no aparece esa opción**, a propósito: ahí la lista no es un catálogo
nuestro sino lo que tu servidor local dice tener descargado, y escribir el nombre
de un modelo que no está instalado no lo instala.

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

## Espejo en el móvil

El modo invisible resuelve "que no salga en la grabación". No resuelve el caso
de **compartir la pantalla entera**: lo que hay en tu monitor está, por
definición, al otro lado — y tampoco cubre una cámara ni un segundo monitor que
alguien pueda mirar.

El espejo saca las respuestas de la pantalla compartida del todo: tu ordenador
sirve una página a un navegador de tu teléfono, en tu propia red. Se enciende en
**Ajustes → Espejo en el móvil**, se escanea el QR y ya está.

| | |
|---|---|
| Qué se manda | Las respuestas y si la escucha está activa |
| Qué **no** se manda | La transcripción — lo que dijo la otra persona no se duplica en un segundo dispositivo |
| Por dónde viaja | Tu red local, servido por tu propio equipo. Sin nube, sin cuenta, sin salir a internet |
| Cuándo está vivo | Sólo con la app abierta y el interruptor encendido |

Dos interruptores, y **los dos empiezan apagados**:

- **Encender el espejo.** Abre el servidor y genera el enlace y el QR.
- **Permitir acceso desde la red local.** Sin esto sólo escucha en `127.0.0.1`,
  o sea que sólo puede conectarse este mismo ordenador (sirve para probarlo, o
  para un túnel SSH). Un teléfono necesita esto encendido.

Lo que hay que tener claro antes de usarlo:

- El enlace lleva un **token que cambia en cada arranque**. Un enlace guardado
  en el móvil deja de valer solo — pero **mientras el espejo esté encendido,
  quien tenga ese enlace y esté en tu red puede leer tus respuestas**. En una
  red de invitados o de oficina, eso es una decisión, no un detalle.
- La primera vez, Windows puede pedirte permiso del **firewall**. Sin
  concederlo, el teléfono no conecta.
- Si tu equipo tiene varias direcciones de red (VPN, Docker, VirtualBox), el
  dashboard elige la que el sistema usa para salir y **enseña las demás** por si
  acierta mal.

## MQTT: mandar las respuestas a otro cacharro

Con esto encendido, cada respuesta **terminada** se publica en un broker MQTT
para que la recoja otra cosa: un ESP32, un script, un Home Assistant. Se
configura en **Ajustes → MQTT**.

Se publica en dos temas, porque son dos consumidores distintos:

| Tema | Contenido |
|---|---|
| `<tu-tema>` | JSON con `id`, `trigger`, `question`, `answer`, `providerId`, `model` y `at` |
| `<tu-tema>/text` | Sólo el texto de la respuesta, en crudo |

El segundo existe para los microcontroladores: te suscribes y lees la respuesta
sin meter un parser de JSON en la placa.

```cpp
// ESP32, con PubSubClient
client.subscribe("tayori/answer/text");
// callback(topic, payload, length) → payload es la respuesta, tal cual
```

Detalles que conviene saber antes de montarlo:

- **Sólo respuestas completas.** Nada de los fragmentos del streaming: llega un
  mensaje por respuesta, cuando está entera.
- **Ni errores ni respuestas canceladas.** Tu dispositivo no puede distinguir un
  fallo de una respuesta, así que no se le mandan.
- **QoS 1 y sin retener.** No se pierde la respuesta, y una placa que arranca
  por la mañana no ejecuta la del día anterior.
- **La transcripción no se publica.** Lo que dijo la otra persona no sale por
  aquí.
- **La contraseña del broker** se guarda cifrada con DPAPI, igual que las API
  keys.

**Esto saca tus respuestas de la app.** Si el broker está en internet, el texto
sale de tu red; si está en tu LAN, cualquiera con acceso al tema puede leerlo.
Un broker sin usuario ni TLS es un tablón de anuncios — usa `mqtts://` fuera de
tu red.

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

### Qué modelo usar: la tarjeta y la guía

El dashboard mide tu RAM, tu CPU y tu GPU y recomienda dos modelos: uno para
conversar y otro para leer la pantalla, con el comando `ollama pull` listo para
copiar. Elegir a ciegas cuesta una descarga de varios gigas para acabar con
respuestas de un minuto.

Al lado hay un botón, **Abrir la guía**, que genera un documento para tu equipo
y lo abre en el navegador. Ahí está lo que no cabe en una columna de ajustes:

- Todos los modelos locales por tramo de memoria, con lo que ocupa cada
  descarga y la RAM que conviene tener libre.
- Los **multimodales** —los únicos que pueden leer tu pantalla— por separado,
  porque es el error más caro: elegir uno de texto deja los dos botones muertos.
- Los de pago ordenados por precio, con las cifras de Anthropic verificadas
  contra su referencia y fechadas.
- **Cuánto cuesta de verdad una pulsación de pantalla**: una captura ronda los
  4.800 tokens de entrada, así que sale por céntimos incluso con el modelo caro.
  Lo que suma no es eso, es la escucha automática.
- Cuatro combinaciones cerradas, de «todo local y gratis» a «sin concesiones».

El documento se escribe en tu carpeta de datos y no se envía a ningún sitio.

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

**2 bis. El espejo en el móvil** añade una salida más, aunque no salga de tu
red: con él encendido, las respuestas se sirven por HTTP a cualquier dispositivo
de tu red local que tenga el enlace. No incluye la transcripción, el enlace
caduca al apagarlo, y empieza apagado — pero mientras esté encendido es una
copia de tus respuestas fuera de la ventana protegida.

**2 ter. MQTT** va más lejos que las dos anteriores: un broker puede estar en
internet, así que con esto encendido el texto de tus respuestas puede salir de
tu máquina y de tu red. Tampoco incluye la transcripción, y también empieza
apagado.

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
