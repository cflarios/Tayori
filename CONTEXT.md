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

**Y la tercera es MQTT.** Publica las respuestas terminadas en un broker para
que las recoja otra cosa —el caso que lo motivó es un ESP32 suscrito al tema que
reacciona a las respuestas de un test—. Es la salida **más lejos** de las tres:
el espejo del móvil no sale de tu red por construcción, pero un broker puede
estar en internet, así que esto puede sacar el texto de tus respuestas de la
máquina y de la red. Apagado por defecto, con la advertencia en la propia
sección, y **sólo respuestas**: la transcripción no se publica, por lo mismo de
siempre.

**Agosto de 2026: el espejo del móvil es la segunda salida**, y se anota aquí
por la regla del final de este apartado. Sirve las **respuestas** —no la
transcripción— por HTTP a la red local del usuario. No toca el disco y no sale
de su red, pero mientras está encendido existe una copia del texto fuera de la
ventana protegida, así que cuenta como salida y el README lo dice en
«Consideraciones legales». La transcripción se dejó fuera **a propósito**: es lo
que dijo la otra persona, y duplicarla en un segundo dispositivo por comodidad
no lo había pedido nadie. Si algún día se añade, se vuelve a tocar el README y
este apartado en el mismo commit.

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
- **El interruptor de escucha.** Es el control más usado de la app y vivía sólo
  en el dashboard y en `Ctrl+Shift+M`. Fallaba el propio criterio de esta lista:
  para empezar a escuchar había que abrir la ventana que roba el foco. Ahora el
  indicador **es** el mando —el punto verde ya estaba ahí, sólo que no se podía
  pulsar—, porque dos elementos separados para "qué pasa" y "cámbialo" cuestan
  sitio en una barra que va justa. El estado de error también se pulsa: reintenta.
- **Las dos fuentes de audio, como interruptores.** Sustituyen a los medidores de
  sólo lectura y responden a dos preguntas distintas que antes estaban repartidas
  entre el overlay y el dashboard: *qué se supone que se escucha* (el chip
  encendido) y *qué está entrando de verdad* (la barra moviéndose). El tercer
  estado es el que no existía en ninguna parte y es el importante: **configurado
  pero sin abrirse** — chip en ámbar. Un micrófono que el sistema no concedió
  producía exactamente la misma pantalla que una sala en silencio.
  Apagar la última fuente activa no se ignora en silencio: se explica que para
  no escuchar nada está el botón de escucha. Un control que no hace nada al
  pulsarlo es indistinguible de uno roto.
- **Con qué modelo se está respondiendo**, junto al título "Sugerencia". Al leer
  una respuesta floja lo primero que se quiere saber es con qué salió, y con tres
  proveedores configurables es fácil creer que estás en uno y estar en otro.
- **Parar la generación.** `ask.abort` existía en el IPC desde el principio y no
  tenía ningún botón: la única forma de cortar una respuesta era preguntar otra
  cosa, que es una manera cara de decir "para".
- **Historial de respuestas, con flechas.** Una respuesta la borraba la
  siguiente y sólo se recuperaba abriendo el dashboard. El overlay guarda las
  últimas 20 y las navega. Dos detalles que no son evidentes: la lista se
  actualiza **por id**, porque `answer` se emite en cada tick del streaming y si
  no se acumularían decenas de copias de la misma; y mientras se mira una
  antigua **desaparecen las acciones rápidas**, porque esos prompts dicen "tu
  última respuesta" y la última para el modelo es la suya, no la que hay en
  pantalla — ofrecerlas ahí prometería actuar sobre lo que se lee y actuaría
  sobre otra cosa.
- **Escala de texto sólo para el contenido.** Los cuatro presets agrandan la
  ventana, no la letra, así que en un 4K el panel crecía y el texto seguía
  minúsculo. `--font-scale` multiplica respuesta, código y transcripción; la
  barra y los chips se quedan fijos, porque unos controles al 180 % dejarían el
  panel sin sitio para lo que se quería leer.
- **Modo compacto.** Pliega lo que sirve para *preparar* o *comprobar* —perfiles,
  transcripción, pie de atajos— y deja lo que sirve para *leer*. La barra no se
  toca: desde ahí se despliega otra vez, y esconder el botón que devuelve lo
  escondido sería una trampa; además parar la escucha tiene que estar siempre a
  mano.
- **La barra envuelve, no recorta.** Al meter escucha y fuentes ya no cabía todo
  a tamaño S: medido, 407 px de contenido en 354 disponibles, y con el aviso
  "VISIBLE" y el idioma forzado, 496. Lo que se salía del recorte era el grupo de
  botones, la X incluida. Los botones van agrupados y la barra tiene
  `flex-wrap`, así que el coste se paga en alto —que es lo que sobra— y nunca en
  controles inalcanzables. A tamaño S se esconde además el nombre de la fuente:
  el icono ya distingue micrófono de altavoz. El ancho de la ventana **es** el
  viewport, así que una media query equivale a "qué preset está puesto".

### El espejo del móvil: sacar la respuesta de la pantalla compartida

El overlay resuelve "que no se vea en la grabación". Hay un caso que **no puede**
resolver por construcción: compartir la pantalla entera, donde lo que está en tu
monitor está al otro lado por definición. Tampoco cubre una cámara, ni un
segundo monitor que alguien mire. La única salida es que la respuesta no esté en
esa pantalla, y para eso hace falta otro dispositivo.

**Server-Sent Events, no WebSocket.** El flujo va en una sola dirección, y eso
cambia el cálculo entero:

- Node no trae servidor de WebSocket; SSE es `res.write()` sobre el mismo `http`
  que ya sirve la página. **Cero dependencias nuevas** por el transporte.
- `EventSource` **reconecta solo**. En un móvil la conexión se cae cada vez que
  se bloquea la pantalla, así que ese bucle hay que tenerlo sí o sí — con
  WebSocket habría que escribirlo, y es justo donde salen los fallos raros.
- Que el teléfono **no pueda mandar nada** es una propiedad, no una carencia.

**Los dos interruptores están separados a propósito.** Encender el espejo y
abrirlo a la red local son dos decisiones distintas, y la segunda es la que
tiene alcance: con `phoneMirrorLan` apagado sólo escucha en `127.0.0.1`. Los dos
empiezan apagados; publicar el texto de tus respuestas no es un valor de fábrica.

**El token cambia en cada arranque** y por eso caduca solo un enlace guardado en
el móvil, sin que nadie tenga que acordarse de revocarlo. Se compara con
`timingSafeEqual`, que es barato y evita tener que justificar un `===` sobre un
secreto más adelante.

Tres cosas que salieron **ejecutándolo**, no leyéndolo:

- **`socket.connect()` de UDP es asíncrono.** La primera versión de
  `routedAddress()` leía `socket.address()` justo después y lanzaba `EBADF`, así
  que devolvía `null` **siempre**: seguía habiendo enlace —caía a la heurística
  de rangos— y el fallo era invisible. Es el patrón de este proyecto entero: lo
  que no falla ruidosamente hay que ir a comprobarlo.
- **Preguntar a la tabla de rutas en lugar de adivinar por prefijo.** La máquina
  de pruebas tenía cuatro IPv4: `192.168.1.4` (la buena) y `192.168.121.1`,
  `192.168.52.1` y `172.22.128.1` de adaptadores virtuales. Por prefijo son
  indistinguibles, así que ordenar por rangos acertaba **por casualidad**, según
  cómo enumerara el sistema. Un `connect()` de UDP a una dirección pública no
  manda ni un byte: sólo hace que el sistema elija ruta y fije el extremo local,
  que es exactamente el dato que se busca. La heurística de rangos se queda como
  plan B para cuando no hay ruta por defecto.
- **`server.close()` no cierra las conexiones SSE**, que son keep-alive: sin
  terminarlas a mano el puerto se queda tomado y el proceso no muere. Y el
  cierre es **asíncrono**, así que una petición del mismo tick todavía entra —
  lo que de verdad cierra la puerta es que el token se borra de forma síncrona.
  El test lo dice así en lugar de afirmar que la conexión se rechaza: escrito de
  la otra forma pasaba por suerte, según lo rápido que fuera la máquina.

**El QR viaja como matriz de módulos, no como imagen.** El dashboard lo dibuja
con `<rect>`: nada que añadir a la CSP, nítido a cualquier tamaño, y el margen
obligatorio de cuatro módulos es aritmética del `viewBox` en vez de un borde CSS
que alguien pueda quitar sin saber para qué estaba.

