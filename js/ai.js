// AI writer: generates a complete, interactive publication (in FlipForge markdown) with Claude.
// The API key is supplied by the user and kept only in this browser (IndexedDB).
import Anthropic from '../vendor/anthropic-sdk.mjs';
import { db } from './db.js';
import { BLOCK_HELP } from './templates.js';

export const MODEL = 'claude-opus-5-5';

export async function getKey() { return (await db.getKV('anthropic_key')) || ''; }
export async function setKey(k) { await db.setKV('anthropic_key', (k || '').trim()); }

function client(apiKey) {
  // dangerouslyAllowBrowser: the key belongs to the user and is sent straight from their browser to the API.
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
}

const SYSTEM = `You write complete, publication-ready digital flipbooks in "FlipForge markdown".
Output ONLY the document — no preamble, no code fences, no commentary.

Syntax:
${BLOCK_HELP.map(([s, d]) => `- ${s}: ${d}`).join('\n')}

Rules:
- Start with front matter lines: title:, subtitle:, author:, kicker:, and optionally cta: Label | https://example.com
- Use one "# " heading per chapter or section. Keep paragraphs short (2-4 sentences) so pages paginate well.
- Mix in interactive blocks where they genuinely help the reader: @quiz for learning material, @chart and @stats for data, @gallery and images for visual content, @product for catalogs, @menu for menus, @button for calls to action.
- For images use art:<descriptive-word> placeholders (e.g. art:mountain-lake) unless the user supplied real image URLs.
- Only use @video with URLs the user gave you; never invent video links.
- Only include facts you are confident about; for numbers in business documents use clearly illustrative figures.
- Write in the language the user asks for.`;

/**
 * Stream a publication. onText receives the growing markdown.
 * @returns {Promise<string>} final markdown
 */
/** The user prompt for a new publication (shared by API mode and free copy/paste mode). */
const SPECIAL = {
  'digital visiting card': `This is a DIGITAL VISITING CARD, not a book. Use front matter title: (the person's or business name), subtitle: (role · company), kicker: (a short greeting such as "Hello, I'm"), author: (website or tagline), and the lines toc: none, back: none, folio: none.
Then exactly two short pages separated by a line containing only ---:
Page 1: "## " + a short heading (e.g. Let's connect), one sentence about what they do, then one @contact line: Name | Title | phone | email | website | address (use the details given; leave a part empty if unknown — never invent phone numbers or emails).
Page 2: an @social line with only the profile links given, then "@qr <website> | Scan to visit" if a website is given, and an optional @button for booking or WhatsApp.
Keep all text very short: it is a small card.`,
  'wedding invitation': `This is a WEDDING INVITATION, not a book. Front matter: title: (the couple, e.g. Aarav & Diya), subtitle: (a warm invitation line), author: (date · city), kicker: Wedding invitation, toc: none, folio: none, backtitle:, backtext: (a short blessing).
Pages separated by ---: (1) @names Name | Name | date line, then "@countdown YYYY-MM-DD HH:MM | label", then an @center sentence naming the venue. (2) "## Celebrations" with one @menu line per function: Function | date · time | place or dress code, then "@calendar Title | YYYY-MM-DD HH:MM | YYYY-MM-DD HH:MM | Venue". (3) "## Venue" with "@map <full address> | <venue name>", then "## Kindly reply" with "@rsvp <question> | whatsapp:<number>" (or email:) using the contact given.
Use only the names, dates, venues and contacts given; never invent them — use clear placeholders like [Venue address] if missing.`,
  'birthday invitation': `This is a BIRTHDAY INVITATION. Front matter: title:, subtitle:, author: (date · time), kicker: You're invited, toc: none, folio: none, backtitle:, backtext:. Pages separated by ---: (1) @countdown, a short "## Party plan" list, @calendar. (2) @map with the address and @rsvp with the contact given. Keep text short and fun; never invent addresses or numbers.`,
  'event invitation': `This is an EVENT / LAUNCH INVITATION. Front matter: title:, subtitle:, author: (date · time · city), kicker: Exclusive invitation, toc: none, folio: none, backtitle:, backtext:, optional cta: Label | URL. Pages separated by ---: (1) @countdown and "## Agenda" with @menu lines (item | time), then @calendar. (2) @map with the venue and @rsvp with the contact given. Never invent addresses or contacts.`,
};
export const SPECIAL_TYPES = Object.keys(SPECIAL);

