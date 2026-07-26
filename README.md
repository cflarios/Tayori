# Interview Helper

Asistente de IA en tiempo real para reuniones y entrevistas. Escucha la llamada,
transcribe quién dice qué, y sugiere respuestas en un overlay que **no aparece
cuando compartes pantalla**.

Open source, MIT, sin monetización. Todo corre en tu máquina y las llamadas van
directas al proveedor de IA que elijas — no hay servidor intermedio.

## Qué hace

- **Escucha dos fuentes por separado**: tu micrófono y el audio del sistema. Eso
  permite saber quién habla sin diarización.
- **Transcribe en vivo** con Gemini Live (~300 ms) o Whisper local (offline).
- **Sugiere respuestas** con Claude, Gemini u Ollama, en streaming.
- **Detecta preguntas** dirigidas a ti y responde sin que pulses nada, o solo con
  hotkey si prefieres controlarlo.
- **Adjunta capturas de pantalla** como contexto visual para preguntas sobre
  código o diagramas en pantalla.
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

1. Arranca la app. El dashboard se abre solo si no hay ninguna key configurada.
2. Pega tu API key de Anthropic o de Google.
3. En **Contexto**, añade tu CV y la descripción del puesto. Esto es lo que
   evita que el modelo invente experiencia que no tienes, y además mejora el
   reconocimiento de nombres propios y siglas.
4. Pulsa **Empezar a escuchar** y comprueba que los dos medidores se mueven: el
   de arriba al hablar tú, el de abajo al reproducir cualquier audio.
5. El overlay aparece arriba a la derecha. Muévelo con `Ctrl+Alt+flechas`.

## Atajos de teclado

Todos son globales: funcionan aunque la ventana de la videollamada tenga el foco.

| Atajo | Acción |
|---|---|
| `Ctrl+Enter` | Responder ahora |
| `Ctrl+Shift+S` | Capturar pantalla y responder |
| `Ctrl+Shift+H` | Mostrar u ocultar el overlay |
| `Ctrl+Shift+M` | Empezar o parar de escuchar |
| `Ctrl+Shift+C` | Alternar clics atravesables |
| `Ctrl+Shift+D` | Abrir el dashboard |
| `Ctrl+Alt+←↑→↓` | Mover el overlay |

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
  abiertas. El proceso `Interview Helper` es perfectamente visible en el
  Administrador de tareas.
- Lo que **digas por el micrófono**. Si lees la sugerencia en voz alta, se oye.
- Alguien mirando por encima de tu hombro.

Requiere Windows 10 2004 o superior. En versiones anteriores el sistema degrada
a `WDA_MONITOR` y la ventana sale como un **rectángulo negro** — más llamativo
que no ocultarla. Verifica tu versión con `winver` antes de confiar en esto.

## Latencia y privacidad: el compromiso

| Motor de transcripción | Latencia | Dónde va el audio |
|---|---|---|
| Gemini Live | ~300 ms | A Google |
| Whisper local | ~1–2 s | A ningún sitio |

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

## Consideraciones legales

Grabar o transcribir una conversación sin consentimiento es ilegal en bastantes
jurisdicciones, y muchas empresas lo prohíben en sus procesos de selección.
Comprueba qué aplica en tu caso; la responsabilidad de usar esto es tuya.

## Licencia

MIT.