**Aquí sí se añadió una dependencia** (`qrcode-generator`, sin dependencias
propias), y conviene decir por qué no contradice lo de `electron-store` ni lo
del renderizador de Markdown. Aquellos se descartaron porque **lo que hacía
falta era trivial**: ochenta líneas de store, un partidor de vallas. Un
codificador de QR no lo es —Reed-Solomon, selección de máscara, bits de
formato— y sobre todo **su fallo no se ve**: un QR mal generado se dibuja
perfecto y no lo lee ninguna cámara. Escribirlo a mano habría cambiado 30 KB por
un error que sólo aparece con un teléfono delante.

### MQTT: publicar hacia fuera, y dónde acaba nuestra parte

No es una función de la app para la app: es una salida hacia **otra cosa**. El
caso que la motivó es un ESP32 suscrito al tema que recibe las respuestas de un
test y hace lo que su dueño programó. Nuestra responsabilidad termina en el
`publish`; lo que pase al otro lado es de quien montó el dispositivo, y la
sección lo dice con esas palabras.

Cuatro decisiones que no son obvias:

- **Sólo respuestas terminadas.** `answer` se emite en **cada tick del
  streaming**, así que publicar todo lo que pasa por el enganche llenaría el
  broker de decenas de mensajes por respuesta, cada uno un prefijo del
  siguiente. Un microcontrolador no quiere ver crecer una frase: quiere la
  frase. Hay test, y es el que más falta hacía — un mock del cliente habría
  pasado igual publicando cuarenta veces.
- **Ni errores ni abortadas.** Una placa que actúa sobre la respuesta de un test
  no puede distinguir "esto es un error" de "esto es la respuesta" si le llegan
  por el mismo tema. Mandar un fallo por ahí es pedirle que actúe sobre basura.
- **Dos temas, y no es indecisión.** `<base>` lleva el JSON completo para quien
  quiera contexto; `<base>/text` lleva **sólo el texto**, que es lo que una placa
  puede usar sin meter un parser de JSON en 320 KB de RAM. `mqttTopics()` vive en
  `shared/` para que la pantalla no pueda decir un tema mientras el broker recibe
  otro; y recorta la barra final porque `a//text` es un tema legal y **distinto**
  en MQTT, así que el suscriptor no lo vería.
- **QoS 1 y sin retener.** QoS 1 porque perder la respuesta es el fallo que
  importa: ya se pagó la consulta y hay alguien esperando a que su cacharro
  reaccione. Sin retener porque un mensaje retenido se entrega al suscribirse,
  así que una placa que arranca por la mañana ejecutaría la respuesta de ayer.

**La contraseña del broker va cifrada con DPAPI**, en el mismo almacén que las
API keys. La regla del proyecto sobre credenciales no distingue entre las caras
y las baratas: un broker de casa parece inofensivo hasta que esa contraseña abre
otra cosa.

**El broker de los tests es real** (`aedes`, en proceso, en un puerto efímero).
Lo que hay que comprobar no es que llamemos a `publish`, es qué recibe el
suscrito: con el cliente simulado, publicar en el tema equivocado o con el
payload equivocado pasaría el test igual.

### El dashboard dejó de ser una columna

Nació como una columna de tarjetas y creció hasta **doce**, de los primeros
pasos al registro de diagnóstico. Con cuatro funcionaba; con doce, encontrar un
ajuste era acordarse de a qué altura del scroll estaba, y hubo que inventar un
`scrollToCard()` para que la guía de primeros pasos pudiera llevarte a una
tarjeta — señal de que la navegación ya no la daba la propia página.

Ahora hay una barra lateral con nueve secciones y sólo se monta la que estás
viendo. Lo que hay que saber para no deshacerlo por partes:

- **La cabecera del panel es la que titula.** Las tarjetas que son únicas en su
  sección ya no llevan `card__title` ni `card__hint`: el texto se movió a
  `SECTIONS[id].hint`. Volver a ponérselo diría lo mismo dos veces en la misma
  pantalla. Las secciones con varias tarjetas —General, Audio, Modelos— sí las
  conservan, porque ahí el título distingue una tarjeta de la siguiente.
- **Los avisos suben a la barra lateral** como un punto ámbar, y son
  exactamente los que ya existían dentro de las tarjetas: proveedor sin
  configurar, atajo rechazado por Windows, auto-disparo inerte, modo invisible
  apagado. No hay ninguna comprobación nueva; lo nuevo es que **se ven sin
  entrar**. Un panel por secciones esconde los problemas por diseño, y el caso
  que lo obligaba es el auto-disparo inerte, cuyo único síntoma es el silencio.
- **El interruptor de escucha vive en la cabecera**, no sólo en su tarjeta. Es
  el mismo razonamiento que llevó el indicador del overlay a ser el mando: quien
  mira si está escuchando es porque quiere que escuche.
- **«Qué se escucha» se fue de Transcripción a Audio.** Estaba donde se
  implementa y no donde se busca. El precio de moverlo es que su aviso más caro
  se explica en Comportamiento, así que en los dos sitios hay un salto (`Jump`)
  en lugar del texto repetido: partir el dashboard en secciones separa ajustes
  que se explican el uno al otro, y eso hay que pagarlo explícitamente.
- **La sección se recuerda en `localStorage`.** El dashboard se abre y se cierra
  muchas veces seguidas afinando lo mismo, y volver siempre a «General» obliga a
  repetir el clic. El `try/catch` no es ceremonia: un almacenamiento que falla no
  puede impedir que se abran los ajustes.

**Los iconos se dibujan a mano** en `icons.tsx`, y no es masoquismo: la CSP del
dashboard es `default-src 'self'`, así que nada puede venir de un CDN, y meter
un paquete de iconos en una ventana que se abre para cambiar dos ajustes no sale
a cuenta. Es la misma razón por la que el overlay no tiene un renderizador de
Markdown.

### Lo que el dashboard tenía guardado y no enseñaba

Tres ajustes existían en `Settings`, el código los aplicaba, y **no había ninguna
forma de tocarlos** salvo editar `settings.json` a mano. No es lo mismo que un
ajuste que falta: el que está a medias parece implementado hasta que alguien lo
busca.

- **`overlayOpacity` y `overlayFontScale`.** El overlay ya los leía. El segundo
  ni siquiera existía como ajuste, y su ausencia se notaba en pantallas grandes.
- **`HotkeyMap`.** Los diez atajos eran configurables por diseño y sólo por
  JSON. Y hay que cambiarlos: un acelerador **global** se lo quita a la
  aplicación que tenga el foco, así que cualquier valor por defecto choca con el
  editor, el juego o la distribución de teclado de alguien.

Sobre el campo de atajos, dos decisiones:

- **Se captura la pulsación, no se escribe el texto.** El formato es de Electron
  (`Control+Shift+S`) y nadie tiene por qué conocerlo; y un acelerador mal
  escrito no da error, sólo un atajo que no se registra.
- **Se exige al menos un modificador.** No es purismo: un atajo global sin
  modificador secuestra esa tecla en **todo el sistema**. Ligar `S` a "capturar
  pantalla" haría imposible escribir la letra ese en cualquier aplicación
  mientras el asistente estuviera abierto. Está en `acceleratorFromEvent` y tiene
  test.

Y dos avisos que antes no existían, los dos sobre fallos mudos:
`registerHotkeys` **ya devolvía** los aceleradores rechazados y nadie recogía la
lista —sólo salía por el log, que en el `.exe` no mira nadie—, y dos acciones con
el mismo atajo no dan error: `globalShortcut` registra la primera y devuelve
`false` para la segunda, dejando una acción muerta sin decirlo.

### El asistente de configuración sustituyó a la lista de tareas

La tarjeta de «Primeros pasos» era una **lista de tareas**: decía qué faltaba y
te mandaba a la sección a hacerlo tú. Eso funciona si ya sabes qué es un
proveedor, una API key y un modelo con visión. Para quien abre la app por
primera vez, el primer paso —«local o nube»— exige saber cuánta RAM tiene y si
su GPU sirve, y nadie tiene por qué saber eso para probar una app.

El asistente **hace** los pasos en lugar de enumerarlos: mide el equipo,
recomienda un camino con el motivo a la vista, instala Ollama si hace falta,
descarga los dos modelos que le pegan a esa máquina y deja resuelta la
transcripción. Reemplaza a la tarjeta en lugar de convivir con ella: hacían el
mismo trabajo y mantener las dos era garantizar que se contradijeran.

