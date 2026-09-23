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

    // BCV website shows the USD rate inside a div#dolar block
    // Try multiple patterns to be resilient to HTML changes
    const patterns = [
      // Pattern 1: strong tag inside #dolar div
      /<div[^>]+id="dolar"[^>]*>[\s\S]*?<strong>\s*([\d,.]+)\s*<\/strong>/i,
      // Pattern 2: div with class centered inside #dolar
      /<div[^>]+id="dolar"[^>]*>[\s\S]{0,500}?(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,6}))/i,
      // Pattern 3: generic "Tipo de Cambio" + number near "USD" or "Dólar"
      /USD[\s\S]{0,200}?(\d{2,3}[.,]\d{2,6})/i,
      /Dólar[\s\S]{0,300}?(\d{2,3}[.,]\d{2,6})/i,
    ]

    for (const pattern of patterns) {
      const match = html.match(pattern)
      if (match) {
        const raw = match[1].replace(/\./g, '').replace(',', '.')
        const rate = parseFloat(raw)
        if (rate > 1 && rate < 1_000_000) {
          return NextResponse.json({ rate, source: 'bcv.org.ve', fetched_at: new Date().toISOString() })
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
