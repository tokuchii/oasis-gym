export default defineNuxtConfig({
  ssr: false,
  devtools: { enabled: process.env.NODE_ENV !== 'production' },
  experimental: {
    viteEnvironmentApi: true,
  },

  devServer: {
    port: 3000,
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
        { rel: 'manifest', href: '/manifest.json' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Outfit:wght@300;400;500;600;700&display=swap',
        },
      ],
      script: [
        { children: "if ('serviceWorker' in navigator) { navigator.serviceWorker.register('/sw.js') }" },
      ],
    },
  },

  css: ['~/assets/css/main.css'],

  modules: ['@nuxtjs/tailwindcss'],

  vite: {
    build: {
      target: 'es2020',
    },
  },

  nitro: {
    preset: 'static',
    routeRules: {
      '/**': {
        headers: {
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          'Referrer-Policy': 'strict-origin-when-cross-origin',
          'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
          'X-XSS-Protection': '0',
        },
      },
      '/api/**': {
        headers: {
          'Access-Control-Allow-Origin': 'https://localhost',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Max-Age': '86400',
        },
      },
    },
  },

  runtimeConfig: {
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    adminPassword: process.env.ADMIN_PASSWORD,
    sessionSecret: process.env.SESSION_SECRET,
    emailHost: process.env.EMAIL_HOST,
    emailPort: process.env.EMAIL_PORT,
    emailSecure: process.env.EMAIL_SECURE,
    emailUser: process.env.EMAIL_USER,
    emailPassword: process.env.EMAIL_PASSWORD,
    emailFrom: process.env.EMAIL_FROM,
    contactEmailTo: process.env.CONTACT_EMAIL_TO,
  },

  compatibilityDate: '2024-11-01',
})