**Se instala con winget, no descargando el `.exe`.** Bajar un ejecutable y
lanzarlo es la forma exacta de una cadena de suministro comprometida, y desde
fuera es indistinguible de que la app haga algo turbio. Con winget no tocamos
ningún binario: resuelve el paquete firmado y el aviso de elevación lo pinta
Windows con su propia cara. Cuando winget no está **no hay plan B automático, y
es deliberado**: se abre ollama.com y lo instala la persona. Una app que insiste
en instalar software cuando el camino limpio no existe es justo lo que no
queremos ser.

Dos detalles que costaron una decisión:

- **Instalar no es estar listo.** El instalador vuelve antes de que el servidor
  acepte conexiones, así que el paso siguiente —descargar el modelo— fallaría
  con un "no se pudo conectar" que parece un fallo de la instalación. Por eso se
  sondea `probeOllama` hasta 90 s antes de dar el paso por bueno.
- **El paso de la voz existe porque es el que se olvida.** Quien pega una clave
  de Claude y cierra se queda con la app **muda**: el motor por defecto es Gemini
  Live, que necesita una clave de Google que esa persona no tiene. El síntoma es
  el peor posible —escucha encendida, medidores moviéndose y ni una palabra— así
  que el asistente elige un motor que de verdad pueda funcionar con lo que hay.

**No se prometen tamaños de descarga.** Los GB de cada modelo no se pueden
consultar antes de empezar, así que se dice "varios GB" y el número real aparece
en cuanto arranca. Es la misma regla que con los precios de la guía: mejor un
hueco reconocido que una cifra inventada.

### «Configurada» no era lo mismo que «sirve»

Lo destapó el asistente, y es el tipo de fallo que este documento existe para
registrar: la pantalla decía **«ya tienes una clave»** y dos segundos después la
prueba de conexión contestaba **«falta la API key»**. Las dos cosas salían del
mismo archivo.

`getPresence()` sólo comprobaba que el campo existiera en `secrets.json`;
`getSecret()` era quien lo descifraba. Un ciphertext escrito por otro perfil de
Windows o por otra instalación **sigue ahí, ocupando su sitio**, y falla al
abrirse. Resultado: dashboard en verde y todas las respuestas fallando, que es
exactamente el estado en el que nadie sospecha de la clave porque la app acaba
de decir que está bien.

Ahora la presencia se responde intentando descifrar. Cuesta dos cadenas cortas y
convierte una media verdad en un dato. Tiene test —`secrets-presence.test.ts`—
porque el fallo es invisible: la versión rota pasa cualquier prueba que no
distinga "hay bytes" de "se puede leer".

### La guía de primeros pasos

El overlay ya avisaba de que faltaba un proveedor, pero eso cubre **uno de
cuatro** pasos y no dice cuáles son los otros tres. Los dos que se saltaba la
gente son justo los que más se notan luego:

- **Probar la conexión.** Una clave mal pegada no da ningún síntoma hasta la
  primera pregunta, y entonces el fallo parece de la app.
- **Pegar el CV.** Sin él las respuestas salen correctas pero genéricas, porque
  el modelo tiene prohibido inventarse experiencia. Es la diferencia entre que la
  app sirva y que parezca que no vale para nada.

Se marca sola, desaparece al completarse y se puede ocultar a mano — pero el
botón para recuperarla se queda al final del dashboard: esconder algo no debería
ser irreversible.

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
  oculta el proceso, sólo evita que un vistazo casual muestre "Tayori".

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

### El rebranding a Tayori paró donde empiezan los datos

El proyecto pasó a llamarse **Tayori**, y el cambio se detuvo a propósito en la
frontera de arriba. Tres capas, tres criterios:

| Capa | Qué pasó | Por qué |
|---|---|---|
| Marca visible (UI, docs, guía de modelos, cliente MQTT, tema por defecto) | Renombrada | Es lo que el usuario lee: es *el* rebranding |
| `package.json` `name` y `app.setName('interview-helper')` | **Intactos** | Son la ruta de `%APPDATA%`. Renombrarlos deja los settings y las claves cifradas en la carpeta vieja, **sin ningún error**: la app arranca como recién instalada |
| `appId`, `productName`, `executableName` (`Audio Helper`) | **Intactos** | Es la cara que ve el Administrador de tareas, y es neutra a propósito. Además, cambiar `appId` orfanaría las instalaciones existentes |

La tentación al ver un rebranding a medias es "terminarlo". No está a medias: el
`electron-builder.yml` ya documentaba esta separación antes del cambio de nombre
—«la marca que ve el usuario vive en la UI, no aquí»— y el rebranding se limitó
a la capa que ese comentario señala.

**Lo que sí se puede renombrar sin romper nada** es `productName` /
`executableName`: sólo cambia el nombre del `.exe` y del acceso directo. Pero es
una decisión de discreción, no de marca — el nombre neutro existe para que un
vistazo al Administrador de tareas no diga a qué se dedica la app.

**`release-please-config.json` conserva `package-name: interview-helper`.** Es
cosmético —afecta al título del changelog—, pero la publicación costó tres
intentos por trampas silenciosas (ver §12) y no se toca a cambio de nada.

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

### Los dos motores de OpenAI, y el que se descartó

Agosto de 2026. La petición fue «OpenAI tiene modelos de transcripción, y creo
que usaremos `gpt-live-transcribe` por defecto para reuniones». Los dos nombres
que se propusieron **existen los dos**, verificados contra la referencia de
OpenAI y contra los tipos del SDK instalado — pero sólo uno encaja aquí, y el
motivo de que el otro no encaje es una decisión que este proyecto tomó el primer
día.

| Modelo | Para qué es | Aquí |
|---|---|---|
| `gpt-live-transcribe` | Audio **en directo**: micrófonos, llamadas, streams | El motor `openai-live`, y el defecto sensato para reuniones |
| `gpt-transcribe` | Voz **grabada** | El motor `openai-transcribe`: un VAD produce exactamente eso, trozos ya cerrados |
| `gpt-4o-transcribe-diarize` | Separar hablantes | **Descartado**, ver abajo |

**Por qué no la diarización.** Esta app **ya sabe quién habla**: el micrófono es
«yo» y el loopback del sistema son «ellos», y ese reparto está tomado a
conciencia desde el principio porque el origen del stream es más exacto que
cualquier diarización. Un modelo que adivina hablantes no aporta nada a un dato
que ya es exacto. Encima **no admite `prompt`**, así que costaría el sesgo de
vocabulario, que es la palanca de calidad más barata que hay aquí. Lo único que
aportaría de verdad es distinguir a varias personas **dentro** de «ellos» —una
reunión de cuatro donde ahora todo cae bajo la misma etiqueta— y eso es una
**función distinta**, no una mejora de la transcripción. Si algún día se quiere,
se diseña como tal.

**Y por qué dos motores y no uno.** Es la misma pareja que ya existe con Gemini,
y responde a la pregunta de siempre: qué duele más, la latencia o los errores.

| | Latencia | Qué manda | Parciales |
|---|---|---|---|
| `openai-live` | ~300 ms | Streaming continuo | Sí |
| `openai-transcribe` | ~1 s por turno | El turno entero de una vez | No |

El segundo **oye la frase completa antes de decidir**, así que acierta más en
nombres propios y en finales de palabra. El primero empieza a escribir antes.
Ninguno es «el bueno».

#### La restricción que condicionó el diseño: 24 kHz

La API en tiempo real de OpenAI **sólo acepta PCM a 24000 Hz**. No es una
lectura entre líneas: los tipos del SDK lo dicen con esas palabras
—`rate?: 24000`, *"Only a 24kHz sample rate is supported"*— y todo el pipeline
de esta app está normalizado a **16 kHz** porque es lo que quieren Whisper y
Gemini Live.

Subir el worklet a 24 kHz para contentar a un motor habría empeorado a los otros
tres, así que la conversión vive contenida en `stt/resample.ts`, y ahí hay dos
cosas que conviene no «simplificar»:

- **Aquí la interpolación lineal SÍ basta**, al revés que en el worklet. Aquel
  caso era decimar 48 → 16 kHz, donde lo que hay por encima de la nueva Nyquist
  **se pliega** dentro de la banda de la voz — por eso hubo que meter un
  Butterworth de 8º orden. Al subir de frecuencia no se pliega nada: aparecen
  **imágenes** por encima de 8 kHz, y la interpolación lineal ya las atenúa. Un
  reconocedor de voz vive por debajo de esos 8 kHz. Subir de frecuencia no
  inventa detalle; sólo hace que el audio entre por la puerta.
