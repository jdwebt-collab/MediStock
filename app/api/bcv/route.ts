import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

// Sources tried in order — all return the official BCV USD rate
const SOURCES = [
  // 1. DolarAPI.com — JSON API specifically for Venezuelan exchange rates
  async () => {
    const res = await fetch('https://ve.dolarapi.com/v1/dolares/oficial', {
      headers: { 'Accept': 'application/json' },
      next: { revalidate: 0 },
    })
    if (!res.ok) throw new Error(`dolarapi status ${res.status}`)
    const data = await res.json()
    // Response: { "promedio": 853.4993, "fuente": "BCV", ... }
    const rate = parseFloat(data.promedio ?? data.promedio_real)
    if (!rate || rate <= 1) throw new Error('rate out of range')
    return { rate: parseFloat(rate.toFixed(4)), source: 'dolarapi.com (BCV oficial)' }
  },
  // 2. ExchangeRate.host — free public API
  async () => {
    const res = await fetch('https://api.exchangerate.host/latest?base=USD&symbols=VES', {
      next: { revalidate: 0 },
    })
    if (!res.ok) throw new Error(`exchangerate.host status ${res.status}`)
    const data = await res.json()
    const rate = data?.rates?.VES
    if (!rate || rate <= 1) throw new Error('rate out of range')
    return { rate: parseFloat(Number(rate).toFixed(4)), source: 'exchangerate.host' }
  },
  // 3. Direct BCV scrape as last resort
  async () => {
    const res = await fetch('https://www.bcv.org.ve/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Cache-Control': 'no-cache',
      },
      next: { revalidate: 0 },
    })
    if (!res.ok) throw new Error(`bcv.org.ve status ${res.status}`)
    const html = await res.text()
    // <strong class="strong-tb">853,49930000</strong>
    const match = html.match(/<strong[^>]*class="strong-tb"[^>]*>([\d.,]+)<\/strong>/i)
      ?? html.match(/<div[^>]+id="dolar"[\s\S]{0,600}?<strong[^>]*>([\d.,]+)<\/strong>/i)
    if (!match) throw new Error('pattern not found in BCV HTML')
    const raw = match[1].trim().replace(/\./g, '').replace(',', '.')
    const rate = parseFloat(raw)
    if (rate <= 1 || rate > 10_000_000) throw new Error('rate out of range')
    return { rate: parseFloat(rate.toFixed(4)), source: 'bcv.org.ve (scrape)' }
  },
]

export async function GET() {
  const errors: string[] = []

  for (const source of SOURCES) {
    try {
      const result = await source()
      return NextResponse.json({ rate: result.rate, source: result.source, fetched_at: new Date().toISOString() })
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err))
    }
  }

  return NextResponse.json(
    { error: `No se pudo obtener la tasa automáticamente. Ingrésala manualmente. Detalles: ${errors.join(' | ')}` },
    { status: 422 }
  )
}
