import { NextRequest, NextResponse } from 'next/server'

/* ═══════════════════════════════════════════════════════════════
   ATLAS Order Book API — Fetches depth from OKX
   GET /api/orderbook?symbol=BTC-USDT&depth=20
   ═══════════════════════════════════════════════════════════════ */

export const revalidate = 3

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const symbol = searchParams.get('symbol') || 'BTC-USDT'
  const depth = searchParams.get('depth') || '20'

  try {
    const url = `https://www.okx.com/api/v5/market/books?instId=${symbol}&sz=${depth}`
    const res = await fetch(url, {
      next: { revalidate: 3 },
      headers: { 'User-Agent': 'ATLAS/1.0' },
    })
    const data = await res.json()

    if (data.code !== '0' || !data.data?.[0]) throw new Error(data.msg || 'OKX orderbook error')

    const book = data.data[0]
    // OKX format: [price, size, deprecatedField, numOrders]
    const bids = book.bids.map((b: string[]) => ({ price: parseFloat(b[0]), size: parseFloat(b[1]), total: 0 }))
    const asks = book.asks.map((a: string[]) => ({ price: parseFloat(a[0]), size: parseFloat(a[1]), total: 0 }))

    // Cumulative totals
    let bidTotal = 0
    bids.forEach((b: any) => { bidTotal += b.size; b.total = bidTotal })
    let askTotal = 0
    asks.forEach((a: any) => { askTotal += a.size; a.total = askTotal })

    const spread = asks.length && bids.length ? asks[0].price - bids[0].price : 0
    const spreadPct = bids.length && bids[0].price > 0 ? (spread / bids[0].price) * 100 : 0
    const midPrice = bids.length && asks.length ? (bids[0].price + asks[0].price) / 2 : 0

    return NextResponse.json({
      success: true,
      bids, asks, spread, spreadPct, midPrice,
      timestamp: parseInt(book.ts),
    })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message, bids: [], asks: [] })
  }
}