- **El estado entre bloques no es opcional.** El audio llega en trozos de
  ~100 ms, diez por segundo y por hablante. Un remuestreador sin memoria empieza
  cada bloque desde cero y deja una discontinuidad en cada unión: diez
  chasquidos por segundo que el reconocedor oye como consonantes que nadie dijo.
  La transcripción sale peor y **no hay nada en el log que lo insinúe**. Tiene
  test —una rampa partida en dos bloques que debe seguir siendo monótona— y la
  fase se lleva en enteros porque un `float` acumulando 2/3 deriva en minutos.

#### Dos fallos que sólo salieron ejecutándolo, y los dos eran del protocolo

Se escribió contra la referencia y aun así falló al primer intento. Merece la
pena registrar los dos porque las lecciones son distintas.

**El primero fue ruidoso: `turn_detection`.** La primera versión mandaba
`{ type: 'semantic_vad' }` razonando que el servidor corta mejor por final de
idea que por silencio. La API contestó *"Turn detection is not supported for
this transcription model"* y la sesión no arrancó. Lo peor no es el error, es
que **la documentación mostraba `turn_detection: null` y no se copió**: se
sustituyó por algo que parecía mejor. La regla que ya estaba escrita para los
model IDs de Gemini vale igual aquí — lo que dice la referencia se copia, no se
mejora.

**El segundo no habría dado ningún error, y ése es el importante.** Con
`turn_detection` apagado, **el turno lo cierra el cliente**: hay que mandar
`input_audio_buffer.commit`. El modelo emite los parciales solo, así que sin el
commit la transcripción **se ve en pantalla y todo parece funcionar** — pero no
llega nunca un segmento final, y el auto-disparo sólo evalúa finales. El
resultado habría sido una app que transcribe de maravilla y no responde jamás,
sin una sola línea en el log. Se cierra con el `EnergyVAD` de siempre, el mismo
de whisper-local y con los mismos 700 ms, para que «cuándo termina una frase»
siga decidiéndose en un solo sitio.

De ahí que el motor tenga tests contra un **WebSocket de verdad**, y no contra
un cliente simulado: los dos fallos vivían en lo que se manda por el cable, que
es justo lo que un mock da por bueno. Es la misma decisión que con el broker de
MQTT.

**Y de ahí también `PROMPT_UNSUPPORTED`.** Qué parámetros acepta cada modelo de
transcripción no se puede saber desde aquí —la documentación habla de "keyword
hints" sin dar el nombre del campo— y equivocarse **tumba la sesión entera** en
lugar de degradar. Si el `prompt` se rechaza, se apunta el modelo y se reconecta
sin sesgo: se pierde precisión en los nombres propios, que es mucho mejor que
perder la transcripción. Mismo patrón que `EFFORT_UNSUPPORTED` en `claude.ts`,
por tercera vez en este proyecto.

#### Lo que sale gratis y lo que no

`openai-live` se abre con `intent=transcription`, así que la sesión **es** un
transcriptor. Eso ahorra toda la pelea que Gemini Live obliga a mantener: allí
el modelo es conversacional y va a intentar responder, de ahí su instrucción de
silencio, el `modelTurn` que se tira y una salida que se paga sin usarla. Aquí
no hay salida generada.

A cambio, la app depende ahora de `ws` **de forma explícita**. Ya estaba en el
árbol —lo arrastran `mqtt` y `@google/genai`— pero apoyarse en una dependencia
transitiva es apoyarse en que un tercero no la cambie, así que se declara. No
añade descarga.

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

### Skills: la tercera cosa que entra en el prompt

Agosto de 2026. Ya había dos formas de influir en la respuesta —el perfil y los
context packs— y la petición era una tercera. El riesgo obvio era acabar con
tres mecanismos que hacen lo mismo con nombres distintos, así que lo primero fue
delimitar qué decide cada uno:

| | Decide | Si falta |
|---|---|---|
| Perfil | La **forma** | La respuesta no cabe en el panel, o el código sale sin código |
| Context pack | El **material** | Correcta pero genérica: no es tuya |
| Skill | La **manera** | Correcta y tuya, pero suena a generada |

Esa tercera columna es la que no tenía respuesta antes, y es un fallo caro en
esta app concreta: **la respuesta se lee en voz alta**. Las muletillas de modelo
—«es importante destacar», los pares de adjetivos, el cierre que resume— cantan
mucho antes habladas que escritas.

**El formato es el de Anthropic y se implementa a mano.** Una carpeta con un
`SKILL.md`, frontmatter con `name` y `description`, cuerpo en Markdown. Elegir
un formato que ya existe es lo que hace que una skill escrita para otra
herramienta funcione tal cual, y no traer una dependencia para leerlo es la
regla de siempre: partir por `---` y leer dos claves son treinta líneas, y su
fallo **se ve** —la skill no carga y lo dice—. Es la misma frontera que dejó
fuera a `electron-store` y que sí justificó el codificador de QR, cuyo fallo era
invisible.

El parser acepta continuación en las líneas indentadas —una `description` de
verdad no cabe en 80 columnas— e **ignora las claves que no conoce**, para que
un SKILL.md con campos de otra herramienta no se caiga por traer de más.

#### El reparto de autoridad, que es lo que hace que funcione

La decisión de diseño está aquí y no es evidente: la skill **se suma** al
perfil, va **la última** del system prompt, y lleva su precedencia **escrita**:

> Manda sobre CÓMO se dice. NO cambia el formato. Donde discrepen sobre la
> MANERA de escribir, gana la skill; donde discrepen sobre la FORMA, gana la
> regla de formato.

Sin esa frase, una skill de tono y unas reglas de formato que llevan la palabra
«obligatorias» encima se contradicen en cuanto la primera pide algo que la
segunda limita, y **el empate lo rompe el modelo en silencio**: distinto según
el proveedor y según la frase, que es la peor clase de comportamiento — el que
no se puede reproducir ni explicar.

Va la última, después incluso del contexto, porque es la posición que el modelo
atiende con más fuerza y porque una skill existe justamente para corregir la
manera de escribir que traen las reglas de arriba. Puesta antes, se diluye.

#### Cuatro decisiones que parecen recortes y no lo son

- **Una sola skill activa.** Dos instrucciones sobre cómo escribir se
  contradicen enseguida —una pide frases cortas, otra un registro cuidado— y el
  resultado dependería del orden en que estuvieran encendidas. Con una, lo que
  se lee es lo que se pidió.
- **Los scripts y assets del formato se ignoran.** No es una fase pendiente:
  ejecutar un script que hay en una carpeta de datos es ejecutar código sin
  revisar, en el proceso que tiene las API keys descifradas. El día que se
  quiera, se diseña con esa frase delante.
- **`/skill` sólo funciona escribiendo, no hablando.** Un «/humanizar» dicho en
  voz alta llega del reconocedor como «humanizar» o como «barra humanizar»
  según el motor: reconocerlo ahí sería adivinar.
- **El prefijo sólo cuenta si la skill existe.** Si cualquier `/palabra` se
  tratara como invocación, escribir «/etc está lleno de configuración» perdería
  la primera palabra y el modelo respondería a otra cosa **sin que nada lo
  avisara**. Con la lista delante, lo que no casa se queda como texto. Tiene
  test, porque es el fallo silencioso de esta función.

#### Y dos que cubren fallos mudos

- **Una skill rota se lista igual, con su motivo.** Desaparecer sin decir nada
  deja a alguien mirando una carpeta que sí existe. Y `getSkill()` devuelve
  `undefined` para las rotas, así que un `activeSkillId` que apunta a una
  carpeta que alguien estropeó **se comporta como si no hubiera skill** en lugar
  de mandar medio prompt.
- **El cuerpo vacío es el único error de verdad.** Sin `name` se usa el id de la
  carpeta y sin `description` la lista se ve sosa, pero las dos funcionan. Una
  skill sin instrucciones no hace **nada** y aparecería encendida en el
  desplegable diciendo lo contrario.

**La skill entra también en `gemini-audio`.** Con ese motor la respuesta la
escribe el reconocedor, así que si se hubiera quedado fuera habría un motor en
el que encender una skill no hace nada — y desde la pantalla los dos casos se
ven idénticos.

### El techo de la heurística, y el escalón que faltaba

