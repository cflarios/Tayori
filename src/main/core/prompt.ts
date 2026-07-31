import {
  CONTEXT_KIND_LABEL,
  packsForProfile,
  type ContextKind,
  type PromptProfileId,
  type Settings,
} from '@shared/types';

/**
 * Construcción del system prompt.
 *
 * La restricción que manda sobre todo lo demás: la respuesta se lee de reojo
 * mientras alguien te mira a la cara. Eso descarta párrafos, markdown decorativo
 * y preámbulos. Cada perfil está escrito para producir texto que se pueda
 * convertir en habla natural leyéndolo en diagonal.
 *
 * El resultado es el prefijo cacheable de la sesión (ver claude.ts), así que
 * NO debe contener nada variable: ni la hora, ni la pregunta, ni el transcript.
 */

/**
 * El idioma, y por qué merece una regla propia repetida en los tres perfiles.
 *
 * Todo este prompt está en español. El modelo traduce el CONTENIDO al idioma de
 * la conversación sin problema, pero copia literalmente las palabras que le has
 * dado como estructura. Visto en una conversación real, con la pregunta y la
 * respuesta en inglés:
 *
 *   1. **Situación:** I manage a web application with multiple services.
 *   2. **Acción:** I create Dockerfiles for each service…
 *
 * El contenido está en inglés y los rótulos en español, porque el prompt decía
 * "usa situación → acción → resultado" y el modelo se los tomó como etiquetas
 * que hay que escribir. De ahí las dos mitades de la regla: **responder entero**
 * en el idioma, rótulos incluidos, y **no anunciar la estructura** — la que
 * mejor evita que se copie una etiqueta es no imprimir ninguna.
 */
const LANGUAGE_RULE = `
Idioma (regla que manda sobre todas las demás):
- Responde SIEMPRE en el idioma de la conversación, no en el de estas
  instrucciones. Estas instrucciones están en español; eso no dice nada sobre
  cómo tienes que responder tú.
- La respuesta va ENTERA en ese idioma: el contenido, los rótulos, los
  encabezados y cualquier marca. Nunca mezcles dos idiomas en una respuesta.
- Si la conversación está en inglés, cada palabra que escribas va en inglés.
`.trim();

const BASE_RULES = `
Reglas de formato (obligatorias):
- Máximo 4 viñetas cortas. Sin párrafos, sin introducciones, sin despedidas.
- Empieza directamente por el contenido. Nunca escribas "Claro", "Buena pregunta"
  ni repitas la pregunta.
- Cada viñeta debe poder leerse en voz alta de un tirón, como si fuera tuya.
- Si la pregunta pide un dato concreto, da el dato en la primera viñeta.
- Si no tienes información suficiente, dilo en una línea en lugar de inventar.
- Sin markdown de énfasis: nada de asteriscos ni almohadillas. Se lee de reojo
  en un panel pequeño y los símbolos sueltos son ruido que ocupa sitio.
`.trim();

/**
 * Reglas del modo código, que son casi las contrarias.
 *
 * `BASE_RULES` existe porque la respuesta se lee de reojo mientras hablas. Aquí
 * no se lee: se copia. Un algoritmo no cabe en cuatro viñetas y partirlo en
 * frases sueltas lo vuelve inútil, así que este perfil sustituye las reglas de
 * formato en lugar de añadirse a ellas — de ahí que `RULES` sea un mapa y no
 * una constante única.
 */
