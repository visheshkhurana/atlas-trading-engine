import { NextResponse } from 'next/server'

/* ═══════════════════════════════════════════════════════════════
   ATLAS Prices API - Proxies OKX market data (no CORS issues)
   GET /api/prices
   Returns: { prices: { BTC: {price, change, high, low, vol}, ... } }
   ═══════════════════════════════════════════════════════════════ */

const TRACKED = ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'ARB-USDT', 'DOGE-USDT', 'AVAX-USDT', 'LINK-USDT', 'OP-USDT']

export const revalidate = 5 // ISR: cache for 5 seconds

export async function GET() {
  try {
    const res = await fetch('https://www.okx.com/api/v5/market/tickers?instType=SPOT', {
      next: { revalidate: 5 },
      headers: { 'User-Agent': 'ATLAS-Trading-Engine/1.0' },
    })

    if (!res.ok) throw new Error('OKX API returned ' + res.status)

    const data = await res.json()

    if (data.code !== '0' || !data.data) {
      throw new Error(data.msg || 'Invalid OKX response')
    }

    const prices: Record<string, any> = {}

    data.data.forEach((t: any) => {
      if (TRACKED.includes(t.instId)) {
        const sym = t.instId.split('-')[0] // BTC-USDT -> BTC
        const last = parseFloat(t.last)
        const open = parseFloat(t.open24h)
        prices[sym] = {
          price: last,
          change: open > 0 ? ((last - open) / open) * 100 : 0,
          high24h: parseFloat(t.high24h),
          low24h: parseFloat(t.low24h),
          vol24h: parseFloat(t.vol24h),
          volCcy24h: parseFloat(t.volCcy24h),
          timestamp: parseInt(t.ts),
        }
      }
    })

    return NextResponse.json({
      success: true,
      prices,
      count: Object.keys(prices).length,
      source: 'okx',
      cached_at: new Date().toISOString(),
    })
  } catch (err: any) {
    // Fallback with simulated prices if OKX is unreachable
    return NextResponse.json({
      success: false,
      error: err.message,
      prices: {
        BTC: { price: 98500, change: 1.2, high24h: 99000, low24h: 97500, vol24h: 0 },
        ETH: { price: 3780, change: 0.8, high24h: 3850, low24h: 3720, vol24h: 0 },
        SOL: { price: 178, change: 2.1, high24h: 182, low24h: 174, vol24h: 0 },
        ARB: { price: 1.18, change: -0.5, high24h: 1.22, low24h: 1.15, vol24h: 0 },
        DOGE: { price: 0.165, change: 0.3, high24h: 0.17, low24h: 0.162, vol24h: 0 },
      },
      source: 'fallback',
      cached_at: new Date().toISOString(),
    })
  }
}
