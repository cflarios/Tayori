# Changelog

Todos los cambios relevantes de este proyecto se documentan en este archivo.
El contenido de cada versión se genera automáticamente a partir de los commits
que siguen el formato [Conventional Commits](https://www.conventionalcommits.org/).

## [0.4.0](https://github.com/cflarios/Tayori/compare/v0.3.0...v0.4.0) (2026-08-02)


### Features

* asistente de configuración, publicación MQTT y dos fallos silenciosos ([c1285eb](https://github.com/cflarios/Tayori/commit/c1285eb07863a9d8c02a68e6efe1c24353f29913))
* dashboard por secciones y espejo de respuestas en el móvil ([ceb0351](https://github.com/cflarios/Tayori/commit/ceb0351ed88f036983ab078c4a9264a3aaaf3beb))
* renombrar el proyecto a Tayori ([24b9d8b](https://github.com/cflarios/Tayori/commit/24b9d8b698c1699da041d9cf04b51f81d3a1dd99))

## [0.3.0](https://github.com/cflarios/jarvis-job/compare/v0.2.0...v0.3.0) (2026-07-31)


### Features

* contexto con tipo y perfil, guiado desde el dashboard ([55af5cb](https://github.com/cflarios/jarvis-job/commit/55af5cb9fe568c337371275ae916bce37bfaf795))
* escribir el id de un modelo de nube que no esté en la lista ([a5cdbb9](https://github.com/cflarios/jarvis-job/commit/a5cdbb9a64d15836acdc91528d71b454cb476d41))
* estado central en el overlay, y arreglos de fuentes e idioma ([353d8d2](https://github.com/cflarios/jarvis-job/commit/353d8d27d16cc837fca58862d7968f170353f510))
* guía de modelos como documento, con multimodales y precios de nube ([4506ee4](https://github.com/cflarios/jarvis-job/commit/4506ee43225039476171e967bc43f3314a557b8b))
* historial en el overlay, modo compacto, atajos editables y guía inicial ([8623de9](https://github.com/cflarios/jarvis-job/commit/8623de9ec275d063d5a8d44470d852f0deadb523))
* la escucha y las fuentes de audio, en el overlay ([4bf426c](https://github.com/cflarios/jarvis-job/commit/4bf426c03130e579e3b0b403fa26086c761b5c19))
* modo test, modelo aparte para la pantalla y contexto de Ollama a la vista ([fcdd862](https://github.com/cflarios/jarvis-job/commit/fcdd862ab987b2c5db0b45c6cf45bd50212dca6e))
* resolver el código que hay en pantalla, con Ctrl+Alt+C ([1d1663e](https://github.com/cflarios/jarvis-job/commit/1d1663ebe5b03b78b86c0c3580b77e34f58900f3))


### Bug Fixes

* el botón de copiar no podía funcionar desde el overlay ([5d8dd36](https://github.com/cflarios/jarvis-job/commit/5d8dd36a76e6c31698d3769844d648ee94be6ff4))
* el contexto antes del historial, y el historial deja de crecer sin techo ([d43131b](https://github.com/cflarios/jarvis-job/commit/d43131b15dd50896bbc977d2ed4e0ae6bab608ab))
* el modo test responde todas las preguntas, sin asteriscos y sin sermón ([eec4a56](https://github.com/cflarios/jarvis-job/commit/eec4a562c5b57752937081be62ecf7a4717c1f95))
* negociar la modalidad de Gemini Live y explicar los descartes en pantalla ([7b2c02c](https://github.com/cflarios/jarvis-job/commit/7b2c02cda912d2e4f9bdc25d7f3f76436da64060))
* responder a la pregunta completa, no al titubeo que la precede ([1464d45](https://github.com/cflarios/jarvis-job/commit/1464d45adcdebcf09debc827e6e59ba161f16fa2))

## [0.2.0](https://github.com/cflarios/jarvis-job/compare/interview-helper-v0.1.0...interview-helper-v0.2.0) (2026-07-28)


### Features

* historial de conversaciones y controles nuevos en el overlay ([03fd201](https://github.com/cflarios/jarvis-job/commit/03fd20190252d5b1fd8ceb3e428267138a74372c))
* modo local funcional, historial, diagnostico y audio directo ([b65f9e3](https://github.com/cflarios/jarvis-job/commit/b65f9e383e81a40c09e83c583296f6b2ef9e664a))
* motor de audio directo con Gemini, y timeout en el handshake de Live ([1a7d1e8](https://github.com/cflarios/jarvis-job/commit/1a7d1e8c521b9f1c4fcb64bda72ce15441759eda))
* pestanas de escucha/escritura en el overlay y arreglos del modelo local ([04c692d](https://github.com/cflarios/jarvis-job/commit/04c692da8239e478923ef3713afae616ed7bb4b1))


### Bug Fixes

* antialiasing en el remuestreo, rescate del VAD y tiempos limite ([3edeab6](https://github.com/cflarios/jarvis-job/commit/3edeab6d5863de3e9a4790d66d937eac8f404c05))
* diagnostico visible, fallback de Gemini Live y recall del detector ([bd89462](https://github.com/cflarios/jarvis-job/commit/bd894628560727f4f5be49b6e80098fa733c7512))
* effort solo en modelos que lo aceptan, idioma visible y preguntas cortas ([ed1235a](https://github.com/cflarios/jarvis-job/commit/ed1235a712e896ac00333f635dbc9f55ffa5a6a2))
* el asistente ahora recuerda sus propios turnos ([d484a17](https://github.com/cflarios/jarvis-job/commit/d484a17133363a288eb944c8705d9510f2880c5a))
* orden correcto de los modelos de Gemini Live ([146632d](https://github.com/cflarios/jarvis-job/commit/146632d4bd7b4e576869b890f81eb971eea3e2f9))
* recuperar el motivo real del fallo de Live y no truncar el JSON del audio ([4609462](https://github.com/cflarios/jarvis-job/commit/4609462c73c6dca289b05a5f0b312ee9057ead78))


### Performance Improvements

* whisper-server con el modelo residente en vez de un proceso por turno ([2aafc17](https://github.com/cflarios/jarvis-job/commit/2aafc17eb25baabd7b37b65ecacb331b503cb30b))

## [0.1.0] - 2026-07-26

### Added

- Primera versión funcional de Audio Helper.
