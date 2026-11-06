# FlipForge Studio

Create **interactive, trackable digital publications**: ebooks, magazines, product catalogs, brochures, reports, proposals, menus, courses, newsletters, portfolios, cookbooks and photo books. You can start from a PDF, a template, a spreadsheet or plain text, or have AI write the whole thing.

It runs entirely in the browser. While you edit, nothing is uploaded. When you publish, you get one self-contained HTML file that you can host anywhere.

```
index.html     – marketing site with a live interactive demo
studio.html    – the authoring studio (library, create, editor, analytics, leads, settings)
viewer.html    – full-screen reader for publications stored in this browser
```

## Quick start

It's a static site with no build step needed to run it. Serve the folder with any static server:

```bash
npx http-server -p 8080 -c-1 .
```

Then open http://localhost:8080. Opening the files directly with `file://` doesn't work for the studio, because ES modules and the PDF worker need http. Exported publications **do** work from `file://`.

## Feature overview

### Creating
| Source | What happens |
|---|---|
| **PDF (single or batch)** | Pages rendered at Standard, High or Ultra quality. Text is extracted for search and read-aloud. **Links, internal page jumps and the outline become hotspots and a table of contents automatically.** |
| **AI writer** | **Free mode:** FlipForge builds a prompt, you paste it into the free Claude.ai chat (or any AI chat) and paste the answer back — no API key. **Automatic mode:** with your own Anthropic API key. Describe a topic, audience, tone and length; optionally paste source notes. Claude writes a complete publication with chapters, quizzes, charts, stats and CTAs, and FlipForge lays it out. There's also an in-editor AI assistant ("add a chapter on…", "translate to Spanish"). |
| **Templates** | 12 designed starters × 9 typographic themes (Aurora, Classic, Editorial, Minimal, Noir, Corporate, Fresh, Playful, Luxe) × 6 page sizes. |
| **Write / Markdown / TXT / HTML** | Text is typeset automatically: pagination, chapter openers, drop caps, folios, table of contents, cover and back cover. |
| **CSV spreadsheet** | Builds a shoppable product catalog (sections from the `category` column). |
| **Images** | Photo book, portfolio or scanned pages. |
| **Project backup** | Re-import `.flipforge.json` files. |

### Interactivity (drawn as hotspots on any page, PDF or composed)
Web links, go-to-page, video (YouTube, Vimeo or uploaded, as a pop-up or playing inside the page), audio, pop-up image, slideshow gallery, note or tooltip, quiz, embed (maps, forms, Calendly, Typeform…) and product with add-to-cart.
**Overlays:** text, shapes (e.g. to cover an old price on a PDF) and images or GIFs.
**Animations:** fade, slide, zoom, bounce, spin, float, plus pulsing hotspots.
Hotspots can be copied to every page, duplicated, nudged with the arrow keys, and undone or redone.

Composed pages also support inline blocks: `@video`, `@audio`, `@gallery`, `@quiz`, `@chart`, `@stats`, `@product`, `@menu` and `@button`. The full reference is in the editor's Content tab.

### Reader experience
- 3D page-flip that you can drag by the corner, with dynamic shading and a hover corner peel
- Hardcover look, single or double spread (or automatic), slide and fade effects, right-to-left layout
- Thumbnails, table of contents, full-text search with highlights on the page, deep links (`#page=5`)
- Zoom and pan, full screen, slideshow, read-aloud (speech synthesis), night reading
- Private bookmarks and notes, synthesized page-flip sound, background music
- Cart with checkout by email or WhatsApp
- Share sheet (WhatsApp, Facebook, X, LinkedIn, Pinterest, email), embed code, QR code
- Download the original PDF and print (each can be turned on or off)
- Dark, light and glass skins; your logo, accent colour, background, and a call-to-action button
- Keyboard and screen-reader friendly; mobile layout with swipe

### Access and leads
- **Lead capture form** before any page you choose: configurable fields, consent checkbox, optionally skippable.
- **Password protection.** Only a SHA-256 hash is stored. See the limitations below.
- **Webhook:** leads, orders and session summaries are POSTed as JSON, which works with Zapier, Make, n8n, HubSpot, Google Sheets and similar tools.
- **Google Analytics 4**, using your own measurement ID.

### Analytics
- Sessions, average reading time, pages per session, read-to-the-end rate, interactions, shares and orders
- Sessions over the last 14 days
- **Attention heatmap**: time spent on each page
- Most-clicked elements, a breakdown by element type, devices, traffic sources, reader searches and quiz accuracy
- CSV export of events and of leads

### Publishing
- **Export website:** one `.html` file containing the pages, media, reader and analytics, with an SEO text fallback. Upload it to any static host (your site, Netlify Drop, GitHub Pages, S3, WordPress media…) and embed it with `<iframe src="…/book.html?embed=1">`.
- **Bookshelf website:** bundle several publications into one searchable library page.
- **Backups:** one project, or everything at once.

## AI setup
Studio → Settings → paste an Anthropic API key. The key is stored only in this browser's IndexedDB, and requests go directly from the browser to the Claude API using the official `@anthropic-ai/sdk` (vendored in `vendor/anthropic-sdk.mjs`) with model `claude-opus-5-5`. The SDK requires `dangerouslyAllowBrowser: true` for this, which is fine because users bring their own key. **Don't embed a shared key in a public deployment.** For a hosted multi-user service, move these calls to a backend.

## Project structure
```
css/flipbook.css    page-flip engine styles
css/themes.css      typographic themes for composed pages
css/viewer.css      reader UI
css/app.css         studio + landing design system (dark/light)
js/flipbook.js      page-flip engine (3D leaf, drag-to-peel, slide/fade, zoom, RTL)
js/viewer.js        reader runtime (toolbar, drawers, modals, gates, analytics, cart, share…)
js/composer.js      markdown + @blocks → paginated designed pages
js/templates.js     starter templates and block reference
js/pdf-import.js    PDF.js conversion (pages, text, links, outline) and image import
js/editor.js        authoring UI
js/studio.js        app shell, library, create flows, leads, settings
js/analytics.js     dashboard
js/export.js        standalone HTML, bookshelf and project export/import
js/ai.js            Claude integration
js/db.js            IndexedDB storage and the data model
dist/               bundled reader runtime used by exports (rebuild with `npm run build`)
vendor/             pdf.js 4.10 (Apache-2.0), Anthropic SDK (Apache-2.0), qrcode-generator (MIT)
tests/e2e.cjs       end-to-end test (`npm test`, needs Playwright)
```

After editing anything under `js/viewer.js`, `js/flipbook.js`, `js/util.js` or the three viewer stylesheets, run `npm install && npm run build` so exports pick up the change.

## Known limitations (be aware before going to production)
- **Storage is per browser.** There are no accounts, cloud sync or hosted share links. Sharing publicly means exporting and hosting the HTML file. Adding a backend (auth, storage, server-side analytics) is the natural next step for a SaaS version.
- **Analytics for exported sites** are kept in each reader's own browser unless you configure a webhook or GA4. The studio dashboard shows readers who opened the book in this browser's `viewer.html`.
- **Password protection in exports is client-side.** The pages are inside the file, so it deters casual readers only.
- **Office files** (DOCX and PPTX) aren't converted directly. Save them as PDF first.
- **Large PDFs** are stored as images in IndexedDB. Very large books (hundreds of pages at Ultra quality) can use hundreds of MB.