`AutoTriggerMode` prometía `heuristic+classifier` **desde el primer día en el
tipo**, y ese código no existía. Se implementó en agosto de 2026 empujado por un
caso concreto, sacado de una conversación real:

> «Una persona que conozca de DevOps debería conocer también de seguridad.»
> «Si una persona sabe DevOps, necesariamente tendría que saber de seguridad.»

Las dos son **preguntas**: quien las dice está esperando que le contesten. Y las
dos llegan del reconocedor como oraciones afirmativas, sin signo y sin ningún
interrogativo. La reacción natural es añadir marcadores a la lista, y es la
equivocada: **lo que las hace preguntas no está en el léxico**. Está en que son
afirmaciones dirigidas a alguien que espera respuesta. Ninguna lista de palabras
lo va a coger nunca, y añadir «debería» ya se probó y se descartó porque dispara
con «creo que debería haber estudiado más».

Así que el techo de `question-detector.ts` no era falta de reglas: era el
método. De ahí el segundo escalón, que le pregunta al modelo.

Tres reglas lo hacen viable, y las tres importan:

- **Sólo se escala la duda, nunca la certeza.** Una muletilla o una frase de dos
  palabras se descartan gratis. Pagar una consulta para que un modelo confirme
  que «vale, perfecto» no es una pregunta es tirar el dinero.
- **Nunca bloquea.** Reloj propio de 8 s y `AbortSignal`. Si el modelo tarda o
  falla, el veredicto es «no era una pregunta» y todo sigue como en `heuristic`.
  Un clasificador caído no puede dejar la escucha colgada.
- **Cuesta, y se dice en pantalla.** Es una consulta más por intervención
  ambigua, y en un modelo que razona ni siquiera es barata. Por eso no es el
  valor por defecto.

**El campo `ambiguous`, y por qué no es el texto de `reason`.** La primera
versión decidía si escalar comparando el prefijo de la cadena del motivo, y un
test lo cazó en cuanto se escribió: el motivo del modo estricto empieza igual,
así que la decisión dependía de cómo estuviera **redactado un mensaje** pensado
para que lo lea una persona. Es la misma lección que ya estaba escrita para los
errores de los proveedores —se distinguen por clase, no por cadena— aplicada a
un sitio nuevo.

De paso se decidió que **`strict` también escala**. La sensibilidad gobierna
cuánto se arriesga la heurística; el modo gobierna si el modelo puede opinar.
Estricto + clasificador es de hecho la combinación más precisa que existe: cero
adivinanzas por palabras, y el modelo resolviendo las dudas.

### Pedir no es preguntar, y la mitad de la gente pide

Del log de una prueba real, con diez segundos de diferencia:

    20:04:58  descartado (sin marcadores): "Explica un poco el rol de un SRE"
    20:05:08  disparando (signo de interrogación): "¿Podrías explicar un poco el rol de un SRE?"

Las dos piden exactamente lo mismo. Sólo la segunda está **formulada** como
pregunta, y ahí estaba el fallo: la heurística tenía `explícame` pero no
`explica` a secas.

**Y era una asimetría entre idiomas que llevaba ahí desde el principio.** En
inglés los imperativos pelados ya estaban cubiertos —`explain`, `describe`,
`tell` viven en `INTERROGATIVE_OPENERS`— y en español sólo se reconocían las
formas con pronombre. Quien dice «explica» sin el «me» está pidiendo lo mismo.

`IMPERATIVE_OPENERS` los añade con dos condiciones que sí importan:

- **Sólo al principio de la intervención.** Estos verbos son idénticos a la
  tercera persona del indicativo, que aparece a todas horas: «el informe
  explica que…», «ese diagrama resume bastante bien». Al principio es una
  petición casi siempre; en medio, casi nunca. Hay test de las dos caras.
- **Cuentan también en modo estricto.** Pedir algo es tan explícito como
  preguntarlo; que no lleve signo de interrogación no lo vuelve dudoso.

Cuatro verbos se quedaron **fuera a propósito**, y conviene que no los añada
nadie luego: `cuenta` (es sustantivo, y «cuenta con» significa otra cosa),
`indica` («indica que…» en tercera persona es lo normal), `desarrolla`
(«desarrolla software») y `habla` («habla muy rápido»). Es el mismo criterio
que dejó fuera a «debería».

**Lo que esto no arregla**, y hay que saberlo: cubre la forma imperativa, que es
frecuente y barata de detectar. Las peticiones que no son ni preguntas ni
imperativos —una afirmación lanzada para que la rebatas— siguen necesitando el
clasificador. Una lista de verbos tiene el mismo techo que una lista de
interrogativos; sólo lo tiene un poco más arriba.

### La frase que salía dos veces

Se vio en pantalla antes que en ningún test, y la firma lo decía todo:

    ¿ Qué opin as del concepto de Ops? … ¿Qué opinas del concepto de Ops? …
      └── parciales acumulados            └── el turno completo, otra vez

Dos fallos encadenados, los dos del motor `openai-live`:

- **Los `delta` son incrementales y el `completed` trae el turno ENTERO.** El
  buffer concatena porque su contrato dice que todo es incremental —lo es en
  Gemini Live—, así que el final se pegaba detrás de lo ya acumulado.
- **Y la primera copia salía con las palabras partidas** («conoz ca», «ingen
  ieros») porque `joinFragments` mete un espacio cuando ninguno de los dos
  lados lo trae, y los deltas de OpenAI son trozos de token.

Se arregla en el sitio donde se conoce el protocolo: el carril acumula sus
propios deltas **en crudo** y marca lo que emite como `cumulative`, con lo que
el buffer reemplaza en lugar de concatenar. La alternativa —que el buffer
adivinara comparando prefijos— es la clase de heurística que falla el día que
alguien repite una frase a propósito.

La lección para el siguiente motor: **antes de emitir, mirar si los parciales
del proveedor son incrementales o acumulativos.** No hay un estándar, y los dos
que hay en esta app no coinciden.

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

### Un modelo para hablar y otro para mirar

Había un solo modelo para todo, y las dos tareas piden cosas **opuestas**:

| | Necesita | Porque |
|---|---|---|
| Conversar | Latencia | La respuesta se lee mientras alguien te mira a la cara |
| Pantalla | Vista y cabeza | Hay que leer un enunciado en una captura y no equivocarse |

Un modelo local pequeño cumple lo primero y falla lo segundo; uno grande de pago
al revés, es caro para cada frase suelta de una reunión. `screenProviderId` +
`screenModel` los separan, y el default `same` reproduce **exactamente** el
comportamiento anterior — nadie que no toque nada nota el cambio.

Dos detalles del diseño:

- **`screenModel` es un campo suelto, no otro `Record` por proveedor.** Al
  elegir "Ollama para la pantalla" lo que se quiere es un modelo **concreto** —el
  multimodal que tengas descargado— distinto del de conversar aunque el
  proveedor sea el mismo. Ése es justo el caso interesante: `llama3.2:3b` para
  hablar y `qwen2.5vl:7b` para mirar, los dos locales.
- **La etiqueta del overlay sigue a la respuesta, no a los ajustes.** Con dos
  modelos en juego, "con qué se generó esto" deja de ser deducible de la
  configuración: se lee de `answer.model`, que es el que de verdad la escribió.

El fallo a vigilar es el de siempre en este proyecto: **un modelo sin visión
descarta las imágenes en silencio**. Para una pregunta hablada eso degrada y ya
está; en las acciones de pantalla la captura **es** el enunciado, así que el
modelo se inventaría el ejercicio entero y la respuesta parecería perfecta. Por
eso ahí se falla con mensaje, y por eso el selector marca cuáles ven imágenes.

### Dos fallos del modo test que eran del prompt, no del modelo

Salieron en la primera prueba de verdad, y conviene registrar el diagnóstico
porque la conclusión intuitiva era la contraria:

- **"Qwen sólo responde una pregunta."** Se le pedía exactamente eso: la
  instrucción decía *"si hay varias preguntas visibles, responde la que está en
  primer plano o la primera sin contestar"*. Obedecía. Quien tiene un
  cuestionario delante lo quiere entero, así que ahora se piden todas, una línea
  cada una, en el orden en que aparecen.
- **"Se extiende demasiado."** También pedido: el formato tenía un punto para el
  porqué y otro para los distractores. Con un modelo grande eso sale corto; con
  uno local pequeño, que cumple mal los topes de longitud, se desborda. La única
  defensa que funciona de verdad no es pedir menos palabras, es **no pedir la
  explicación**. Ahora la respuesta es sólo la respuesta, y el porqué se pide con
  un botón cuando hace falta.

