// Starter templates for every product type. Content uses the composer's markdown + @blocks.
export const TEMPLATES = [
  {
    id: 'ebook', type: 'ebook', name: 'Ebook', icon: '📘', theme: 'classic', size: 'pocket',
    blurb: 'Chapters, drop caps, auto table of contents',
    md: `title: The Art of Calm Productivity
subtitle: A practical guide to doing deep work without burning out
author: Your Name
kicker: A FlipForge ebook
cta: Get the companion workbook | https://example.com

# Why Busy Isn't Better
Most of us measure our days by how full they were. Calendars packed edge to edge feel like proof of importance, yet the work that truly moves us forward rarely happens in the cracks between meetings. This chapter explores why constant motion is so seductive and what it quietly costs.

Attention is a finite resource. Every context switch carries a tax: a few minutes to reload the problem, a little less depth each time. Over a week, those minutes become hours.

> Being busy is a form of laziness — lazy thinking and indiscriminate action.

## The three hidden costs
- **Shallow output.** Work done in fragments rarely reaches its potential.
- **Decision fatigue.** Small choices drain the energy needed for big ones.
- **Lost momentum.** Ideas need uninterrupted time to compound.

# Designing Your Ideal Week
Start with constraints, not wishes. Block two mornings for focused work and protect them as you would a client meeting. Batch shallow tasks into a single afternoon.

::: tip
Try the "maker morning" for two weeks before judging it. The first few days always feel strange.
:::

@quiz Which block of time is best protected for deep work? | Whenever there is a gap | *A fixed, recurring morning slot | Late at night after email

# Rituals That Stick
Habits survive when they are small, obvious and rewarding. Attach a new ritual to something you already do: after your first coffee, open the single most important document of the day.

@video https://www.youtube.com/watch?v=arj7oStGLkU | Watch: the power of small routines

## A simple shutdown routine
1. Review what you finished today.
2. Write down tomorrow's first task.
3. Close every tab and say "done for today."
`,
  },
  {
    id: 'magazine', type: 'magazine', name: 'Magazine', icon: '📰', theme: 'editorial', size: 'letter',
    blurb: 'Bold covers, features, galleries, video',
    md: `title: FUTURE CITIES
subtitle: Inside the green skyscrapers, quiet streets and smart grids reshaping urban life
author: Issue 07 · Spring
kicker: The Urban Review
cover: art:city-skyline

# Cover Story: The Vertical Forest
Architects are planting entire ecosystems on balconies. Each tower now hosts thousands of shrubs and hundreds of trees, cooling the streets below and filtering air for the neighbourhood.

![Sky gardens at dusk](art:forest)

## By the numbers
@stats 900:trees per tower | 30%:cooler facades | 2x:bird species

Residents report something less measurable but just as real: a sense of living inside a park rather than beside one.

# Gallery: Streets Without Cars
@gallery art:street1, art:street2, art:street3, art:street4

Car-free zones began as weekend experiments. Today they are permanent, and shop owners — once the loudest critics — are their biggest fans.

> "Footfall went up forty percent the first summer. Nobody wants to go back."

# Watch: The Smart Grid
@video https://www.youtube.com/watch?v=MbYj4XTGzbI | How neighbourhood batteries keep the lights on

## What's next
Expect micro-grids, shared mobility hubs and buildings that trade energy with each other in real time.

@button Subscribe for the next issue | https://example.com/subscribe
`,
  },
  {
    id: 'catalog', type: 'catalog', name: 'Product catalog', icon: '🛍️', theme: 'luxe', size: 'a4',
    blurb: 'Product grid, prices, cart & order via email/WhatsApp',
    md: `title: Autumn Collection
subtitle: Handcrafted leather goods, made to last a lifetime
author: Atelier Studio · 2026
kicker: Catalog

# Bags
@product Weekender Duffel | $289 | art:duffel | Full-grain leather, brass hardware, fits a 3-day trip | https://example.com/duffel | BAG-01
@product City Tote | $179 | art:tote | Structured tote with laptop sleeve | https://example.com/tote | BAG-02
@product Crossbody Mini | $129 | art:mini | Adjustable strap, magnetic closure | https://example.com/mini | BAG-03
@product Field Backpack | $249 | art:backpack | Waxed canvas and leather trim | https://example.com/pack | BAG-04

# Small Goods
@product Bifold Wallet | $69 | art:wallet | Six card slots, hand-stitched edges | https://example.com/wallet | SG-01
@product Key Ring | $29 | art:key | Solid brass, ages beautifully | https://example.com/key | SG-02
@product Card Sleeve | $45 | art:card | Slim front-pocket carry | https://example.com/card | SG-03
@product Watch Strap | $59 | art:strap | Quick-release pins, 20mm | https://example.com/strap | SG-04

# Care & Warranty
Every piece carries a lifetime repair promise. Condition twice a year with natural balm and store away from direct sunlight.

@button Book a fitting | https://example.com/book
`,
  },
  {
    id: 'brochure', type: 'brochure', name: 'Brochure', icon: '🏡', theme: 'fresh', size: 'square',
    blurb: 'Property / services brochure with gallery & CTA',
    md: `title: Lakeside Villas
subtitle: Twelve light-filled homes on the water's edge
author: Green Key Realty
kicker: Now selling

# Live by the Water
Floor-to-ceiling glass, private docks and gardens that slope gently to the shore. Lakeside Villas are designed for slow mornings and long summer evenings.

@gallery art:villa1, art:villa2, art:villa3

# Floor Plans
@stats 3-4:bedrooms | 210m²:living space | A+:energy rating

- Open-plan kitchen with island
- Heated floors throughout
- Rooftop terrace with lake views

@video https://www.youtube.com/watch?v=ScMzIvxBSi4 | Take the virtual tour

# Book a Viewing
Our team hosts private viewings seven days a week.

@button Schedule a viewing | https://example.com/viewing
`,
  },
  {
    id: 'report', type: 'report', name: 'Annual report', icon: '📊', theme: 'corporate', size: 'a4',
    blurb: 'KPIs, charts, highlights',
    md: `title: Annual Report 2026
subtitle: Growth, resilience and the year ahead
author: Northwind Holdings
kicker: Investor relations

# Letter from the CEO
This year we crossed one million customers, opened three regional hubs and delivered our strongest margins to date. None of it would have been possible without our people.

> Our strategy is simple: listen closely, ship quickly, and keep our promises.

# Financial Highlights
@stats $412M:revenue | +28%:year over year | 19%:operating margin

@chart Revenue by quarter ($M) | Q1:88, Q2:96, Q3:107, Q4:121

@chart Customers by region (thousands) | North:410, South:265, East:190, West:150

# Sustainability
We cut operational emissions by 34% and moved 80% of our facilities to renewable power.

- 2 new solar sites commissioned
- 1,200 employees volunteered 9,000 hours
- Zero-waste certification at HQ

# Outlook
We expect continued double-digit growth, driven by our platform business and new markets in Asia.
`,
  },
  {
    id: 'proposal', type: 'proposal', name: 'Sales proposal', icon: '🤝', theme: 'aurora', size: 'landscape',
    blurb: 'Pitch deck style proposal with pricing & CTA',
    md: `title: Website Redesign Proposal
subtitle: Prepared for Acme Corp — a faster, conversion-focused web experience
author: Bright Pixel Agency
kicker: Proposal
cta: Accept proposal | mailto:hello@example.com

# The Challenge
Acme's current site loads slowly on mobile and converts at 1.1%, well below the industry average of 2.9%.

@stats 6.2s:mobile load | 1.1%:conversion | 58%:bounce rate

# Our Approach
1. Two-week discovery with stakeholder interviews
2. Design sprint with clickable prototypes
3. Build on a modern, headless stack
4. Launch, measure and iterate

# Investment
@chart Budget split ($k) | Discovery:12, Design:28, Build:46, Launch:9

::: guarantee
If conversion does not improve by 30% within 90 days, the next sprint is on us.
:::

@button Book a kickoff call | https://example.com/call
`,
  },
  {
    id: 'menu', type: 'menu', name: 'Restaurant menu', icon: '🍽️', theme: 'luxe', size: 'pocket',
    blurb: 'Dotted price lines, specials, reservations',
    md: `title: Maison Lumière
subtitle: Seasonal French cuisine
author: Dinner menu
kicker: Est. 1998
cta: Reserve a table | https://example.com/reserve

# Starters
@menu Burgundy Escargots | 16 | Garlic parsley butter, toasted brioche
@menu French Onion Soup | 13 | Gruyère crust, aged beef broth
@menu Beet Carpaccio | 14 | Goat cheese, walnuts, honey vinaigrette

# Mains
@menu Duck Confit | 32 | Crisp potatoes, cherry jus
@menu Coq au Vin | 29 | Red wine, mushrooms, lardons
@menu Sole Meunière | 38 | Brown butter, capers, lemon
@menu Wild Mushroom Risotto | 26 | Parmesan, truffle oil

# Desserts
@menu Crème Brûlée | 11 | Tahitian vanilla
@menu Tarte Tatin | 12 | Calvados cream
`,
  },
  {
    id: 'course', type: 'course', name: 'Course / workbook', icon: '🎓', theme: 'playful', size: 'a4',
    blurb: 'Lessons with quizzes, video & audio',
    md: `title: Space Explorers
subtitle: A fun journey through our solar system
author: Grade 5 Science
kicker: Interactive workbook

# Meet the Sun
The Sun is a star — a giant ball of hot gas. It is so big that about one million Earths could fit inside it!

@quiz What is the Sun? | A planet | *A star | A moon

# The Rocky Planets
Mercury, Venus, Earth and Mars are called rocky planets because they have solid surfaces you could stand on.

@chart Distance from the Sun (million km) | Mercury:58, Venus:108, Earth:150, Mars:228

@quiz Which planet is closest to the Sun? | Mars | Earth | *Mercury

# The Gas Giants
Jupiter and Saturn are mostly made of gas. Jupiter is so big that all the other planets could fit inside it.

@video https://www.youtube.com/watch?v=libKVRa01L8 | Tour the solar system

## Activity
- Draw your favourite planet
- Write three facts about it
- Share it with the class
`,
  },
  {
    id: 'newsletter', type: 'newsletter', name: 'Newsletter', icon: '✉️', theme: 'minimal', size: 'letter',
    blurb: 'Monthly company or community update',
    md: `title: The Monthly
subtitle: News, wins and what's coming up at Northwind
author: November 2026
kicker: Team newsletter

# Highlights
@stats 3:new hires | 12:releases shipped | 98%:uptime

## Product
We launched dark mode, offline sync and a brand new onboarding flow. Early numbers show 22% more users completing setup.

## People
Please welcome Ana, Kenji and Priya to the team!

# Upcoming Events
- **Nov 14** — Town hall & demo day
- **Nov 21** — Volunteering at the food bank
- **Dec 5** — End-of-year celebration

@button RSVP for demo day | https://example.com/rsvp
`,
  },
  {
    id: 'portfolio', type: 'portfolio', name: 'Portfolio', icon: '🎨', theme: 'noir', size: 'landscape',
    blurb: 'Showcase projects with full-bleed visuals',
    md: `title: Selected Work
subtitle: Brand identity, product design and motion — 2020 to 2026
author: Studio Nova
kicker: Portfolio

# Lumen Banking
A complete rebrand for a digital-first bank: identity, app design and a motion system.

![Lumen app screens](art:lumen)

@stats +41%:app ratings | 3:design awards

# Orbit Headphones
Packaging, launch film and an interactive product configurator.

@gallery art:orbit1, art:orbit2, art:orbit3

# Contact
Available for new projects from January.

@button Start a project | mailto:hello@example.com
`,
  },
  {
    id: 'cookbook', type: 'cookbook', name: 'Cookbook', icon: '🥗', theme: 'fresh', size: 'square',
    blurb: 'Recipes with steps, video & shopping lists',
    md: `title: Weeknight Green
subtitle: 30 plant-based dinners in 30 minutes
author: Chef Lina Park
kicker: Cookbook

# Lemon Herb Orzo
![Lemon herb orzo](art:orzo)

## Ingredients
- 250g orzo
- 1 lemon, zest and juice
- Handful of parsley and dill
- 2 cups baby spinach

## Method
1. Cook orzo until al dente.
2. Stir through lemon, herbs and spinach.
3. Season and finish with olive oil.

@video https://www.youtube.com/watch?v=1Jo1TwYlXZ8 | Watch the 2-minute method

# Smoky Chickpea Tacos
## Ingredients
- 1 can chickpeas
- 1 tsp smoked paprika
- 8 small tortillas
- Avocado, lime, red cabbage
`,
  },
  {
    id: 'vcard', type: 'card', name: 'Digital visiting card', icon: '💳', theme: 'aurora', size: 'card',
    blurb: 'Tap to call, WhatsApp, save contact, QR',
    md: `title: Priya Sharma
subtitle: Founder & Creative Director · Bright Pixel Studio
author: brightpixel.example
kicker: Hello, I'm
toc: none
back: none
folio: none

## Let's connect
@contact Priya Sharma | Founder, Bright Pixel Studio | +91 98765 43210 | priya@example.com | https://example.com | MG Road, Bengaluru

---

@social instagram:https://instagram.com/, linkedin:https://linkedin.com/, web:https://example.com

@qr https://example.com | Scan to visit my portfolio
`,
  },
  {
    id: 'wedding', type: 'invitation', name: 'Wedding invitation', icon: '💍', theme: 'royal', size: 'invite',
    blurb: 'Countdown, RSVP, venue map, add to calendar',
    md: `title: Aarav & Diya
subtitle: Together with their families, request the pleasure of your company
author: 12 December 2026 · Jaipur
kicker: Wedding invitation
toc: none
folio: none
backtitle: With love & blessings
backtext: Your presence is the greatest gift. We can't wait to celebrate with you.

@names Aarav | Diya | Saturday · 12 December 2026

@countdown 2026-12-12 18:00 | until we say “I do”

@center With the blessings of our elders, we invite you to celebrate our wedding at **The Leela Palace, Jaipur**.

---

## Celebrations
@menu Mehendi | 10 Dec · 4 PM | Garden Terrace — wear something green
@menu Sangeet | 11 Dec · 7 PM | Grand Ballroom — music, dance & dinner
@menu Wedding ceremony | 12 Dec · 6 PM | Palace Lawns
@menu Reception | 12 Dec · 9 PM | Durbar Hall

@calendar Wedding of Aarav & Diya | 2026-12-12 18:00 | 2026-12-12 23:30 | The Leela Palace, Jaipur

---

## Venue
@map The Leela Palace Jaipur | The Leela Palace, Jaipur

## Kindly reply
@rsvp Will you celebrate with us? | whatsapp:+919876543210
`,
  },
  {
    id: 'birthday', type: 'invitation', name: 'Birthday invitation', icon: '🎂', theme: 'festive', size: 'invite',
    blurb: 'Party details, countdown & RSVP',
    md: `title: Mia turns 7!
subtitle: Join us for cake, games and lots of fun
author: Sunday · 20 December 2026 · 4 PM
kicker: You're invited
toc: none
folio: none
backtitle: See you there! 🎈
backtext: Questions? Call Mom on +1 555 010 2020.

@countdown 2026-12-20 16:00 | until the party starts!

## Party plan
- 🎨 Face painting & crafts
- 🎪 Magic show at 5 PM
- 🍕 Pizza, cake & ice cream

@calendar Mia's 7th birthday party | 2026-12-20 16:00 | 2026-12-20 19:00 | 21 Maple Street

---

## Where
@map 21 Maple Street, Springfield | 21 Maple Street

@rsvp Can you come? | email:parents@example.com
`,
  },
  {
    id: 'event', type: 'invitation', name: 'Event / launch invitation', icon: '🎟️', theme: 'noir', size: 'invite',
    blurb: 'Corporate event, agenda, RSVP',
    md: `title: Launch Night 2026
subtitle: Be the first to experience what we've been building
author: 15 January 2027 · 7 PM · Mumbai
kicker: Exclusive invitation
toc: none
folio: none
backtitle: Limited seats
backtext: Please RSVP by 8 January.
cta: Visit our website | https://example.com

@countdown 2027-01-15 19:00 | until doors open

## Agenda
@menu Welcome drinks | 7:00 PM
@menu Keynote & live demo | 7:45 PM
@menu Dinner & networking | 8:30 PM

@calendar Launch Night 2026 | 2027-01-15 19:00 | 2027-01-15 22:30 | Jio World Centre, Mumbai

---

@map Jio World Centre, Mumbai | Jio World Centre, BKC

@rsvp Will you attend? | email:events@example.com
`,
  },
  {
    id: 'album', type: 'album', name: 'Wedding / photo album', icon: '📸', theme: 'romance', size: 'photo',
    blurb: 'Collage pages, tap to enlarge — or build from your photos',
    md: `title: Rohan & Meera
subtitle: Our wedding · 14 February 2026
author: Udaipur, India
kicker: Wedding album
cover: art:wedding-sunset
toc: none
backtitle: Forever begins now
backtext: Thank you for being part of our story.

@names Rohan | Meera | 14 · 02 · 2026

---

@photos art:haldi-1, art:haldi-2, art:haldi-3

---

@photos art:mehendi-1, art:mehendi-2, art:mehendi-3, art:mehendi-4

---

@photos art:ceremony-1

---

@photos art:pheras-1, art:pheras-2

---

@photos art:family-1, art:family-2, art:family-3, art:family-4, art:family-5
`,
  },
  {
    id: 'blank', type: 'ebook', name: 'Blank document', icon: '📄', theme: 'aurora', size: 'a4',
    blurb: 'Start from scratch',
    md: `title: My Publication
subtitle: A short description
author: Your name

# Chapter One
Start writing here. Use # for chapters, ## for headings, and @blocks for interactive elements.
`,
  },
];

