import { NextRequest, NextResponse } from 'next/server'

/* ═══════════════════════════════════════════════════════════════
   ATLAS Candles API — Fetches OHLCV from OKX for chart rendering
   GET /api/candles?symbol=BTC-USDT&bar=1H&limit=300
   ═══════════════════════════════════════════════════════════════ */

export const revalidate = 10

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const symbol = searchParams.get('symbol') || 'BTC-USDT'
  const bar = searchParams.get('bar') || '1H'
  const limit = searchParams.get('limit') || '300'

  try {
    const url = `https://www.okx.com/api/v5/market/candles?instId=${symbol}&bar=${bar}&limit=${limit}`
    const res = await fetch(url, {
      next: { revalidate: 10 },
      headers: { 'User-Agent': 'ATLAS/1.0' },
    })
    const data = await res.json()

    if (data.code !== '0' || !data.data) {
      throw new Error(data.msg || 'OKX candles error')
    }

    // OKX returns [ts, o, h, l, c, vol, volCcy, volCcyQuote, confirm]
    const candles = data.data.reverse().map((c: string[]) => ({
      time: Math.floor(parseInt(c[0]) / 1000),
      open: parseFloat(c[1]),
      high: parseFloat(c[2]),
      low: parseFloat(c[3]),
      close: parseFloat(c[4]),
      volume: parseFloat(c[5]),
    }))

    return NextResponse.json({ success: true, candles, count: candles.length })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message, candles: [] })
  }
}