La lección general, que aplica a cualquier ajuste futuro de estos prompts:
**antes de culpar al modelo, leer lo que se le pidió**. Los dos síntomas
parecían límites de un modelo local pequeño y ninguno lo era.

Un tercer detalle de la misma prueba: **un modelo pequeño necesita reglas más
cortas**. Las de test se reescribieron en frases imperativas de una línea, sin
la prosa explicativa que llevaban antes; lo que en un modelo grande es matiz, en
uno pequeño es ruido que compite con el formato.

### Los asteriscos de la negrita: se ataca por los dos lados

Claude marcaba en negrita la opción correcta de cada test y el overlay enseñaba
`**B)** El índice...`, asteriscos incluidos, porque el panel pinta texto plano.

La corrección va **en los dos sitios a la vez**, y ninguno sobra:

- **El prompt prohíbe el markdown de énfasis** en los tres perfiles que se leen
  en el panel. Sin esto, las marcas seguirían llegando y gastando tokens y ancho.
- **`parseInline` las interpreta igualmente.** Porque los modelos las ponen hagas
  lo que hagas, y depender de que obedezcan una instrucción de formato es
  exactamente el tipo de suposición que este documento existe para desmentir.

Sigue **sin** ser un renderizador de Markdown: sólo negrita y código en línea, y
una marca sin cerrar se queda como texto literal — condición necesaria durante el
streaming, donde `**B` llega antes que su pareja y no puede desaparecer nada de
la pantalla.

### El modo test y la regla de la duda

Un test no se responde como un algoritmo, de ahí un perfil aparte y no un
parámetro del de código. Lo que gobierna `QUIZ_RULES` es que **cada línea es una
respuesta y nada más**: número, letra y texto de la opción, sin preámbulo. Lo
demás —el porqué, los distractores— se pide con un botón, por lo que cuenta la
sección anterior.

Hay dos marcas de línea, y las dos existen porque cambian lo que hace quien lee:
`DUDA:` cuando el modelo no está seguro, y `NO SE VE:` cuando de esa pregunta no
se leían todas las opciones en la captura. La segunda evita el peor resultado
posible, que es una respuesta segura basada en media pregunta.

La regla que más importa es la de la incertidumbre. Un modelo que contesta "C"
con la misma seguridad cuando lo sabe y cuando lo adivina es **peor que uno que
no contesta**: en un test con penalización por fallo, quien lee tiene que poder
decidir si arriesga. De ahí el prefijo `DUDA:`, que además da igualmente la
mejor opción — negarse a responder tampoco ayuda a nadie.

El prompt avisa explícitamente de las negaciones y los superlativos del
enunciado ("cuál NO", "siempre", "la mejor"). Es donde se pierden estas
preguntas incluso sabiendo la materia, y un modelo con prisa cae igual que una
persona con prisa.

### Ollama recorta el contexto sin decirlo, y la memoria ahora se ve

**Ollama no usa la ventana de contexto del modelo.** Aplica la suya, `num_ctx`,
por defecto **2048 tokens**, y lo que no cabe lo descarta por el principio **sin
ningún error**. Con el system prompt con CV, la transcripción y ocho turnos de
memoria, esos 2048 se agotan enseguida.

El síntoma es exactamente el que ya se documentó una vez —el asistente "olvida"
lo que le acabas de decir— pero la causa es **otra**: aquella vez era que el
historial no se enviaba; ésta es que sí se envía y Ollama lo tira. Que dos
causas distintas produzcan el mismo síntoma es la razón de que esto esté
escrito aquí. Ahora se envía `num_ctx` explícitamente, configurable, con 8192
por defecto.

De ahí sale también el chip `memoria n/8` del overlay. Cada turno recordado se
reenvía **entero** en la siguiente consulta, y eso no se veía en ninguna parte;
es lo único del coste de una consulta sobre lo que el usuario puede decidir.
Vaciarla es distinto de "nueva conversación": aquélla aborta la respuesta en
vuelo, limpia la transcripción y cierra la conversación en disco. Esto sólo tira
lo que se reenvía al modelo.

Un detalle de implementación que costó una lectura: el "olvidado" del chip se
marca **antes** de llamar al IPC, no en el `.then`. Vaciar la memoria deja el
contador a cero, y con cero el chip no se pinta — para cuando llegaba la
respuesta el componente ya estaba desmontado y el aviso no se veía nunca.

### Los modelos que razonan gastan salida en algo que nadie lee

Un modelo de razonamiento en Ollama —`qwen3-vl:8b-thinking` y familia— rompe dos
suposiciones que el proveedor daba por buenas, y las dos en silencio.

**La primera es dónde llega el texto.** El razonamiento viene en
`message.thinking`, un campo distinto de `message.content`, y `num_predict`
cuenta los dos juntos. Medido con el prompt real del modo código:

| `num_predict` | razonamiento | respuesta | `done_reason` |
|---|---|---|---|
| 2200 (el tope de código) | 6.432 car. | **0 car.** | `length` |
| 8000 | 23.329 car. | 589 car. | `stop` |

Con el tope de siempre el modelo se quedaba sin presupuesto **pensando**. El
stream terminaba limpio, sin error, así que la app caía en su rama de "el stream
acabó sin texto" y decía *"El modelo no devolvió texto"* — cierto y completamente
inútil. El razonamiento fue de 10 a 50 veces más largo que la respuesta, así que
no se arregla subiendo el tope un poco: los modelos que piensan llevan
`THINKING_BUDGET_TOKENS` **además** de lo que gasten respondiendo.

**La segunda es el reloj.** `FIRST_TOKEN_TIMEOUT_MS` mata la consulta si no ha
salido nada en 45 s, y aquí el primer carácter tardó **62,8 s** en el peor caso
medido. Sin tocar eso, arreglar el presupuesto no habría servido de nada: la
consulta moría igual, sólo que con otro mensaje. Por eso el proveedor emite un
**latido vacío** en cuanto ve el primer trozo de razonamiento: le dice al motor
"sigo vivo" sin pintar la deliberación en el overlay, que es un panel que se lee
de reojo mientras alguien te mira a la cara.

**`think: false` no es la salida.** Se probó contra este mismo modelo y siguió
razonando 7.364 caracteres. Hay modelos que sólo saben pensar, así que la opción
de apagarlo no se implementó: lo que se hizo fue dejarles sitio.

La detección es por nombre **y aprendida en caliente**, el mismo patrón que
`EFFORT_UNSUPPORTED` en `claude.ts`: la lista de pistas envejece —mañana sale uno
que piensa y no se llama "thinking"—, así que la primera consulta lo descubre por
el campo `thinking` y las siguientes ya salen con presupuesto.

### El catálogo de modelos es una sugerencia, no una frontera

`CLAUDE_MODELS`, `GEMINI_MODELS` y `OPENAI_MODELS` están escritos en el código,
así que envejecen:
cada modelo nuevo del proveedor tardaba en poder usarse **lo que tardara una
versión de la app**, aunque la cuenta ya tuviera acceso. La lista sigue siendo lo
primero que se ve —es lo que quiere casi todo el mundo y evita teclear un id de
memoria— pero ahora tiene una opción «Otro…» que abre un campo de texto.

**Con Ollama no se ofrece, y no es un olvido.** Esa lista no es un catálogo
nuestro: es lo que el servidor local responde que tiene descargado. Escribir ahí
el nombre de un modelo que no está instalado no lo instala, sólo produce un error
más tarde y más lejos de la causa.

Dos cosas que hubo que arreglar para que esto funcionara:

- **El auto-relleno pisaba el id escrito a mano.** El efecto que carga la lista
  reparaba el ajuste cuando el modelo guardado *no estaba en la lista*, que era
  correcto cuando la lista era la única fuente posible. Con ids a mano, eso
  sustituía el modelo tecleado por el primero del catálogo en la siguiente
  apertura del dashboard. Ahora la condición es "está vacío". El caso que
  motivó el arreglo original —Ollama con `""`, que fallaba con "no hay ningún
  modelo seleccionado"— sigue cubierto; el nuevo no. Cambiarle el modelo a
  alguien a su espalda es malo con uno local y peor con uno de pago.
