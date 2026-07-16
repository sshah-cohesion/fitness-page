# Fitness & Wellness — Custom Link

A standalone, static "Discover"-style page for buying nearby gym / studio memberships.
Designed to match the Cohesion **Perks & Hospitality → Discover** UI and to be embedded
as a **Custom Link** inside the Cohesion app (mobile webview friendly).

## What's here

| File | Purpose |
|------|---------|
| `index.html` | Page markup (featured card, filters, gym grid, membership modal) |
| `styles.css` | Styling — responsive, dark-mode aware, safe-area insets for webview |
| `data.js` | The gym / studio listings + membership tiers (edit this to change content) |
| `app.js` | Rendering, filtering, search, and the buy-membership flow |
| `vercel.json` | Caching + `frame-ancestors *` so it can be embedded in the app iframe |

No build step. It's plain HTML/CSS/JS.

## Run locally

```bash
npx serve .        # or: python3 -m http.server 3000
```

## Deploy to Vercel

```bash
npx vercel          # first deploy (preview)
npx vercel --prod   # production URL
```

Then in the Cohesion admin, add a **Custom Link** pointing at the production URL so it
opens inside the app.

## Editing content

All studios live in `data.js`. Each entry supports `badges` (New offer / Popular /
Limited spots), `tags` (used by the filter chips), a `priceFrom`, and a list of
membership `tiers`. Images pull from the Unsplash CDN and fall back to a brand gradient
if a photo fails to load, so tiles never render broken.
