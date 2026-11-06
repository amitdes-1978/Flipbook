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
export async function generatePublication({ apiKey, topic, type, audience, tone, length, language, extras, sourceText }, { onText, signal } = {}) {
  const prompt = [
    `Create a ${type} about: ${topic}`,
    audience && `Audience: ${audience}`,
    tone && `Tone: ${tone}`,
    `Length: about ${length} chapters/sections.`,
    language && `Language: ${language}`,
    extras && `Extra requirements: ${extras}`,
    sourceText && `Base the content on this source material:\n<source>\n${sourceText.slice(0, 120000)}\n</source>`,
  ].filter(Boolean).join('\n');

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