- **`normalizeModelId`, y no es cosmético.** Un id copiado de una página de
  documentación se pega con un espacio detrás. El proveedor responde 404 y el
  mensaje que llega es "el modelo indicado no existe", que manda a buscar el
  modelo bueno cuando el modelo ya era el bueno. Ningún proveedor admite
  espacios en un id, así que se quitan al teclear. Tiene test.

El campo va en monoespaciada por la misma razón: lo que se escribe ahí se compara
carácter a carácter contra el id del proveedor, y en una fuente proporcional un
`1` por una `l` no se ve.

La cara conocida del `<select>` controlado sigue vigilada aquí: mientras la lista
carga está vacía, y sin la comprobación de `models.length > 0` **todo** parecería
escrito a mano, así que el campo de texto aparecería y desaparecería solo en cada
apertura. Se verificó muestreando el DOM cada pocos milisegundos tras cambiar de
proveedor.

### La guía de modelos es un documento, y no otra ventana

La tarjeta del dashboard responde *"¿qué me pongo?"* en dos líneas. La pregunta
de al lado —*"¿y por qué, y qué más hay, y cuánto cuesta?"*— necesita tablas,
tramos y comparativas de precios, y en una columna de ajustes eso es un muro que
nadie lee.

Se resolvió generando un HTML autocontenido y abriéndolo con el navegador del
sistema. **Una ventana propia de Electron se descartó por la regla de oro de este
proyecto**: cada ventana nueva hay que registrarla en la protección de captura, y
el modo invisible se verifica, no se asume. Un documento no tiene ese riesgo, y
encima se guarda, se imprime y se consulta con la app cerrada — que es como se
lee una tabla de precios.

El renderizador vive en `shared/` y es una función pura de `SystemSpecs` a
string, así que tiene tests: que escapa lo que viene del sistema (el nombre de la
CPU y de la GPU los da el SO y acaban dentro del HTML), que no mete `<script>` ni
referencias externas —se abre desde `file://` y no puede depender de la red— y
que cubre las tres cosas que se fueron a buscar: locales por cómputo,
multimodales y nube barata.

**Sobre los precios, dos reglas.** Los de Anthropic se verificaron contra su
referencia oficial en lugar de escribirlos de memoria, y el documento lleva
fecha porque caducan. Los de Google **no se reproducen**: no se pudieron
verificar con la misma fuente, y una cifra inventada en una tabla de precios es
peor que una remisión a la página del proveedor. Esa asimetría se explica en el
propio documento en lugar de disimularse.

El dato que más costó reunir y el que más sorprende es el coste real de una
pulsación de pantalla: una captura de 1600 px se cobra como **~4.800 tokens de
entrada** en los modelos de visión de alta resolución, lo que deja el modo
pantalla en céntimos incluso con el modelo caro. La conclusión práctica es la
contraria de la intuición: **lo que engorda la factura no son los botones, es la
escucha automática**, que dispara una consulta por cada pregunta que oye.

De ahí sale también la nota sobre Haiku 4.5, que parece la ganga obvia: es más
barato *y* gasta menos tokens por captura porque la lee a menor resolución. Es
exactamente la misma razón por la que falla antes con letra pequeña — está
viendo menos.

### Recomendar un modelo local sin inventarse los datos

"¿Qué modelo de Ollama me irá bien?" no tiene respuesta genérica: el mismo
modelo es instantáneo con GPU y tarda un minuto sin ella, y equivocarse cuesta
una descarga de varios gigas. La guía mide RAM, CPU y GPU y recomienda dos
modelos, uno para conversar y otro para la pantalla.

**Lo que no hace es estimar la VRAM**, y es deliberado. Es el número que de
verdad decide si un modelo cabe en la tarjeta, y no hay forma fiable de leerlo
desde Electron sin invocar utilidades del sistema. Una recomendación apoyada en
una cifra inventada es peor que una recomendación con un hueco reconocido, así
que el hueco se reconoce en pantalla.

El nombre de la GPU sí se saca, y por una vía poco evidente: `app.getGPUInfo`
devuelve identificadores numéricos, pero `auxAttributes.glRenderer` trae la
cadena de ANGLE —`"ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 …)"`— de la
que se puede extraer el nombre comercial sin depender de nada externo.

**Esa cadena la escribe el driver, y no todos la escriben igual.** Con drivers
recientes de NVIDIA llega el id PCI pegado al nombre —`"NVIDIA GeForce RTX 5070
Ti (0x00002C05)"`— y se colaba entero en una línea que se lee de un vistazo.
`cleanRenderer` lo quita, y tiene test: el patrón se acota a lo que parece un id
hexadecimal justamente para no llevarse por delante el paréntesis de un
`"Intel(R) UHD Graphics 620"`, que sí forma parte del nombre. El id se elimina y
no se esconde detrás de nada porque no responde a la única pregunta de esa
tarjeta —qué modelo local le pega a esta máquina—, igual que la VRAM que no se
puede medir no se estima.

Los tramos salen de una regla sencilla: un modelo cuantizado a 4 bits ocupa
~0,6 GB por cada mil millones de parámetros, más el sistema y la ventana de
contexto. De ahí que un 7B pida ~8 GB libres y un 14B ronde los 16 GB. Los
nombres de modelo envejecen, así que el dashboard enseña el comando y apunta a
la biblioteca de Ollama en lugar de prometer que existirán siempre.

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

### ChatGPT va por la Responses API, y no es una preferencia

El proveedor de OpenAI (agosto de 2026) se pidió como «añade ChatGPT». Lo que no
es evidente es que la elección de **API** decide más que la de proveedor:

- **Chat Completions no deja gobernar el razonamiento.** Los modelos GPT-5
  piensan antes de contestar, y ahí no hay forma de pedirles que piensen poco.
  La única palanca de latencia que existe —`reasoning.effort`— vive en la
  Responses API, y esta app se lee de reojo mientras alguien te mira a la cara.
  Se manda `low` por el mismo motivo que el `effort` de Claude.
- **`store: false`, y esto es lo que de verdad importa.** La Responses API
  **guarda por defecto** cada respuesta en la cuenta de OpenAI para poder
  recuperarla luego por API. Es decir: el valor de fábrica del proveedor deja
  una copia de lo que se dijo en tu entrevista en un sitio del que esta app no
  sabe nada. Contradice la línea que §4 lleva defendiendo desde el principio, y
  por eso se apaga en **todas** las llamadas, incluida la de «Probar conexión».
  Tiene test contra un servidor real, no contra un cliente simulado: un mock
  habría pasado igual mandando `store: true`.

**Y la trampa del presupuesto aparece por tercera vez.** `max_output_tokens`
cuenta los tokens de razonamiento **y** los de la respuesta, exactamente igual
que `num_predict` en Ollama. Con el tope de 2.200 del modo código, un modelo que
piensa puede gastárselo entero deliberando y terminar sin escribir un carácter,
sin ningún error. Ya está documentado dos veces en este archivo —Ollama y el
reloj del primer token— y aun así hubo que volver a resolverlo aquí, así que
conviene decirlo como regla y no como anécdota:

> Cuando un proveedor tiene un solo número para «cuánto puedes generar», hay que
> comprobar si el razonamiento sale de ese número **antes** de fiarse del tope.

`budgetFor(maxTokens, withReasoning)` presta 4.000 tokens aparte. Es menos que
los 8.000 de Ollama porque con `effort: 'low'` el razonamiento es mucho más
corto que el de un modelo local de la familia *thinking*, y porque sólo se
cobran los que se usen.

**`reasoning` se aprende en caliente**, igual que `EFFORT_UNSUPPORTED` en
`claude.ts` y `KNOWN_THINKERS` en `ollama.ts`. Los modelos sin razonamiento
—un `gpt-4o` escrito a mano en «Otro…»— devuelven un 400 por un parámetro que
el usuario no sabe que se está enviando, así que fallarían **todas** sus
preguntas: es el fallo de Haiku 4.5 calcado. La primera petición lo descubre,
reintenta sin el bloque y las siguientes ya salen bien.

**El catálogo son los tres GPT-5.6, y los nombres no ayudan.** «Sol», «terra» y
«luna» no dicen cuál es el grande —a diferencia de `mini`/`nano`, o de
Haiku/Sonnet/Opus— así que el papel de cada uno **hay que ir a leerlo** en lugar
de deducirlo, que es exactamente el tipo de suposición que este documento existe
para desmentir. Verificado contra la referencia de OpenAI:

