import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const res = await fetch('https://www.bcv.org.ve/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'es-VE,es;q=0.9',
        'Cache-Control': 'no-cache',
      },
      next: { revalidate: 0 },
    })

    if (!res.ok) {
      return NextResponse.json({ error: `BCV respondió con código ${res.status}` }, { status: 502 })
    }

    const html = await res.text()

    // BCV renders the USD rate like:
    // <div id="dolar" ...>...<strong class="strong-tb">853,49930000</strong>...
    // Try most specific pattern first, then fallbacks
    const patterns = [
      // Exact match: strong-tb inside #dolar block
      /<div[^>]+id="dolar"[\s\S]*?<strong[^>]*class="strong-tb"[^>]*>([\d.,]+)<\/strong>/i,
      // Fallback: any strong-tb on the page
      /<strong[^>]*class="strong-tb"[^>]*>([\d.,]+)<\/strong>/i,
      // Fallback: strong tag directly inside #dolar
      /<div[^>]+id="dolar"[\s\S]{0,600}?<strong[^>]*>([\d.,]+)<\/strong>/i,
    ]

    for (const pattern of patterns) {
      const match = html.match(pattern)
      if (match) {
        // BCV uses comma as decimal separator: "853,49930000" → 853.4993
        const raw = match[1].trim().replace(/\./g, '').replace(',', '.')
        const rate = parseFloat(raw)
        if (rate > 1 && rate < 10_000_000) {
          return NextResponse.json({ rate: parseFloat(rate.toFixed(4)), source: 'bcv.org.ve', fetched_at: new Date().toISOString() })
        }
      }
    }

    return NextResponse.json(
      { error: 'No se pudo extraer la tasa del sitio BCV. Ingresa la tasa manualmente.' },
      { status: 422 }
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    return NextResponse.json({ error: `Error al consultar BCV: ${message}` }, { status: 500 })
  }
}
