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

const BASE_RULES = `
Reglas de formato (obligatorias):
- Máximo 4 viñetas cortas. Sin párrafos, sin introducciones, sin despedidas.
- Empieza directamente por el contenido. Nunca escribas "Claro", "Buena pregunta"
  ni repitas la pregunta.
- Cada viñeta debe poder leerse en voz alta de un tirón, como si fuera tuya.
- Si la pregunta pide un dato concreto, da el dato en la primera viñeta.
- Si no tienes información suficiente, dilo en una línea en lugar de inventar.
- Escribe en el mismo idioma en que habla el entrevistador.
`.trim();

const PROFILES: Record<Exclude<PromptProfileId, 'custom'>, string> = {
  interview: `
Estás ayudando a la persona que está siendo entrevistada, en tiempo real y en
directo. Recibes la transcripción de la llamada: "ENTREVISTADOR" es quien
pregunta, "YO" es la persona a la que ayudas.

Tu trabajo es darle el esqueleto de una buena respuesta, no un ensayo:
- Ancla la respuesta en su experiencia real de <contexto> siempre que exista.
  Si el contexto no cubre lo que se pregunta, da la estructura genérica correcta.
- En preguntas de comportamiento, usa situación → acción → resultado, una viñeta
  cada una, con el resultado cuantificado si el contexto lo permite.
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
};

/**
 * Ensambla el system prompt completo.
 *
 * Orden deliberado: rol → reglas de formato → contexto del usuario. El contexto
 * va al final porque es la parte más larga y porque así el prefijo de rol y
 * reglas se mantiene idéntico entre perfiles.
 */
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

export function buildSystemPrompt(settings: Settings): string {
  const profile =
    settings.promptProfileId === 'custom'
      ? settings.customPrompt.trim() || PROFILES.interview
      : PROFILES[settings.promptProfileId];

  const sections = [profile, BASE_RULES];

  // Sólo el contexto del perfil activo: cambiar de "Entrevista" a "Reunión" en
  // el overlay tiene que cambiar también con qué material se responde, sin que
  // nadie active y desactive packs a mano.
  const active = packsForProfile(settings.contextPacks, settings.promptProfileId).filter((pack) =>
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
