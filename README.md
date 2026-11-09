# OASIS FITNESS GYM — Calauan, Laguna
### NuxtJS 3 SPA · Tailwind CSS · GSAP · Vercel-Ready

---

## 🚀 Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Run dev server (http://localhost:3000)
npm run dev

# 3. Build for production (includes server API routes)
npm run build

# 4. Preview production build
npm run preview
```

---

## 📁 Project Structure

```
oasisfitnessgym/
├── assets/
│   └── css/
│       └── main.css           # Global styles + Tailwind layers
├── server/
│   ├── api/
│   │   ├── admin/             # Staff login/session
│   │   └── walkin/            # Register, lookup, check-in
│   └── utils/                 # Supabase, auth, pass codes
├── pages/
│   ├── index.vue              # Full SPA — all sections
│   └── staff/index.vue        # Staff dashboard (reports, check-in)
├── supabase/
│   └── schema.sql             # Database setup script
├── composables/
│   └── useToast.ts             # iOS-style toast notifications
├── public/
│   ├── favicon.svg
│   ├── robots.txt
│   └── gallery/               # ← Add real gym photos here
├── app.vue                    # Root layout
├── nuxt.config.ts             # Nuxt config (SSR disabled for SPA)
├── tailwind.config.ts         # Design tokens (colors, fonts, animations)
├── vercel.json                # Vercel deployment config
└── package.json
```

---

## 🎨 Design System

### Colors
| Token | Hex | Use |
|-------|-----|-----|
| `onyx` | `#0a0a0a` | Page background |
| `obsidian` | `#141414` | Card surfaces |
| `graphite` | `#1e1e1e` | Input fields |
| `gold` | `#C9A84C` | Brand accent, CTAs |
| `gold-light` | `#E2C97E` | Hover states |
| `cream` | `#F5F0E8` | Primary text |
| `mist` | `#A89F8C` | Secondary text |
| `iron` | `#2E2E2E` | Borders, dividers |

### Fonts
- **Display:** Bebas Neue — headlines, stats, labels
- **Body:** Outfit — body copy, UI, forms

---

## 🔧 What to Customize Before Launch

### 1. Real Gym Photos
Drop photos into `/public/gallery/` and replace the SVG placeholders in the Gallery section:
```vue
<!-- Replace each gallery item's inner <div> with: -->
<img src="/gallery/your-photo.jpg" alt="Description" class="w-full h-full object-cover" />
```

### 2. Contact Details
Search for `XXX` in `pages/index.vue` and replace:
- Phone number
- Email address
- Physical address
- GCash number
- Bank account number

### 3. Google Maps Embed
Replace the `src` in the `<iframe>` in the Location section with your exact gym coordinates:
```
https://www.google.com/maps/embed?pb=!1m18!...YOUR_REAL_EMBED_URL
```
Get it from: Google Maps → Share → Embed a map → Copy HTML → grab the `src`.

### 4. Social Links
Update the `socials` array with real profile URLs.

### 5. Walk-in / Day Pass Check-in (Supabase)

Walk-in registration uses a real backend with pass codes and a staff dashboard.

**Setup:**
1. Create a free project at [supabase.com](https://supabase.com)
2. Open **SQL Editor** and run the script in [`supabase/schema.sql`](supabase/schema.sql)
3. Copy `.env.example` to `.env` and fill in:
   - `SUPABASE_URL` — Project Settings → API → Project URL
   - `SUPABASE_SERVICE_ROLE_KEY` — Project Settings → API → service_role key (keep secret)
   - `ADMIN_PASSWORD` — password for staff login at `/staff`
   - `SESSION_SECRET` — random string (e.g. `openssl rand -base64 32`)
4. Add the same env vars in Vercel Dashboard → Settings → Environment Variables

**How it works:**
- Client registers → receives a unique pass code (e.g. `OASIS-7K3M2P`)
- Staff opens `/staff`, logs in, looks up by code/phone/name
- Staff taps **Check In** → pass is marked used (cannot be reused same day)

### 6. Membership Payment Form
The payment form still simulates submission. Connect to Formspree, EmailJS, or a custom API route when ready.

### 7. Membership Prices
Update the `membershipPlans` array in `pages/index.vue` with real pricing.

---

## ☁️ Deploy to Vercel

### Method 1 — Vercel CLI
```bash
npm i -g vercel
vercel --prod
```

### Method 2 — GitHub Integration
1. Push to GitHub
2. Import repo at vercel.com/new
3. Framework: **Nuxt.js** (auto-detected)
4. Build command: `npm run build`
5. Framework: **Nuxt.js** (auto-detected — serverless API routes included)

### Environment Variables
Add in Vercel Dashboard → Project → Settings → Environment Variables:
```
SUPABASE_URL=your_project_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
ADMIN_PASSWORD=your_staff_password
SESSION_SECRET=your_random_secret
```

---

## ⚡ Performance Notes

- SPA mode (`ssr: false`) — client-rendered pages with serverless API routes on Vercel
- Fonts preloaded via `<link rel="preconnect">`
- GSAP loaded dynamically (code-split, client-only)
- Tailwind purges unused CSS at build time
- Images should be WebP, ≤ 200KB each for best LCP

---

## 📋 Sections Checklist

- [x] Navigation (sticky, mobile-responsive)
- [x] Hero with GSAP entrance + parallax
- [x] Ticker / marquee strip
- [x] About with feature list
- [x] Gallery grid (6 zones)
- [x] Membership Plans (4 tiers)
- [x] Manual Payment Form (with file upload + validation)
- [x] Walk-in / Day Pass Form (with waiver + pass code check-in)
- [x] Operating Hours
- [x] Google Maps embed (dark-tinted)
- [x] CTA banner
- [x] Footer (full links + contact)
- [x] Scroll-to-top button
- [x] Mobile responsive (all breakpoints)
- [x] Reduced-motion respected
- [x] Keyboard focus styles
- [x] SEO meta tags

---

*Built with ❤️ for OASIS FITNESS GYM, Calauan, Laguna.*