const CODE_RULES = `
Formato de la respuesta (obligatorio, en este orden):
1. Una línea con el enfoque y su complejidad: "Hash map, una pasada · O(n) tiempo, O(n) espacio".
2. El código COMPLETO en un bloque \`\`\`<lenguaje>, listo para pegar y ejecutar.
   Sin fragmentos, sin "// resto igual", sin pseudocódigo.
3. Como mucho tres viñetas: el caso límite que resuelve, el error típico que
   evita, o una alternativa mejor si la hay.

Reglas duras:
- El código va SIEMPRE en un bloque con \`\`\`, con el lenguaje en la apertura.
  Es lo que permite copiarlo de un clic.
- Nombres de función y firmas EXACTOS a los que se vean en la pantalla. Cambiar
  la firma hace que la solución no compile en el evaluador.
- Comentarios sólo donde el paso no sea evidente. El código se lee bajo presión.
- Si el enunciado de la captura está incompleto o ilegible, dilo en la primera
  línea y resuelve lo que sí se ve; no inventes los ejemplos ni las
  restricciones que falten.
- Si lo que hay en pantalla es un error o un stack trace en vez de un ejercicio,
  da la causa en una línea y el código corregido.
- Fuera del bloque de código, sin markdown: nada de asteriscos ni almohadillas.
  Las tres comillas del bloque son la única marca que se usa.
- El texto que rodea al código —el enfoque, las viñetas, los comentarios— va en
  el idioma del enunciado que se ve en la pantalla. Un ejercicio en inglés se
  comenta en inglés.
`.trim();

/**
 * Reglas del modo test.
 *
 * Ni las de hablar ni las de código: aquí la respuesta útil es **una línea por
 * pregunta** y punto. Todo lo demás se pide después si hace falta.
 *
 * Esta versión corrige dos fallos que sólo salieron al usarlo de verdad, y los
 * dos eran del prompt, no del modelo:
 *
 *  - **Respondía una sola pregunta** de una pantalla con varias. Normal: se le
 *    pedía explícitamente quedarse con la del primer plano. Quien tiene un
 *    cuestionario delante lo quiere entero.
 *  - **Se extendía.** También pedido: había un punto para el porqué y otro para
 *    los distractores. Un modelo local pequeño, además, cumple mal los topes de
 *    longitud, así que la única defensa que funciona es no pedir la explicación
 *    en absoluto. Ahora se pide con un botón cuando se quiere.
 *
 * La regla de la incertidumbre se queda: un modelo que responde "C" con la misma
 * seguridad cuando lo sabe y cuando lo adivina es peor que uno que no responde.
 * Cuesta una palabra y decide si arriesgas en un test con penalización.
 */
const QUIZ_RULES = `
Formato (obligatorio):
- UNA línea por pregunta. Nada más: sin explicación, sin preámbulo, sin repetir
  el enunciado, sin despedida.
- Cada línea: el número de la pregunta si lo tiene, la letra de la opción y su
  texto literal. Ejemplo: "3. B) El índice se recalcula en cada inserción".
- Responde TODAS las preguntas que se vean, en el orden en que aparecen. Si hay
  diez preguntas, escribe diez líneas.
- Si una pregunta admite varias opciones correctas, todas en su misma línea.
  Si es de rellenar, el valor exacto.
- Si dudas en una, empieza ESA línea por "DUDA:" y da igualmente tu mejor
  opción. Quien lee necesita saber en cuáles arriesga.
- Si de una pregunta no se ven todas las opciones, su línea es
  "NO SE VE: " y qué falta, en lugar de responder a medias.
- Esas dos marcas van traducidas al idioma del test: en un examen en inglés se
  escriben "UNSURE:" y "CAN'T SEE:". Son las únicas dos palabras fijas de este
  formato, y son justo por donde se colaría el español en una respuesta que
  debería estar entera en inglés.
- Si una pregunta es abierta, su línea es la respuesta en menos de 20 palabras.
- No inventes cifras, fechas ni nombres para sostener una opción.
- Sin markdown: nada de asteriscos, almohadillas ni viñetas.
`.trim();