export function buildUserPrompt({ topic, type, audience, tone, length, language, extras, sourceText }) {
  if (SPECIAL[type]) return [
    `Create a ${type}. Details: ${topic}`,
    SPECIAL[type],
    tone && `Tone: ${tone}`,
    language && `Language: ${language}`,
    extras && `Extra requirements: ${extras}`,
    sourceText && `More details:\n<source>\n${sourceText.slice(0, 20000)}\n</source>`,
  ].filter(Boolean).join('\n');
  return [
    `Create a ${type} about: ${topic}`,
    audience && `Audience: ${audience}`,
    tone && `Tone: ${tone}`,
    `Length: about ${length} chapters/sections.`,
    language && `Language: ${language}`,
    extras && `Extra requirements: ${extras}`,
    sourceText && `Base the content on this source material:\n<source>\n${sourceText.slice(0, 120000)}\n</source>`,
  ].filter(Boolean).join('\n');
}

/** One self-contained prompt to paste into any free AI chat (no API key needed). */
export function freePrompt(opts) {
  return SYSTEM + '\n\n---\n\n' + buildUserPrompt(opts) + '\n\nReply with the document only, as plain text (no code block).';
}
export function freeRevisePrompt(markdown, instruction) {
  return SYSTEM + '\n\nYou will receive an existing document and an instruction. Return the full revised document only, as plain text (no code block).\n\nInstruction: ' + instruction + '\n\n<document>\n' + markdown + '\n</document>';
}
/** Clean what people paste back from a chat window. */
export function cleanPasted(text) {
  let t = String(text || '').trim().replace(/^```[\w-]*\n?/, '').replace(/\n?```\s*$/, '').trim();
  const i = t.search(/^title\s*:/mi);   // drop any chatty preamble before the front matter
  if (i > 0) t = t.slice(i);
  return t;
}

export async function generatePublication({ apiKey, topic, type, audience, tone, length, language, extras, sourceText }, { onText, signal } = {}) {
  const prompt = buildUserPrompt({ topic, type, audience, tone, length, language, extras, sourceText });

  const stream = client(apiKey).beta.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    system: SYSTEM,
    output_config: { effort: 'medium' },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    messages: [{ role: 'user', content: prompt }],
  }, { signal });

  let text = '';
  stream.on('text', (delta) => { text += delta; onText && onText(text); });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === 'refusal') throw new Error('The request was declined. Try rephrasing the topic.');
  const out = msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
  return out.replace(/^```\w*\n?|```\s*$/g, '').trim();
}

/** Rewrite / extend an existing document according to an instruction. */
export async function reviseDocument({ apiKey, markdown, instruction }, { onText, signal } = {}) {
  const stream = client(apiKey).beta.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    system: SYSTEM + '\nYou will receive an existing document and an instruction. Return the full revised document.',
    output_config: { effort: 'medium' },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    messages: [{ role: 'user', content: `Instruction: ${instruction}\n\n<document>\n${markdown}\n</document>` }],
  }, { signal });
  let text = '';
  stream.on('text', (d) => { text += d; onText && onText(text); });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === 'refusal') throw new Error('The request was declined.');
  return msg.content.filter(b => b.type === 'text').map(b => b.text).join('').replace(/^```\w*\n?|```\s*$/g, '').trim();
}

export function friendlyError(e) {
  if (e instanceof Anthropic.AuthenticationError) return 'Your API key was rejected. Check it in Settings.';
  if (e instanceof Anthropic.RateLimitError) return 'Rate limit reached — wait a moment and try again.';
  if (e instanceof Anthropic.APIConnectionError) return 'Could not reach the Claude API. Check your connection.';
  if (e instanceof Anthropic.APIError) return `Claude API error (${e.status}): ${e.message}`;
  if (e?.name === 'AbortError') return 'Generation cancelled.';
  return e?.message || String(e);
}
