'use client'
import { useState, useEffect } from 'react'

/* ═══════════════════════════════════════════════════════════════
   OrderBook — Real-time bid/ask depth visualization
   ═══════════════════════════════════════════════════════════════ */

export default function OrderBook({ symbol = 'BTC-USDT' }: { symbol?: string }) {
  const [book, setBook] = useState<any>({ bids: [], asks: [], spread: 0, spreadPct: 0, midPrice: 0 })

  useEffect(() => {
    const go = async () => {
      try {
        const res = await fetch(`/api/orderbook?symbol=${symbol}&depth=15`)
        const data = await res.json()
        if (data.success) setBook(data)
      } catch {}
    }
    go()
    const iv = setInterval(go, 3000)
    return () => clearInterval(iv)
  }, [symbol])

  const maxTotal = Math.max(
    book.bids.length ? book.bids[book.bids.length - 1].total : 1,
    book.asks.length ? book.asks[book.asks.length - 1].total : 1
  )

  return (
    <div className="h-full flex flex-col text-xs">
      <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
        <span className="text-sm font-medium">Order Book</span>
        <span style={{ color: 'var(--text-tertiary)' }}>{symbol.replace('-', '/')}</span>
      </div>

      {/* Header */}
      <div className="flex px-3 py-1.5" style={{ color: 'var(--text-tertiary)', borderBottom: '1px solid var(--border)' }}>
        <span className="flex-1">Price</span>
        <span className="flex-1 text-right">Size</span>
        <span className="flex-1 text-right">Total</span>
      </div>

      {/* Asks (reversed so lowest ask is at bottom) */}
      <div className="flex-1 overflow-hidden flex flex-col justify-end">
        {[...book.asks].reverse().slice(0, 12).map((a: any, i: number) => (
          <div key={'a' + i} className="flex px-3 py-0.5 relative">
            <div className="absolute right-0 top-0 bottom-0 opacity-15" style={{ width: (a.total / maxTotal * 100) + '%', background: 'var(--red)' }} />
            <span className="flex-1 red-text font-mono relative z-10">{a.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            <span className="flex-1 text-right font-mono relative z-10">{a.size.toFixed(4)}</span>
            <span className="flex-1 text-right font-mono relative z-10" style={{ color: 'var(--text-tertiary)' }}>{a.total.toFixed(4)}</span>
          </div>
        ))}
      </div>

      {/* Spread */}
      <div className="flex items-center justify-center py-2 gap-3" style={{ background: 'var(--bg-tertiary)', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        <span className="font-mono font-medium">{book.midPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
        <span style={{ color: 'var(--text-tertiary)' }}>Spread: {book.spread.toFixed(2)} ({book.spreadPct.toFixed(4)}%)</span>
      </div>

      {/* Bids */}
      <div className="flex-1 overflow-hidden">
        {book.bids.slice(0, 12).map((b: any, i: number) => (
          <div key={'b' + i} className="flex px-3 py-0.5 relative">
            <div className="absolute right-0 top-0 bottom-0 opacity-15" style={{ width: (b.total / maxTotal * 100) + '%', background: 'var(--green)' }} />
            <span className="flex-1 green-text font-mono relative z-10">{b.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
            <span className="flex-1 text-right font-mono relative z-10">{b.size.toFixed(4)}</span>
            <span className="flex-1 text-right font-mono relative z-10" style={{ color: 'var(--text-tertiary)' }}>{b.total.toFixed(4)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