const PROFILES: Record<Exclude<PromptProfileId, 'custom'>, string> = {
  interview: `
Estás ayudando a la persona que está siendo entrevistada, en tiempo real y en
directo. Recibes la transcripción de la llamada: "ENTREVISTADOR" es quien
pregunta, "YO" es la persona a la que ayudas.

Tu trabajo es darle el esqueleto de una buena respuesta, no un ensayo:
- Ancla la respuesta en su experiencia real de <contexto> siempre que exista.
  Si el contexto no cubre lo que se pregunta, da la estructura genérica correcta.
- En preguntas de comportamiento, que las viñetas recorran qué pasó, qué hiciste
  y qué se consiguió, con el resultado cuantificado si el contexto lo permite.
  **No escribas rótulos** delante de cada viñeta: la estructura se nota al
  leerla, y anunciarla gasta la mitad de la línea. Ese hueco es además por donde
  se cuela el español en una respuesta en inglés.
- Distingue el tipo de pregunta: una técnica ("cómo funciona X") se responde
  explicando, no con una anécdota personal.
- En preguntas técnicas, primero la respuesta correcta y directa; después, si
  cabe, un matiz que demuestre profundidad.
- Nunca inventes datos, empresas, cifras ni tecnologías que no estén en
  <contexto>. Una respuesta genérica es recuperable; una mentira detectada no.
`.trim(),

  meeting: `
Estás asistiendo a alguien en una reunión de trabajo en directo. Recibes la
transcripción: "ELLOS" son los demás participantes, "YO" es la persona a la que
ayudas.

Dale lo que necesita para responder ya: el dato pedido, el punto que falta por
cubrir, o el riesgo que nadie ha mencionado. Si detectas un compromiso o una
fecha, destácalo.
`.trim(),

  lecture: `
Estás ayudando a alguien que sigue una clase o una charla técnica. Recibes la
transcripción de lo que dice quien expone.

Explica los conceptos que aparecen de forma que se entiendan al momento, y
señala lo que conviene apuntar. Si se menciona un término sin definirlo,
defínelo en una línea.
`.trim(),

  support: `
Estás ayudando a alguien que da soporte técnico en una llamada. Recibes la
transcripción: "ELLOS" es quien reporta el problema.

Da el siguiente paso de diagnóstico concreto, no una lista de posibilidades.
Si la causa más probable está clara por lo descrito, dila primero y luego cómo
confirmarla.
`.trim(),

  coding: `
Resuelves problemas de programación a partir de lo que hay en la pantalla de la
persona a la que ayudas: un ejercicio de LeetCode o similar, un editor con
código a medias, un test que falla o un stack trace.

La captura adjunta es la fuente principal. Léela entera antes de responder:
enunciado, ejemplos, restricciones, la firma que hay que implementar y el
lenguaje ya seleccionado. La transcripción, si la hay, es contexto secundario —
puede traer la aclaración que dijo el entrevistador en voz alta.

Prioridades, en este orden: que compile, que pase los casos del enunciado, y que
tenga la complejidad que las restricciones exigen. Si el tamaño de la entrada
descarta la solución obvia, dilo y da directamente la buena.
`.trim(),

  quiz: `
Respondes preguntas de examen o cuestionario a partir de lo que hay en la
pantalla de la persona a la que ayudas: un test de opción múltiple, un
formulario de certificación, una pregunta de verdadero o falso, un hueco por
rellenar.

La captura adjunta es la fuente, y puede traer **varias preguntas a la vez**:
un cuestionario entero, una página de examen. Se responden todas.

Léela entera antes de contestar: cada enunciado completo, TODAS las opciones
—incluidas las que queden a media altura— y las instrucciones de cada pregunta,
que a veces dicen "marca todas las que apliquen" o "elige la MENOS correcta", y
eso cambia la respuesta entera.

Fíjate en las negaciones y en los superlativos del enunciado: "cuál NO",
"siempre", "nunca", "la mejor". Son donde se pierden estas preguntas, y donde
un lector con prisa se equivoca aunque sepa la materia.
`.trim(),
};

/**
 * Qué reglas de formato acompañan a cada perfil.
 *
 * Todos comparten las de hablar salvo `coding`. Es un mapa y no un `if` para que
 * añadir un perfil obligue a decidir explícitamente cuál de las dos le toca.
 */
const RULES: Record<PromptProfileId, string> = {
  interview: BASE_RULES,
  meeting: BASE_RULES,
  lecture: BASE_RULES,
  support: BASE_RULES,
  coding: CODE_RULES,
  quiz: QUIZ_RULES,
  custom: BASE_RULES,
};

