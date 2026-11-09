import { readFileSync } from 'node:fs'

const env = {}
for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
}

const url = env.SUPABASE_URL || env.NUXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || env.NUXT_SUPABASE_SERVICE_ROLE_KEY

console.log('url present:', Boolean(url), '| service key present:', Boolean(key))
if (!url || !key) {
  const names = Object.keys(env).filter((k) => /SUPABASE/i.test(k))
  console.log('supabase-ish env names:', names.join(', '))
  process.exit(1)
}

async function probe(column) {
  const res = await fetch(`${url}/rest/v1/walkin_passes?select=id,${column}&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  const body = await res.text()
  console.log(`select ${column} ->`, res.status, body.slice(0, 200))
}

await probe('member_status')
await probe('removed')
await probe('points')