export const BLOCK_HELP = [
  ['# Chapter', 'Starts a new chapter on a fresh page (adds it to the table of contents)'],
  ['## Heading / ### Sub', 'Section headings'],
  ['**bold** *italic* [link](https://…)', 'Inline formatting; [text](#page=5) jumps to a page'],
  ['- item / 1. item', 'Lists'],
  ['> quote', 'Pull quote'],
  ['![caption](https://…image)', 'Image (use art:any-word for generated artwork)'],
  ['::: … :::', 'Callout box'],
  ['---', 'Page break'],
  ['@video URL | caption', 'YouTube, Vimeo or MP4 video'],
  ['@audio URL', 'Audio player'],
  ['@gallery url1, url2, url3', 'Image slider'],
  ['@quiz Question | *Right | Wrong', 'Interactive quiz (* marks correct answer)'],
  ['@chart Title | A:10, B:20', 'Bar chart'],
  ['@stats 42%:Label | 3x:Label', 'Big-number KPI tiles'],
  ['@product Name | $Price | image | desc | url | sku', 'Product card with add-to-cart'],
  ['@menu Dish | Price | description', 'Menu line with dotted leader'],
  ['@button Label | URL', 'Call-to-action button'],
  ['@contact Name | Title | phone | email | website | address', 'Call, WhatsApp, email, map and Save-contact buttons'],
  ['@social instagram:URL, linkedin:URL', 'Social profile buttons'],
  ['@qr URL | caption', 'QR code'],
  ['@names Name | Name | date', 'Couple names in script lettering'],
  ['@countdown 2026-12-12 18:00 | label', 'Live countdown timer'],
  ['@calendar Title | start | end | place', 'Add-to-calendar button (.ics)'],
  ['@map Address | label', 'Embedded map + directions link'],
  ['@rsvp Question | whatsapp:+91… or email:…', 'RSVP form (saved to Leads, sent to WhatsApp/email)'],
  ['@photos url1, url2, …', 'Full-page photo collage (1–6), tap to enlarge'],
  ['@center text', 'Centered text'],
  ['Front matter (top lines)', 'title:, subtitle:, author:, kicker:, cover:, theme:, cta: Label | URL, toc: none, back: none, folio: none, backtitle:, backtext:'],
];