| Modelo | Qué es | Precio (entrada / salida por millón) |
|---|---|---|
| `gpt-5.6-luna` | Cargas sensibles al coste | 0,20 $ / 1,20 $ |
| `gpt-5.6-terra` | Equilibra capacidad y coste | 2 $ / 12 $ |
| `gpt-5.6-sol` | Modelo de frontera, trabajo complejo | 5 $ / 30 $ |

Los tres aceptan **texto e imagen**, que es la condición para poder salir
también en el selector del modelo de pantalla. Eso también se comprobó en lugar
de darlo por hecho: un modelo sin visión ahí no degrada, **se inventa el
enunciado entero** y la respuesta parece perfecta.

**El defecto es Terra**, por el mismo motivo por el que en Claude es Sonnet y no
Opus: esta app dispara una consulta por cada pregunta que oye, así que arrancar
con el modelo caro se lo cobra a alguien que no ha elegido nada. Luna es de otro
orden de magnitud —30 veces más barato de salida que Sol— y es la respuesta
buena para quien mire la factura de la escucha automática.

**Los precios de OpenAI sí se reproducen en la guía**, con fecha, porque se
pudieron verificar contra su referencia oficial igual que los de Anthropic. Los
de Google siguen sin reproducirse: la asimetría no es pereza, es el criterio de
siempre — una cifra que no se pudo verificar hace más daño en una tabla de
precios que un hueco reconocido.

### Lo que costó añadir ChatGPT, y no era el proveedor

El archivo del proveedor y su entrada en el factory son la parte fácil, y el
`never` exhaustivo de `llm/index.ts` la hace además a prueba de olvidos. Lo caro
fueron **tres sitios que el compilador no señala**, y los tres tienen la misma
forma: una condición escrita a mano que enumera los proveedores de entonces.

| Dónde | Qué pasaba si se olvida |
|---|---|
| `providerReady()` en el dashboard | Cae al `else`: la sección «Modelos» sale con aviso de "sin configurar" **con la clave puesta** |
| El `configured` del overlay | El panel enseña "Falta configurar la IA" para siempre, con el proveedor funcionando |
| `alreadyThere` en el asistente | Dice "ya tienes una clave" mirando la de otro proveedor |

Las tres decidían la misma pregunta —*¿está configurado esto?*— con tres
condiciones distintas, y ninguna rompe el build al añadir un id: la cadena de
ternarios simplemente cae al último caso. En el asistente se sustituyó por
indexar `presence[choice.secret]`, que no puede quedarse atrás. Las otras dos
siguen siendo cadenas de `if`, y aquí queda anotado que **son el sitio donde
mirar** al añadir el siguiente.

Dos cosas más que salieron al pasar, ninguna causada por OpenAI:

- **El asistente borraba modelos de otros proveedores.** El camino local
  escribía el mapa `llmModels` entero a mano —`{ claude: '', gemini: '', ollama:
  … }`— con un `as` encima que lo dejaba pasar callando. Quien probaba lo local
  perdía el modelo que tuviera elegido en la nube. El camino de la nube ya
  documentaba exactamente esta lección **y el otro no la había aplicado**. Ahora
  fusiona con lo que hubiera, y sin el `as`, que es lo que además obliga al
  build a avisar si mañana falta una clave.
- **El canal IPC de los secretos mentía en el tipo.** `secretsSet` declaraba
  `key: 'anthropic' | 'google'` mientras el preload ya mandaba `SecretKey`, y la
  contraseña de MQTT se guardaba por ahí desde hacía tiempo sin aparecer en esa
  unión. No fallaba nada —el tipo no llega en tiempo de ejecución— pero era una
  lista escrita a mano condenada a envejecer: ahora es `SecretKey`.

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
| Cambiar "Qué se escucha" en mitad de una sesión no cambiaba nada | `audioSources` sólo se lee dentro de `capture.start()`, y los hablantes del motor de STT se fijan al arrancar la transcripción. El ajuste se guardaba, la UI se actualizaba y se seguía escuchando lo de antes | Un ajuste que sólo se lee al arrancar necesita que quien lo cambia reinicie lo que depende de él. Se hace en el handler de `settingsUpdate`, no en la UI, para que valga igual desde el overlay y desde el dashboard |
| El botón "Copiar" de un bloque de código no hacía nada | `navigator.clipboard.writeText()` exige que el documento tenga el **foco**, y el overlay es `focusable: false` a propósito para no robárselo a la videollamada: rechazaba siempre con *"Document is not focused"*. Y el `.then()` sin `.catch()` se tragaba el rechazo | Dos lecciones. Una: en el overlay, cualquier API del navegador que dependa del foco está descartada por diseño, no por casualidad — se hace desde el main (`clipboard.writeText`), que además se salta el `setPermissionRequestHandler` que sólo concede `clipboard-read`. Otra: una promesa sin `catch` en un manejador de click convierte un error en "no pasa nada", que es el síntoma más caro de diagnosticar |
| ~1,3 s fijos por turno en Whisper local | `whisper-cli` **carga el modelo en cada invocación**: tarda lo mismo con 1,7 s que con 8,2 s de audio | Medir el coste contra el tamaño de la entrada delata al instante lo que es fijo y lo que es proporcional |
| "El modelo no devolvió texto" con un modelo de razonamiento en Ollama | Ollama devuelve el razonamiento en `message.thinking`, **aparte** de `message.content`, y `num_predict` cuenta los dos juntos: con el tope de 2.200 del modo código, `qwen3-vl:8b-thinking` agotaba el presupuesto pensando y terminaba con `done_reason: "length"` sin escribir un solo carácter | Un campo nuevo en la respuesta de un proveedor no avisa de que existe: el bucle leía `content` y lo demás caía al suelo. Y un tope de salida calculado para "lo que se lee" no vale cuando el modelo gasta salida en algo que **no** se lee |

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
y saca la salida a `%LOCALAPPDATA%\Tayori-release`, avisando por
consola. Se puede forzar otra ruta con `IH_BUILD_OUT`.

Ese script invoca `cli.js` con `process.execPath` en lugar de `npx` con
`shell: true`, por dos motivos: pasar argumentos con shell los concatena **sin
escapar** (Node avisa con DEP0190), y la ruta de este proyecto **contiene
espacios** ("Tayori").

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
- **ChatGPT contra la API real de OpenAI.** Sí está verificado **el contrato**:
  `tests/openai-provider.test.ts` levanta un servidor HTTP de verdad que habla
  la Responses API por SSE, y fija lo que sale (`store: false`, el bloque
  `reasoning`, el presupuesto prestado, el historial como mensajes, la captura
  como `input_image`) y lo que se hace con lo que vuelve (negativa, presupuesto
  agotado, reintento sin `reasoning`, cancelación). Los ids del catálogo, sus
  papeles, sus precios y que aceptan imágenes salen de la referencia de OpenAI,
  consultada el 1 de agosto de 2026. Lo que **no** se ha comprobado es una
  llamada real contra sus servidores: que la cuenta tenga acceso a esos tres
  modelos. Lo dirá «Probar conexión» — el botón está y el error que devuelve ya
  distingue clave inválida, sin acceso, sin saldo y modelo inexistente.
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
- **Los dos motores de OpenAI contra sus servidores.** `openai-transcribe` está
  verificado de extremo a extremo contra un servidor HTTP real: que el turno
  sale como WAV, con el modelo bueno, con el sesgo de vocabulario, sin forzar
  idioma cuando es `auto`, y que un carril que nadie escucha no gasta ni una
  petición. `openai-live` está verificado **contra un WebSocket local real** —el
  `session.update` con `turn_detection: null`, el audio remuestreado a 24 kHz,
  el commit al final del turno y su ausencia mientras se habla, los parciales y
  el final por separado, y la degradación sin `prompt`—, y su handshake contra
  la API de verdad ya se probó: fue lo que destapó los dos fallos del protocolo.
  Lo que **sigue sin comprobarse** es una reunión entera de principio a fin: que
  los turnos se cierren donde tienen que cerrarse con voz real, y qué tal
  transcribe comparado con Whisper local. Eso es escuchar y juzgar, y necesita
  a alguien delante.
- **Que una skill cambie de verdad el tono de una respuesta.** Verificado que
  llega al prompt —dónde va, con qué precedencia y que el perfil sobrevive—, y
  la carga desde disco contra carpetas de verdad, con sus casos raros. Lo que
  falta es lo que sólo se ve leyendo la salida: si con «Que no suene a IA»
  puesta el modelo deja de escribir «es importante destacar». Es una prueba a
  ojo y necesita una clave.
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