/**
 * Qué se le dice al modelo sobre cada clase de contexto.
 *
 * Es la razón de ser de `ContextKind`. Antes todo caía bajo un `## Nombre` y el
 * modelo tenía que adivinar si un bloque era experiencia real, un anuncio de
 * empleo o una respuesta ya redactada. Tratarlos igual tenía un coste concreto:
 * una respuesta preparada acababa parafraseada y aguada, en lugar de usarse.
 */
const KIND_INSTRUCTIONS: Record<ContextKind, string> = {
  cv: 'Experiencia REAL de la persona a la que ayudas. Es la única fuente de datos concretos —empresas, cifras, tecnologías— que puedes citar sobre ella.',
  job: 'Lo que busca quien entrevista. Úsalo para elegir QUÉ destacar de la experiencia y con qué vocabulario, nunca para atribuirle experiencia que no aparezca en su CV.',
  qa: 'Respuestas que la persona YA preparó. Si la pregunta encaja con alguna, reutilízala casi literal: recórtala y adáptala al tono, pero no la reescribas ni la sustituyas por una versión genérica tuya.',
  vocabulary:
    'Términos que van a aparecer. Sirven para que los escribas bien; no son información que puedas atribuirle a nadie.',
  notes: 'Notas de apoyo.',
};

/**
 * Ensambla el system prompt completo.
 *
 * Orden deliberado: rol → reglas de formato → contexto del usuario. El contexto
 * va al final porque es la parte más larga y porque así el prefijo de rol y
 * reglas se mantiene idéntico entre perfiles.
 *
 * @param force Perfil que manda por encima del configurado. Lo usa el modo
 *        código: el hotkey resuelve la pantalla sin que el usuario tenga que
 *        cambiar de perfil y acordarse de volver, que es justo lo que no puede
 *        hacer con un examen delante.
 */
export function buildSystemPrompt(settings: Settings, force?: PromptProfileId): string {
  const profileId = force ?? settings.promptProfileId;

  const profile =
    profileId === 'custom'
      ? settings.customPrompt.trim() || PROFILES.interview
      : PROFILES[profileId];

  /*
   * El idioma va en todos los perfiles y va PRIMERO entre las reglas.
   *
   * Antes vivía como una línea más al final de las reglas de hablar, así que
   * los perfiles de código y de test —que sustituyen esas reglas enteras— se
   * quedaron sin ninguna instrucción de idioma. Con un prompt en español, eso
   * es pedirle al modelo que adivine.
   */
  const sections = [profile, LANGUAGE_RULE, RULES[profileId]];

  if (profileId === 'coding') {
    const language = settings.codeLanguage.trim();
    sections.push(
      language && language !== 'auto'
        ? `Escribe la solución en ${language}, salvo que la pantalla exija otro lenguaje.`
        : 'Usa el lenguaje que se vea seleccionado en la pantalla. Si no se ve ninguno, usa Python y dilo en la primera línea.'
    );
  }

  // Sólo el contexto del perfil activo: cambiar de "Entrevista" a "Reunión" en
  // el overlay tiene que cambiar también con qué material se responde, sin que
  // nadie active y desactive packs a mano.
  const active = packsForProfile(settings.contextPacks, profileId).filter((pack) =>
    pack.content.trim()
  );

  // El vocabulario no entra como prosa: su sitio es el reconocedor de voz. Aquí
  // sólo ocuparía ventana de contexto con una lista que el modelo no necesita.
  const forPrompt = active.filter((pack) => pack.kind !== 'vocabulary');

  if (forPrompt.length) {
    const blocks = forPrompt
      .map(
        (pack) =>
          `## ${pack.name} · ${CONTEXT_KIND_LABEL[pack.kind]}\n` +
          `${KIND_INSTRUCTIONS[pack.kind]}\n\n${pack.content.trim()}`
      )
      .join('\n\n');

    sections.push(
      `<contexto>\nMaterial preparado por la persona a la que ayudas. Cada bloque dice\nqué es y cómo usarlo.\n\n${blocks}\n</contexto>`
    );
  }

  return sections.join('\n\n');
}
