import type { UIKey } from './i18n';
import type { Skill } from './types';

/**
 * Skills: loose instructions that refine HOW the model answers.
 *
 * A skill isn't a profile or a context pack, and the difference matters because
 * all three end up in the same system prompt:
 *
 * | | What it adds |
 * |---|---|
 * | Profile | Who you are and with what **shape** it answers (4 bullets, code, quiz) |
 * | Context pack | **Material**: the CV, the job offer, prepared answers |
 * | Skill | **Manner**: tone, word choice, what to avoid when writing |
 *
 * The format is Anthropic's —a folder with a `SKILL.md` carrying frontmatter and
 * the body in Markdown— and it's implemented here instead of bringing a
 * dependency because it's a **convention**, not an algorithm: reading two fields
 * and splitting on `---` is thirty lines, and its failure shows (the skill
 * doesn't load and says so). It's the same criterion that left out
 * `electron-store` and that did justify the QR encoder, whose failure was
 * invisible.
 *
 * Everything in this file is **pure**: both sides need it —the main process to
 * load and apply, the renderer to autocomplete what you type— and a second
 * implementation on the other side would end up recognizing different things.
 */

/**
 * The two characters that invoke a skill at the start of a message.
 *
 * Two and not one because keyboards don't agree: `/` is the chats' convention,
 * and `$` is where `/` is awkward on some layouts.
 */
export const SKILL_PREFIXES = ['/', '$'] as const;

/**
 * What a skill is called **for whoever reads it**.
 *
 * The user's carry the name in their frontmatter and there's nothing to
 * translate there; the built-in ones we write ourselves, so they carry a key. It
 * lives here and not in each screen because the name is painted in three places
 * —the overlay dropdown, the dashboard list and the autocomplete— and three
 * copies of this `??` would end up disagreeing.
 */
export function skillName(
  t: (key: UIKey) => string,
  skill: Pick<Skill, 'name' | 'nameKey'>
): string {
  return skill.nameKey ? t(skill.nameKey) : skill.name;
}

/** The same with the description. It can come out empty: not all carry one. */
export function skillDescription(
  t: (key: UIKey) => string,
  skill: Pick<Skill, 'description' | 'descriptionKey'>
): string {
  return skill.descriptionKey ? t(skill.descriptionKey) : skill.description;
}

/**
 * A skill's id comes from the **name of its folder**, not the frontmatter.
 *
 * It's what makes the id stable and visible: you type `/my-skill` and see the
 * folder to open to edit it. If it came from the `name` field, changing the
 * file's title would change how it's invoked without anything saying so.
 */
export function skillIdFromFolder(folder: string): string {
  return folder
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Reads a `SKILL.md`: minimal YAML frontmatter between `---`, and the body below.
 *
 * «Minimal YAML» is literal and deliberate: `key: value` per line, with the
 * following indented lines treated as continuation —so a long description can be
 * split at 80 columns without breaking— and unknown keys ignored, so a
 * `SKILL.md` written for another tool doesn't fail here for bringing extra
 * fields.
 *
 * What it does **not** do: lists, nesting, or `|`/`>` blocks. A SKILL.md that
 * needs them is asking for a real YAML parser, and that's a dependency this
 * function exists to not have.
 */
export function parseSkillFile(raw: string, id: string, builtIn = false): Skill {
  // A file written with Notepad arrives with a BOM and `---` would stop matching.
  const text = (raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw).replace(/\r\n/g, '\n');

  const skill: Skill = { id, name: id, description: '', instructions: '', builtIn };

  const match = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(text.trimStart());
  if (!match) {
    return { ...skill, error: 'sk.errNoFrontmatter' };
  }

  const fields = parseFrontmatter(match[1] ?? '');
  const body = text.trimStart().slice(match[0].length).trim();

  if (fields.name) skill.name = fields.name;
  if (fields.description) skill.description = fields.description;
  skill.instructions = body;

  /*
   * An empty body is the only real error. Without `name` the folder's id is used
   * and without `description` the list looks bland, but both still work; a skill
   * without instructions **does nothing**, and a skill that does nothing but
   * appears on is exactly the kind of silent failure this project chases.
   */
  if (!body) {
    return { ...skill, error: 'sk.errNoBody' };
  }

  return skill;
}

/** `key: value`, with continuation on the indented lines. */
function parseFrontmatter(block: string): Record<string, string> {
  const fields: Record<string, string> = {};
  let current = '';

  for (const line of block.split('\n')) {
    if (!line.trim()) continue;

    // Indented and with a key already open: it's the continuation of its value.
    if (/^\s/.test(line) && current) {
      fields[current] = `${fields[current] ?? ''} ${line.trim()}`.trim();
      continue;
    }

    const pair = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (!pair) continue;

    current = pair[1]!.toLowerCase();
    fields[current] = unquote(pair[2] ?? '');
  }

  return fields;
}

function unquote(value: string): string {
  const trimmed = value.trim();
  const quoted = /^(['"])([\s\S]*)\1$/.exec(trimmed);
  return quoted ? (quoted[2] ?? '') : trimmed;
}

/**
 * Splits `/skill-name rest of the question` into its two parts.
 *
 * **It only recognizes skills that exist**, and that's not a superfluous check:
 * if any `/word` were treated as an invocation, writing «/etc is full of
 * configuration» would lose the first word of the question and the model would
 * answer something else without anything warning of it. With the list in front,
 * what doesn't match stays as text, which is what the user typed.
 */
export function parseSkillInvocation(
  text: string,
  known: readonly Pick<Skill, 'id'>[]
): { skillId?: string; text: string } {
  const match = /^([/$])([A-Za-z0-9._-]+)(?:\s+([\s\S]*))?$/.exec(text.trimStart());
  if (!match) return { text };

  const id = match[2]!.toLowerCase();
  if (!known.some((skill) => skill.id === id)) return { text };

  return { skillId: id, text: (match[3] ?? '').trim() };
}

/**
 * The skills that match what's been typed so far, for the autocomplete.
 *
 * It returns `null` —and not an empty list— when the text doesn't even start
 * with a prefix: the dropdown has to distinguish "you're not invoking anything"
 * from "you're invoking something that doesn't exist", because the second does
 * deserve to be shown on screen.
 */
export function matchSkills(text: string, all: readonly Skill[]): Skill[] | null {
  const match = /^([/$])([A-Za-z0-9._-]*)$/.exec(text.trimStart());
  if (!match) return null;

  const typed = (match[2] ?? '').toLowerCase();
  return all
    .filter((skill) => !skill.error)
    .filter((skill) => skill.id.includes(typed) || skill.name.toLowerCase().includes(typed));
}
