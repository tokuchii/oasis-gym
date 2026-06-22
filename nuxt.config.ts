export default defineNuxtConfig({
  ssr: false,
  devtools: { enabled: process.env.NODE_ENV !== 'production' },

  // Workaround: Nuxt 3.21.8 dev server fails to resolve SSR entry in SPA mode
  // Fixed in 3.21.9 — remove once upgraded
  experimental: {
    viteEnvironmentApi: true,
  },

  app: {
    head: {
      title: 'OASIS FITNESS GYM — Calauan, Laguna',
      htmlAttrs: { lang: 'en' },
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        {
          name: 'description',
          content:
            'OASIS FITNESS GYM in Calauan, Laguna — premium equipment, expert coaching, and flexible membership plans. Join the oasis today.',
        },
        { name: 'theme-color', content: '#0a0a0a' },
        { property: 'og:title', content: 'OASIS FITNESS GYM — Calauan, Laguna' },
        {
          property: 'og:description',
          content: 'Premium gym in Calauan, Laguna. Strength, cardio, group classes, and day passes available.',
        },
        { property: 'og:type', content: 'website' },
        { name: 'twitter:card', content: 'summary_large_image' },
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Outfit:wght@300;400;500;600;700&display=swap',
        },
      ],
    },
  },

  css: ['~/assets/css/main.css'],

  modules: ['@nuxtjs/tailwindcss'],

  runtimeConfig: {
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    adminPassword: process.env.ADMIN_PASSWORD,
    sessionSecret: process.env.SESSION_SECRET,
    gmailUser: process.env.GMAIL_USER,
    gmailAppPassword: process.env.GMAIL_APP_PASSWORD,
  },

  compatibilityDate: '2024-11-01',
})
