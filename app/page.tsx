'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer } from 'recharts'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

const SYMBOLS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'ARB/USDT', 'DOGE/USDT']

/* ══════════════════════════════════════════════════════════════ */
export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('overview')
  const [trades, setTrades] = useState<any[]>([])
  const [alerts, setAlerts] = useState<any[]>([])
  const [strategies, setStrategies] = useState<any[]>([])
  const [portfolio, setPortfolio] = useState<any>(null)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [orderSymbol, setOrderSymbol] = useState('BTC/USDT')
  const [orderSide, setOrderSide] = useState('buy')
  const [orderSize, setOrderSize] = useState('')
  const [orderStatus, setOrderStatus] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const loadData = useCallback(async () => {
    const { data: p } = await supabase.from('portfolio_snapshots').select('*').order('timestamp', { ascending: false }).limit(1)
    if (p && p.length) setPortfolio(p[0])
    const { data: s } = await supabase.from('strategy_performance').select('*').order('total_pnl', { ascending: false })
    if (s) setStrategies(s)
    const { data: a } = await supabase.from('system_alerts').select('*').order('timestamp', { ascending: false }).limit(10)
    if (a) setAlerts(a)
    const { data: t } = await supabase.from('trades').select('*').order('timestamp', { ascending: false }).limit(50)
    if (t) setTrades(t)
  }, [])

  useEffect(() => {
    loadData()
    const sub = supabase.channel('rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trades' }, (p: any) => {
        if (p.eventType === 'INSERT') setTrades(prev => [p.new, ...prev].slice(0, 50))
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'system_alerts' }, (p: any) => {
        setAlerts(prev => [p.new, ...prev].slice(0, 10))
      })
      .subscribe()
    return () => { supabase.removeChannel(sub) }
  }, [loadData])

  const placeOrder = async () => {
    if (!orderSize || parseFloat(orderSize) <= 0 || submitting) return
    setSubmitting(true)
    const { error } = await supabase.from('trades').insert({
      symbol: orderSymbol, side: orderSide, size: parseFloat(orderSize),
      price: 0, exchange: 'okx', strategy: 'manual', regime: 'manual',
      timestamp: new Date().toISOString(),
    })
    if (error) setOrderStatus('Error: ' + error.message)
    else { setOrderStatus(orderSide.toUpperCase() + ' ' + orderSize + ' ' + orderSymbol + ' placed'); setOrderSize(''); loadData() }
    setSubmitting(false)
    setTimeout(() => setOrderStatus(''), 4000)
  }

  const chartData = Array.from({ length: 30 }, (_, i) => ({ d: i + 1, v: 95000 + Math.random() * 8000 + i * 300 }))
  const tabs = ['overview', 'trade', 'positions', 'strategies', 'risk']
  const totalValue = portfolio?.total_value || 100000

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-primary)' }}>

      {/* ── HEADER ─────────────────────────────────────────────── */}
      <header style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }} className="sticky top-0 z-50">
        <div className="flex items-center justify-between px-5 h-14">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="4" fill="#fff"/><path d="M6 8h4v4H6zM10 12h4v4h-4zM14 8h4v4h-4z" fill="#121212"/></svg>
              <span className="text-base font-semibold tracking-tight">ATLAS</span>
            </div>
            <nav className="flex items-center">
              {tabs.map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`okx-tab ${activeTab === tab ? 'okx-tab-active' : ''}`}>
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--green)' }} />
              OKX
            </div>
            <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {currentTime.toUTCString().slice(17, 25)} UTC
            </div>
            <div className="okx-badge okx-badge-yellow text-xs">Paper</div>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto">

        {/* ══ OVERVIEW ═══════════════════════════════════════════ */}
        {activeTab === 'overview' && (
          <div className="p-5 space-y-4">
            {/* Balance Row */}
            <div className="okx-card p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Total Balance</div>
                  <div className="text-3xl font-semibold">${totalValue.toLocaleString()}</div>
                  <div className="flex items-center gap-4 mt-2 text-sm">
                    <span style={{ color: 'var(--text-secondary)' }}>Today&apos;s PnL</span>
                    <span className="green-text">+$450.00 (+0.45%)</span>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button className="okx-btn okx-btn-green">Deposit</button>
                  <button className="okx-btn okx-btn-ghost">Withdraw</button>
                </div>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-5 gap-4">
              {[
                { label: 'Unrealized PnL', value: '+$1,250.00', color: 'green-text' },
                { label: 'Win Rate', value: '62.0%', color: '' },
                { label: 'Sharpe Ratio', value: '1.80', color: '' },
                { label: 'Max Drawdown', value: '5.0%', color: '' },
                { label: 'Active Trades', value: String(trades.length), color: '' },
              ].map(s => (
                <div key={s.label} className="okx-card p-4">
                  <div className="text-xs mb-1.5" style={{ color: 'var(--text-tertiary)' }}>{s.label}</div>
                  <div className={`text-lg font-medium ${s.color}`}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Chart + Allocation */}
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2 okx-card p-4">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-medium">Portfolio Value</span>
                  <div className="flex gap-2">
                    {['1D', '1W', '1M', '3M'].map(p => (
                      <button key={p} className="text-xs px-2 py-1 rounded" style={{ color: p === '1M' ? 'var(--text-primary)' : 'var(--text-tertiary)', background: p === '1M' ? 'var(--bg-tertiary)' : 'transparent' }}>{p}</button>
                    ))}
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#00b853" stopOpacity={0.15}/>
                        <stop offset="100%" stopColor="#00b853" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="d" stroke="#333" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="#333" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${(v/1000).toFixed(0)}k`} width={40} />
                    <Area type="monotone" dataKey="v" stroke="#00b853" fill="url(#g)" strokeWidth={1.5} dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="okx-card p-4">
                <div className="text-sm font-medium mb-4">Assets</div>
                <div className="space-y-3">
                  {[
                    { name: 'OKX Spot', value: 60000, pct: 60 },
                    { name: 'OKX Perp', value: 40000, pct: 40 },
                  ].map(a => (
                    <div key={a.name}>
                      <div className="flex justify-between text-sm mb-1">
                        <span style={{ color: 'var(--text-secondary)' }}>{a.name}</span>
                        <span>${a.value.toLocaleString()}</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full" style={{ background: 'var(--bg-tertiary)' }}>
                        <div className="h-full rounded-full" style={{ width: a.pct + '%', background: a.name.includes('Spot') ? 'var(--green)' : 'var(--blue)' }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-6">
                  <div className="text-sm font-medium mb-3">Recent Alerts</div>
                  <div className="space-y-2">
                    {(alerts.length > 0 ? alerts.slice(0, 4) : [
                      { level: 'warning', message: 'Portfolio drawdown approaching threshold', timestamp: new Date().toISOString() }
                    ]).map((a, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
                        <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: a.level === 'warning' ? 'var(--yellow)' : a.level === 'error' ? 'var(--red)' : 'var(--blue)' }} />
                        <div>
                          <div>{a.message}</div>
                          <div style={{ color: 'var(--text-tertiary)' }}>{new Date(a.timestamp).toLocaleTimeString()}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Trades */}
            <div className="okx-card">
              <div className="flex items-center justify-between p-4 pb-0">
                <span className="text-sm font-medium">Recent Trades</span>
                <button onClick={() => setActiveTab('trade')} className="text-xs" style={{ color: 'var(--text-tertiary)' }}>View All →</button>
              </div>
              <table className="w-full okx-table mt-2">
                <thead><tr>
                  <th>Time</th><th>Pair</th><th>Side</th><th className="text-right">Amount</th><th className="text-right">Price</th><th>Exchange</th><th>Strategy</th>
                </tr></thead>
                <tbody>
                  {trades.length === 0 && <tr><td colSpan={7} className="text-center py-8" style={{ color: 'var(--text-tertiary)' }}>No trades yet</td></tr>}
                  {trades.slice(0, 5).map((t, i) => (
                    <tr key={i}>
                      <td style={{ color: 'var(--text-tertiary)' }} className="text-xs">{t.timestamp ? new Date(t.timestamp).toLocaleString() : '-'}</td>
                      <td className="font-medium">{t.symbol}</td>
                      <td><span className={`okx-badge ${t.side === 'buy' || t.side === 'long' ? 'okx-badge-green' : 'okx-badge-red'}`}>{t.side?.toUpperCase()}</span></td>
                      <td className="text-right">{t.size}</td>
                      <td className="text-right">{t.price ? '$' + parseFloat(t.price).toLocaleString() : '-'}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{t.exchange?.toUpperCase()}</td>
                      <td style={{ color: 'var(--text-tertiary)' }}>{t.strategy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══ TRADE ══════════════════════════════════════════════ */}
        {activeTab === 'trade' && (
          <div className="flex" style={{ height: 'calc(100vh - 56px)' }}>
            {/* Order Panel */}
            <div className="w-80 flex-shrink-0 p-4 space-y-4" style={{ borderRight: '1px solid var(--border)' }}>
              <div className="flex rounded overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                <button onClick={() => setOrderSide('buy')}
                  className={`flex-1 py-2.5 text-sm font-medium transition-all ${orderSide === 'buy' ? 'text-white' : ''}`}
                  style={{ background: orderSide === 'buy' ? 'var(--green)' : 'var(--bg-tertiary)', color: orderSide === 'buy' ? '#fff' : 'var(--text-tertiary)' }}>
                  Buy / Long
                </button>
                <button onClick={() => setOrderSide('sell')}
                  className={`flex-1 py-2.5 text-sm font-medium transition-all`}
                  style={{ background: orderSide === 'sell' ? 'var(--red)' : 'var(--bg-tertiary)', color: orderSide === 'sell' ? '#fff' : 'var(--text-tertiary)' }}>
                  Sell / Short
                </button>
              </div>

              <div>
                <label className="text-xs block mb-1.5" style={{ color: 'var(--text-tertiary)' }}>Pair</label>
                <select value={orderSymbol} onChange={e => setOrderSymbol(e.target.value)} className="okx-input">
                  {SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs block mb-1.5" style={{ color: 'var(--text-tertiary)' }}>Amount</label>
                <input type="number" step="any" value={orderSize} onChange={e => setOrderSize(e.target.value)}
                  placeholder="0.00" className="okx-input" />
              </div>

              <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                Route: {orderSide === 'buy' ? 'OKX Spot' : 'OKX Perpetual'}
              </div>

              <button onClick={placeOrder} disabled={submitting || !orderSize}
                className={`w-full py-3 rounded text-sm font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed`}
                style={{ background: orderSide === 'buy' ? 'var(--green)' : 'var(--red)', color: '#fff' }}>
                {submitting ? 'Placing...' : (orderSide === 'buy' ? 'Buy / Long' : 'Sell / Short') + ' ' + orderSymbol}
              </button>

              {orderStatus && (
                <div className={`text-xs p-2.5 rounded ${orderStatus.startsWith('Error') ? 'okx-badge-red' : 'okx-badge-green'}`}>
                  {orderStatus}
                </div>
              )}

              <div style={{ borderTop: '1px solid var(--border)' }} className="pt-4">
                <div className="text-xs font-medium mb-3" style={{ color: 'var(--text-secondary)' }}>Risk Limits</div>
                <div className="space-y-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                  <div className="flex justify-between"><span>Max per trade</span><span>2%</span></div>
                  <div className="flex justify-between"><span>Max leverage</span><span>3x</span></div>
                  <div className="flex justify-between"><span>Daily limit</span><span>20 trades</span></div>
                  <div className="flex justify-between"><span>Vol pause</span><span>&gt;6%</span></div>
                </div>
              </div>
            </div>

            {/* Trade History */}
            <div className="flex-1 overflow-auto">
              <div className="flex items-center justify-between p-4 pb-2">
                <span className="text-sm font-medium">Trade History</span>
                <button onClick={loadData} className="text-xs" style={{ color: 'var(--text-tertiary)' }}>↻ Refresh</button>
              </div>
              <table className="w-full okx-table">
                <thead><tr>
                  <th>Time</th><th>Pair</th><th>Side</th><th className="text-right">Amount</th><th className="text-right">Price</th><th>Exchange</th><th>Strategy</th>
                </tr></thead>
                <tbody>
                  {trades.length === 0 && <tr><td colSpan={7} className="text-center py-16" style={{ color: 'var(--text-tertiary)' }}>No trades yet. Place your first order.</td></tr>}
                  {trades.map((t, i) => (
                    <tr key={i}>
                      <td style={{ color: 'var(--text-tertiary)' }} className="text-xs">{t.timestamp ? new Date(t.timestamp).toLocaleString() : '-'}</td>
                      <td className="font-medium">{t.symbol}</td>
                      <td><span className={`okx-badge ${t.side === 'buy' || t.side === 'long' ? 'okx-badge-green' : 'okx-badge-red'}`}>{t.side?.toUpperCase()}</span></td>
                      <td className="text-right">{t.size}</td>
                      <td className="text-right">{t.price ? '$' + parseFloat(t.price).toLocaleString() : '-'}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{t.exchange?.toUpperCase()}</td>
                      <td style={{ color: 'var(--text-tertiary)' }}>{t.strategy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══ POSITIONS ══════════════════════════════════════════ */}
        {activeTab === 'positions' && (
          <div className="p-5">
            <div className="okx-card">
              <div className="p-4 pb-2 flex items-center justify-between">
                <span className="text-sm font-medium">Open Positions</span>
                <button onClick={loadData} className="text-xs" style={{ color: 'var(--text-tertiary)' }}>↻ Refresh</button>
              </div>
              <table className="w-full okx-table">
                <thead><tr>
                  <th>Pair</th><th>Side</th><th className="text-right">Size</th><th className="text-right">Entry Price</th><th className="text-right">Mark Price</th><th className="text-right">PnL</th><th className="text-right">Leverage</th><th>Exchange</th>
                </tr></thead>
                <tbody>
                  <tr><td colSpan={8} className="text-center py-16" style={{ color: 'var(--text-tertiary)' }}>No open positions. Positions will appear when the engine executes trades.</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ══ STRATEGIES ═════════════════════════════════════════ */}
        {activeTab === 'strategies' && (
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-3 gap-4">
              {(strategies.length > 0 ? strategies : [
                { strategy_name: 'Momentum', total_pnl: 12500, win_rate: 0.628, sharpe_ratio: 2.1, current_weight: 0.25, total_trades: 456 },
                { strategy_name: 'Order Flow', total_pnl: 8900, win_rate: 0.71, sharpe_ratio: 1.9, current_weight: 0.2, total_trades: 234 },
                { strategy_name: 'Mean Reversion', total_pnl: 6200, win_rate: 0.58, sharpe_ratio: 1.5, current_weight: 0.2, total_trades: 312 },
                { strategy_name: 'Liquidation', total_pnl: 5800, win_rate: 0.64, sharpe_ratio: 1.6, current_weight: 0.15, total_trades: 178 },
                { strategy_name: 'Whale Follow', total_pnl: 4100, win_rate: 0.65, sharpe_ratio: 1.7, current_weight: 0.1, total_trades: 89 },
                { strategy_name: 'AI Consensus', total_pnl: 15200, win_rate: 0.72, sharpe_ratio: 2.4, current_weight: 0.1, total_trades: 567 },
              ]).map((s: any, i) => (
                <div key={i} className="okx-card p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-medium">{s.strategy_name}</span>
                    <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>{(s.current_weight * 100).toFixed(0)}%</span>
                  </div>
                  <div className={`text-xl font-semibold mb-3 ${s.total_pnl >= 0 ? 'green-text' : 'red-text'}`}>${s.total_pnl.toLocaleString()}</div>
                  <div className="grid grid-cols-3 gap-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    <div><div>Win Rate</div><div className="text-white mt-0.5">{(s.win_rate * 100).toFixed(1)}%</div></div>
                    <div><div>Sharpe</div><div className="text-white mt-0.5">{s.sharpe_ratio.toFixed(2)}</div></div>
                    <div><div>Trades</div><div className="text-white mt-0.5">{s.total_trades}</div></div>
                  </div>
                </div>
              ))}
            </div>

            <div className="okx-card p-4">
              <div className="text-sm font-medium mb-3">Engine Pipeline</div>
              <div className="flex items-center gap-1 text-xs flex-wrap">
                {['Market Data', 'Strategies', 'Regime', 'Consensus', 'Portfolio', 'Position Scaler', 'Risk', 'OKX', 'Supabase', 'Dashboard'].map((s, i) => (
                  <span key={s} className="flex items-center gap-1">
                    <span className="px-2.5 py-1 rounded" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>{s}</span>
                    {i < 9 && <span style={{ color: 'var(--text-tertiary)' }}>→</span>}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ══ RISK ═══════════════════════════════════════════════ */}
        {activeTab === 'risk' && (
          <div className="p-5">
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Max Risk / Trade', value: '2%', ok: true },
                { label: 'Max Exposure', value: '20%', ok: true },
                { label: 'Max Leverage', value: '3x', ok: true },
                { label: 'Max Drawdown', value: '10%', ok: true },
                { label: 'Daily Loss Limit', value: '5%', ok: true },
                { label: 'Max Trades / Day', value: '20', ok: true },
                { label: 'Volatility Pause', value: '> 6%', ok: true },
                { label: 'Position Cap', value: '3% of portfolio', ok: true },
                { label: 'Engine Mode', value: 'Paper Trading', ok: false },
              ].map(r => (
                <div key={r.label} className="okx-card p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{r.label}</span>
                    <div className="w-2 h-2 rounded-full" style={{ background: r.ok ? 'var(--green)' : 'var(--yellow)' }} />
                  </div>
                  <div className="text-lg font-medium">{r.value}</div>
                </div>
              ))}
            </div>
          </div>
        )}

      </main>
    </div>
  )
}
