# Changelog

Todos los cambios relevantes de este proyecto se documentan en este archivo.
El contenido de cada versión se genera automáticamente a partir de los commits
que siguen el formato [Conventional Commits](https://www.conventionalcommits.org/).

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
