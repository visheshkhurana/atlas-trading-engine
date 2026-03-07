import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

/* ═══════════════════════════════════════════════════════════════
   ATLAS Trade API - Proxies orders to OKX Exchange
   POST /api/trade
   Body: { symbol, side, size, price?, orderType }
   ═══════════════════════════════════════════════════════════════ */

const OKX_API_KEY = process.env.OKX_Keys || ''
const OKX_SECRET = process.env.Okx_Secret_keys || ''
const OKX_PASSPHRASE = process.env.OKX_PASSPHRASE || ''
const PAPER_MODE = process.env.PAPER_MODE !== 'false'
const OKX_BASE = PAPER_MODE
  ? 'https://www.okx.com'  // OKX uses same endpoint, paper mode via header
  : 'https://www.okx.com'

function sign(timestamp: string, method: string, path: string, body: string) {
  const prehash = timestamp + method + path + body
  return crypto.createHmac('sha256', OKX_SECRET).update(prehash).digest('base64')
}

function okxHeaders(method: string, path: string, body: string) {
  const ts = new Date().toISOString()
  return {
    'OK-ACCESS-KEY': OKX_API_KEY,
    'OK-ACCESS-SIGN': sign(ts, method, path, body),
    'OK-ACCESS-TIMESTAMP': ts,
    'OK-ACCESS-PASSPHRASE': OKX_PASSPHRASE,
    ...(PAPER_MODE ? { 'x-simulated-trading': '1' } : {}),
    'Content-Type': 'application/json',
  }
}

export async function POST(req: NextRequest) {
  try {
    const { symbol, side, size, price, orderType = 'market' } = await req.json()

    if (!symbol || !side || !size) {
      return NextResponse.json({ error: 'Missing required fields: symbol, side, size' }, { status: 400 })
    }

    if (!OKX_API_KEY || !OKX_SECRET) {
      return NextResponse.json({ error: 'OKX API keys not configured' }, { status: 500 })
    }

    // Convert symbol format: BTC/USDT -> BTC-USDT
    const instId = symbol.replace('/', '-')

    // Determine trade mode and instrument type
    const isBuy = side === 'buy' || side === 'long'
    const tdMode = isBuy ? 'cash' : 'cross'  // spot=cash, perp=cross
    const actualInstId = isBuy ? instId : instId + '-SWAP'

    // Build OKX order body
    const orderBody: any = {
      instId: actualInstId,
      tdMode,
      side: isBuy ? 'buy' : 'sell',
      ordType: orderType === 'limit' ? 'limit' : 'market',
      sz: String(size),
    }

    // For perpetual shorts, set position side
    if (!isBuy) {
      orderBody.posSide = 'short'
    }

    // Add price for limit orders
    if (orderType === 'limit' && price) {
      orderBody.px = String(price)
    }

    const path = '/api/v5/trade/order'
    const body = JSON.stringify(orderBody)
    const headers = okxHeaders('POST', path, body)

    const res = await fetch(OKX_BASE + path, {
      method: 'POST',
      headers,
      body,
    })

    const data = await res.json()

    if (data.code === '0' && data.data?.[0]) {
      const order = data.data[0]
      return NextResponse.json({
        success: true,
        orderId: order.ordId,
        clientOrderId: order.clOrdId,
        symbol: actualInstId,
        side,
        size,
        orderType,
        mode: PAPER_MODE ? 'paper' : 'live',
        message: `Order placed: ${side.toUpperCase()} ${size} ${symbol}`,
      })
    } else {
      return NextResponse.json({
        error: data.msg || data.data?.[0]?.sMsg || 'OKX order failed',
        code: data.code,
        details: data.data,
      }, { status: 400 })
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 })
  }
}

/* ── GET /api/trade - Fetch account balance ───────────────── */
export async function GET() {
  try {
    if (!OKX_API_KEY || !OKX_SECRET) {
      return NextResponse.json({ error: 'OKX API keys not configured', balance: null })
    }

    const path = '/api/v5/account/balance'
    const headers = okxHeaders('GET', path, '')

    const res = await fetch(OKX_BASE + path, { headers })
    const data = await res.json()

    if (data.code === '0' && data.data?.[0]) {
      const bal = data.data[0]
      return NextResponse.json({
        success: true,
        totalEq: bal.totalEq,
        mode: PAPER_MODE ? 'paper' : 'live',
        details: bal.details?.map((d: any) => ({
          currency: d.ccy,
          available: d.availBal,
          equity: d.eq,
        })),
      })
    } else {
      return NextResponse.json({ error: data.msg || 'Failed to fetch balance' }, { status: 400 })
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
