# Changelog

All notable changes to this project are documented in this file. Each release's
contents are generated automatically from commits following the
[Conventional Commits](https://www.conventionalcommits.org/) format.

> Entries up to and including **1.6.0** are in Spanish, mirroring the commit
> history at the time. From the next release onward they are in English.

## [1.8.0](https://github.com/cflarios/Tayori/compare/v1.7.0...v1.8.0) (2026-08-16)


### Features

* **dashboard:** custom profiles in the same grid, visual decoy picker ([cd88272](https://github.com/cflarios/Tayori/commit/cd88272b4ea0c1f8f9f44ef38ea3e0b9792b94cf))
* **dashboard:** interpreter languages always configurable ([7e672ec](https://github.com/cflarios/Tayori/commit/7e672ecd45f61023f8720a6562bc63327f172a43))
* **dashboard:** localize built-in profile prompts by interface language ([b587667](https://github.com/cflarios/Tayori/commit/b58766714196ef1e7584aa9a91ac17ce233bf041))
* **dashboard:** quit the app from the nav footer ([a9c06e2](https://github.com/cflarios/Tayori/commit/a9c06e2d0274c52df59ef7813977748746e64e32))
* **overlay:** chat thread in Write, plus compact-bar and input polish ([88e6c9b](https://github.com/cflarios/Tayori/commit/88e6c9bedc3ddf70e3542d395e629ead41578231))
* **overlay:** cross-provider answer-model picker ([3900a56](https://github.com/cflarios/Tayori/commit/3900a560fc82ffff656f1b0e75e6c7f375e46559))
* **overlay:** eye toggle left of Solve screen in the bar ([4619327](https://github.com/cflarios/Tayori/commit/4619327a480c04563c31c5d82bc20013031a7c3a))
* **overlay:** fold audio sources into a split listen control ([5ab3d5a](https://github.com/cflarios/Tayori/commit/5ab3d5ab1120dcbc49ad7875f888926e8e5432c7))
* **overlay:** input-shaped write launcher in the idle state ([8d8760d](https://github.com/cflarios/Tayori/commit/8d8760daf459bb5f0d2fe8f134e393892987caf3))
* **overlay:** model dropdown on the profile row, drop speaker from listen caret ([84fef59](https://github.com/cflarios/Tayori/commit/84fef59edfd2d5d044e2a9b7db1c59f1c3d38ee5))
* **overlay:** profile dropdown and a footer home for Solve screen ([6251abb](https://github.com/cflarios/Tayori/commit/6251abbdf177083fb23fed2bbaa3320ab06057a1))
* **overlay:** profile dropdown in the compact bar, icon-only visibility toggle ([e99f998](https://github.com/cflarios/Tayori/commit/e99f998aa7b1d921b87f08f4d667fc92183c6ab1))
* **overlay:** show the question above its answer ([bb3ff94](https://github.com/cflarios/Tayori/commit/bb3ff94bb94359a77de0488669e2669aa0d21226))
* **overlay:** shrink the window to content in compact mode ([aafc8ec](https://github.com/cflarios/Tayori/commit/aafc8ecdd1073e77597c1945da92ce64a6ba58a1))
* **overlay:** single-row status bar in compact mode ([f6ddc15](https://github.com/cflarios/Tayori/commit/f6ddc15a7fc17c3bfc4ca056398f530734fbf98f))
* **overlay:** sonar listening pulse and a clearer quit icon ([4d7d734](https://github.com/cflarios/Tayori/commit/4d7d734115d877d29594eb876778eca4a5d07d9c))
* **overlay:** visibility toggle in the bar, prettier write field, robust compact fit ([430bb80](https://github.com/cflarios/Tayori/commit/430bb80e6935c04df23692d7361b5daf438b6807))
* **profiles:** custom profiles get a hide switch too, styled like built-ins ([32280a5](https://github.com/cflarios/Tayori/commit/32280a55cf76efeb3aab757baaad5c90017e90dd))
* **profiles:** editable built-ins, soft-delete + restore, interpreter as a mode ([8b2d4e8](https://github.com/cflarios/Tayori/commit/8b2d4e888dfbb189085fbcb2fdcbc6fc858fa347))
* **profiles:** hide built-ins and create your own, from the dashboard ([436359a](https://github.com/cflarios/Tayori/commit/436359a072083daee46913262e24f528178b9f37))
* **profiles:** remove built-in profiles, not just hide them ([36eb0aa](https://github.com/cflarios/Tayori/commit/36eb0aae650aa45d45bea9b09ffc681d0d938878))
* **stealth:** decoy taskbar icon and title ([40b1bba](https://github.com/cflarios/Tayori/commit/40b1bbac7bfd5ef46723f10e809fdccbbdd45a17))
* **stealth:** keep the disguised taskbar entry while stealthy ([165ec30](https://github.com/cflarios/Tayori/commit/165ec306b28d0b4c992c0082e5475831c3aaf9de))


### Bug Fixes

* **interpreter:** don't append the pinned-language directive when translating ([d8b4871](https://github.com/cflarios/Tayori/commit/d8b48716632a4a2464afb02baac638ecb9dbece3))
* **interpreter:** hold weak local models to translating, not answering ([93532c2](https://github.com/cflarios/Tayori/commit/93532c2f20cf74a0ff6c353eb4c8286e2dd3c593))
* **overlay:** compact window actually shrinks, and its menus aren't clipped ([0328054](https://github.com/cflarios/Tayori/commit/03280543c36867b56ec55476201bb395f037a9bb))
* **overlay:** question and answer share one scroll region ([2f70f46](https://github.com/cflarios/Tayori/commit/2f70f463146a5f278818a1378cc513a0570e3c01))
* **stealth:** apply the decoy icon live, without a stealth toggle ([0a44751](https://github.com/cflarios/Tayori/commit/0a44751de0a18b0873a98c46d9c3e78ca6655dc3))

## [1.7.0](https://github.com/cflarios/Tayori/compare/v1.6.2...v1.7.0) (2026-08-15)


### Features

* general on-screen help action and a pinnable answer language ([4146fcd](https://github.com/cflarios/Tayori/commit/4146fcd1e015c4552cd1c938604eef6598226a0c))
* **history:** label screen actions and add conversation search ([5d8f1cb](https://github.com/cflarios/Tayori/commit/5d8f1cba47f40ea51297bb69f26d48a207705e97))

## [1.6.2](https://github.com/cflarios/Tayori/compare/v1.6.1...v1.6.2) (2026-08-14)


### Bug Fixes

* **overlay:** keep the overlay on top and recoverable ([2f0211e](https://github.com/cflarios/Tayori/commit/2f0211eef8aac3e8977f3cbf3824efc2f3aad940))

## [1.6.1](https://github.com/cflarios/Tayori/compare/v1.6.0...v1.6.1) (2026-08-14)


### Bug Fixes

* **stt:** reintentar whisper-server tras un fallo transitorio ([70e8edb](https://github.com/cflarios/Tayori/commit/70e8edb6c920e39b1833ab907c9f5287d58fcb35))

## [1.6.0](https://github.com/cflarios/Tayori/compare/v1.5.1...v1.6.0) (2026-08-13)


### Features

* **overlay:** botón de copiar para cualquier respuesta, no solo código ([b840f2e](https://github.com/cflarios/Tayori/commit/b840f2ec3bb86299c93887b891876b68a2208cd2))


### Bug Fixes

* **interpreter:** la traducción salía envuelta en etiquetas XML traducidas ([dff5d05](https://github.com/cflarios/Tayori/commit/dff5d05cefa26a6a589ebf8704f0314ee98d9d70))

## [1.5.1](https://github.com/cflarios/Tayori/compare/v1.5.0...v1.5.1) (2026-08-13)


### Bug Fixes

* **overlay:** quita el always-on-top del dashboard, la causa raíz del bloqueo ([51377b5](https://github.com/cflarios/Tayori/commit/51377b53f1cfbdcceab5d7bde20bd7d4705edb17))

## [1.5.0](https://github.com/cflarios/Tayori/compare/v1.4.0...v1.5.0) (2026-08-13)


### Features

* **brand:** el fantasmita de Tayori en el dashboard y como icono del .exe ([8a4dc8e](https://github.com/cflarios/Tayori/commit/8a4dc8edccf45555c8da73627a9cb0263910c9f6))
* **brand:** el fantasmita también en el asistente de primer arranque ([68e9e1b](https://github.com/cflarios/Tayori/commit/68e9e1b6ad78b081cb8ce384bc876fe3713adac1))
* modo idle (apagado por inactividad) y botón de comprobar actualizaciones ([d485c4f](https://github.com/cflarios/Tayori/commit/d485c4fe27bcfa406893a77584a3dc35ba13d7ef))
* **stealth:** excluye también el dashboard de la captura de pantalla ([05175b1](https://github.com/cflarios/Tayori/commit/05175b1d24566999a8ea2fdbf20a7e95f3315cbc))
* **ui:** dashboard persistente como el overlay y marco "detectable" por fuera ([9ace8ae](https://github.com/cflarios/Tayori/commit/9ace8aedb5b09d4ae61ace8b2140676f7c098154))
* **ui:** marco discontinuo rojo cuando el sigilo está apagado (overlay y dashboard) ([f345dd3](https://github.com/cflarios/Tayori/commit/f345dd31f4340af0ab9f501038ec578f21bde3f7))


### Bug Fixes

* **overlay:** desbloquea el overlay tras abrir y cerrar el dashboard ([e4f5329](https://github.com/cflarios/Tayori/commit/e4f53299377321de17f5959b752f08caa4713aeb))
* **overlay:** resync real del ratón al cerrar el dashboard (el fix anterior no bastaba) ([fed7996](https://github.com/cflarios/Tayori/commit/fed799661a29030bfc915c70e4f3bd8de1982341))
* **wizard:** columna centrada y marco de "detectable" en el asistente ([8d15824](https://github.com/cflarios/Tayori/commit/8d15824cfab6ad9222abe4b65af44c70e62fac09))

## [1.4.0](https://github.com/cflarios/Tayori/compare/v1.3.0...v1.4.0) (2026-08-13)


### Features

* **dashboard:** mini-perfiles de modelos y estrella de favoritos locales ([407fe5b](https://github.com/cflarios/Tayori/commit/407fe5bcdfd144207d4df047de70f7199366220d))
* **dashboard:** referencia los proyectos hermanos TayoriESP32 y tayori-web ([1415023](https://github.com/cflarios/Tayori/commit/1415023a359bb3d90b17d061d962b9a453309a0b))
* más modelos de Whisper y modo intérprete ([dd20737](https://github.com/cflarios/Tayori/commit/dd20737815e599c4c17bff10b4ecabfd6ef5f309))


### Bug Fixes

* **dashboard:** la mención a TayoriESP32 ahora siempre se ve en la tab MQTT ([bbdc649](https://github.com/cflarios/Tayori/commit/bbdc64968908710e29bf3792cd512d7fa04b64b2))


### Performance Improvements

* **dashboard:** cachea las specs del sistema para acelerar Modelos y Transcripción ([e4f3275](https://github.com/cflarios/Tayori/commit/e4f3275035d072aa8ccf40f4a8877d628ba54bf1))

## [1.3.0](https://github.com/cflarios/Tayori/compare/v1.2.0...v1.3.0) (2026-08-12)


### Features

* captura por trozos para pruebas en pantalla compartida ([ca3d452](https://github.com/cflarios/Tayori/commit/ca3d452baaa70320e2021108100d47970379e137))
* catálogo de Gemini actualizado a 3.6 Flash ([0f96e4a](https://github.com/cflarios/Tayori/commit/0f96e4af36e85a71ac5991630e82bd3e8ed4e9b0))
* contexto rediseñado en tarjetas y subida de PDF/Word ([ed4f3fd](https://github.com/cflarios/Tayori/commit/ed4f3fdf974f1f5472d0b30a7d8ff480863a9f51))
* soluciones largas — el móvil como lector y "Continuar" ([592c1cc](https://github.com/cflarios/Tayori/commit/592c1cc726ee95e3257e35a4116788dd304f42b0))

## [1.2.0](https://github.com/cflarios/Tayori/compare/v1.1.0...v1.2.0) (2026-08-12)


### Features

* fórmulas matemáticas legibles en el overlay, sin LaTeX crudo ([b53c943](https://github.com/cflarios/Tayori/commit/b53c943c72edb4ed5520a5a92b2ab8e3fe3ff7d5))
* rediseño del front — fuentes segmentadas, barra de título Mac y scrollbar ([44e92a6](https://github.com/cflarios/Tayori/commit/44e92a6027ac5370b588e566fa94c965c6927b34))

## [1.1.0](https://github.com/cflarios/Tayori/compare/v1.0.0...v1.1.0) (2026-08-04)


### Features

* defensa contra inyección de prompts, en los cinco proveedores ([88f9b6f](https://github.com/cflarios/Tayori/commit/88f9b6fe550c229c9c2ab7727d5a49c462500424))
* interruptor por atajo, para soltar la combinación ([975b454](https://github.com/cflarios/Tayori/commit/975b454eeaf2233c24d35488b84e84de2d4630bb))
* modo teleprompter, y la barra del overlay reordenada ([7b6c8e4](https://github.com/cflarios/Tayori/commit/7b6c8e41252a3e9d704acdd54d0b5d4a18a22a50))

## [1.0.0](https://github.com/cflarios/Tayori/compare/v0.4.0...v1.0.0) (2026-08-03)


### Features

* añadir ChatGPT (OpenAI) como proveedor de respuestas ([4e74358](https://github.com/cflarios/Tayori/commit/4e74358432fa3f5c4cce9640be37dd03f73f69ba))
* DeepSeek como quinto proveedor, y tres arreglos de UX ([76adc07](https://github.com/cflarios/Tayori/commit/76adc07452f0621647073a51159506a7c1794fc6))
* repaso del asistente, «Acerca de» y probar cada clave donde se pega ([834e634](https://github.com/cflarios/Tayori/commit/834e6342a5907c0aebd163e140d38dc0249d82c9))
* skills locales en formato SKILL.md ([006dbbb](https://github.com/cflarios/Tayori/commit/006dbbb60ad2733db7677333ddf54af15584dca6))
* soporte de inglés y español, con inglés por defecto ([50f2f8a](https://github.com/cflarios/Tayori/commit/50f2f8af7bcc2bb2604ac429c65d2f99e290599e))
* terminar la traducción de la interfaz al inglés ([9c5047f](https://github.com/cflarios/Tayori/commit/9c5047f99417929f914106e7a724aa0a83b9e2c6))
* transcripción con OpenAI, en directo y por turnos ([d379b59](https://github.com/cflarios/Tayori/commit/d379b595624f4320e91fef2c3dedc66f33bebe47))


### Bug Fixes

* "explica X" es una petición, aunque no lleve signo de interrogación ([714d599](https://github.com/cflarios/Tayori/commit/714d5998abbdf2bbc400ce54ecf8f07be2294153))
* el aviso de "falta configurar la IA" se quedaba pegado ([22d2f41](https://github.com/cflarios/Tayori/commit/22d2f417862aab77161f50c75903ace187899ef6))
* el chip «Ambos» enseñaba la clave en crudo, y la navegación se traduce ([f407ff2](https://github.com/cflarios/Tayori/commit/f407ff2f9c54d4b6e77d152a0f5034dc374e4907))
* la frase salía dos veces, y las preguntas sin signo no disparaban ([d9242a4](https://github.com/cflarios/Tayori/commit/d9242a41401d15184e020b61ee65e57294378404))
* openai-live no arrancaba, y no habría cerrado ningún turno ([ed3840a](https://github.com/cflarios/Tayori/commit/ed3840a6a08b6b7c347ff549de80419c648914a8))


### Documentation

* registrar la segunda pasada de traducción y por qué hizo falta ([54c75da](https://github.com/cflarios/Tayori/commit/54c75da36c10d2ddfd69f6efd63b9f5fe3bf466a))

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

- Primera versión funcional de Tayori.
