'use client'
import { useEffect, useRef, useState } from 'react'
import { createChart, ColorType, CrosshairMode } from 'lightweight-charts'

/* ═══════════════════════════════════════════════════════════════
   TradingChart — Professional candlestick chart using lightweight-charts
   Fetches OHLCV data from /api/candles and renders with volume
   ═══════════════════════════════════════════════════════════════ */

const INTERVALS = [
  { label: '1m', value: '1m' },
  { label: '5m', value: '5m' },
  { label: '15m', value: '15m' },
  { label: '1H', value: '1H' },
  { label: '4H', value: '4H' },
  { label: '1D', value: '1D' },
]

export default function TradingChart({ symbol = 'BTC-USDT' }: { symbol?: string }) {
  const chartRef = useRef<HTMLDivElement>(null)
  const chartInstance = useRef<any>(null)
  const [interval, setInterval_] = useState('1H')
  const [lastPrice, setLastPrice] = useState(0)
  const [priceChange, setPriceChange] = useState(0)

  useEffect(() => {
    if (!chartRef.current) return

    const chart = createChart(chartRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#121212' },
        textColor: '#666',
        fontSize: 11,
      },
      grid: {
        vertLines: { color: '#1a1a2e' },
        horzLines: { color: '#1a1a2e' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: {
        borderColor: '#1e1e2e',
        scaleMargins: { top: 0.1, bottom: 0.25 },
      },
      timeScale: {
        borderColor: '#1e1e2e',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScale: { mouseWheel: true, pinch: true },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
    })

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#00b853',
      downColor: '#ff4d4f',
      borderDownColor: '#ff4d4f',
      borderUpColor: '#00b853',
      wickDownColor: '#ff4d4f',
      wickUpColor: '#00b853',
    })

    const volumeSeries = chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    })

    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    })

    chartInstance.current = { chart, candleSeries, volumeSeries }

    const fetchData = async () => {
      try {
        const res = await fetch(`/api/candles?symbol=${symbol}&bar=${interval}&limit=300`)
        const data = await res.json()
        if (data.success && data.candles?.length) {
          candleSeries.setData(data.candles.map((c: any) => ({
            time: c.time, open: c.open, high: c.high, low: c.low, close: c.close,
          })))
          volumeSeries.setData(data.candles.map((c: any) => ({
            time: c.time,
            value: c.volume,
            color: c.close >= c.open ? 'rgba(0,184,83,0.3)' : 'rgba(255,77,79,0.3)',
          })))
          const last = data.candles[data.candles.length - 1]
          const first = data.candles[0]
          setLastPrice(last.close)
          setPriceChange(first.open > 0 ? ((last.close - first.open) / first.open) * 100 : 0)
          chart.timeScale().fitContent()
        }
      } catch {}
    }

    fetchData()
    const iv = window.setInterval(fetchData, 15000)

    const handleResize = () => {
      if (chartRef.current) {
        chart.applyOptions({ width: chartRef.current.clientWidth })
      }
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.clearInterval(iv)
      window.removeEventListener('resize', handleResize)
      chart.remove()
    }
  }, [symbol, interval])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
        <div className="flex items-center gap-4">
          <span className="font-medium text-sm">{symbol.replace('-', '/')}</span>
          <span className="font-mono text-sm">{lastPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
          <span className={`text-xs ${priceChange >= 0 ? 'green-text' : 'red-text'}`}>
            {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
          </span>
        </div>
        <div className="flex gap-1">
          {INTERVALS.map(i => (
            <button key={i.value} onClick={() => setInterval_(i.value)}
              className="text-xs px-2 py-1 rounded transition-all"
              style={{
                background: interval === i.value ? 'var(--bg-tertiary)' : 'transparent',
                color: interval === i.value ? 'var(--text-primary)' : 'var(--text-tertiary)',
              }}>
              {i.label}
            </button>
          ))}
        </div>
      </div>
      <div ref={chartRef} className="flex-1" style={{ minHeight: 300 }} />
    </div>
  )
}
