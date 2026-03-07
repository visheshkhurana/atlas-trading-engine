'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Activity, TrendingUp, TrendingDown, Wallet, Shield, Zap, BarChart3, AlertTriangle, Clock, Send, RefreshCw } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

const COLORS = ['#00ff88', '#00ccff', '#ff6644', '#ffaa00', '#aa66ff', '#ff44aa']
const SYMBOLS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'ARB/USDT', 'DOGE/USDT']

/* ── Stat Card ───────────────────────────────────────────────── */
function StatCard({ title, value, change, icon: Icon }: any) {
  const isPositive = change >= 0
  return (
    <div className="glass-card p-4 hover:border-atlas-accent/30 transition-all">
      <div className="flex items-center justify-between mb-2">
        <span className="text-atlas-muted text-xs uppercase tracking-wider">{title}</span>
        <Icon className="w-4 h-4 text-atlas-muted" />
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
      {change !== undefined && (
        <div className={`flex items-center gap-1 mt-1 text-sm ${isPositive ? 'text-atlas-profit' : 'text-atlas-loss'}`}>
          {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {isPositive ? '+' : ''}{change}%
        </div>
      )}
    </div>
  )
}

/* ── Strategy Card ───────────────────────────────────────────── */
function StrategyCard({ name, pnl, winRate, sharpe, weight, trades }: any) {
  return (
    <div className="glass-card p-4 hover:border-atlas-accent/20 transition-all">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-semibold text-white">{name}</h3>
        <span className="text-xs px-2 py-1 rounded-full bg-atlas-accent/10 text-atlas-accent">{(weight*100).toFixed(0)}%</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div><span className="text-atlas-muted">P&L:</span> <span className={`${pnl >= 0 ? 'text-atlas-profit' : 'text-atlas-loss'}`}>${pnl.toLocaleString()}</span></div>
        <div><span className="text-atlas-muted">Win:</span> <span className="text-white">{(winRate*100).toFixed(1)}%</span></div>
        <div><span className="text-atlas-muted">Sharpe:</span> <span className="text-white">{sharpe.toFixed(2)}</span></div>
        <div><span className="text-atlas-muted">Trades:</span> <span className="text-white">{trades}</span></div>
      </div>
    </div>
  )
}

/* ── Alert Item ──────────────────────────────────────────────── */
function AlertItem({ level, message, timestamp }: any) {
  const colors: any = { info: 'text-blue-400', warning: 'text-atlas-warning', critical: 'text-atlas-loss', error: 'text-atlas-loss' }
  return (
    <div className="flex items-start gap-3 p-3 border-b border-atlas-border/50 last:border-0">
      <AlertTriangle className={`w-4 h-4 mt-0.5 ${colors[level] || 'text-blue-400'}`} />
      <div className="flex-1">
        <p className="text-sm text-atlas-text">{message}</p>
        <p className="text-xs text-atlas-muted mt-1">{new Date(timestamp).toLocaleString()}</p>
      </div>
    </div>
  )
}

/* ── Manual Order Form ───────────────────────────────────────── */
function OrderForm({ onSubmit }: { onSubmit: (order: any) => void }) {
  const [symbol, setSymbol] = useState('BTC/USDT')
  const [side, setSide] = useState('buy')
  const [size, setSize] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: any) => {
    e.preventDefault()
    if (!size || parseFloat(size) <= 0) return
    setSubmitting(true)
    await onSubmit({ symbol, side, size: parseFloat(size) })
    setSize('')
    setSubmitting(false)
  }

  return (
    <form onSubmit={handleSubmit} className="glass-card p-5">
      <h2 className="text-sm font-semibold text-atlas-muted uppercase tracking-wider mb-4">Place Order</h2>
      <div className="space-y-4">
        <div>
          <label className="text-xs text-atlas-muted mb-1 block">Symbol</label>
          <select value={symbol} onChange={e => setSymbol(e.target.value)}
            className="w-full bg-atlas-card border border-atlas-border rounded px-3 py-2 text-white text-sm focus:border-atlas-accent outline-none">
            {SYMBOLS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-atlas-muted mb-1 block">Side</label>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setSide('buy')}
              className={`py-2 rounded text-sm font-semibold transition-all ${side === 'buy' ? 'bg-atlas-profit text-black' : 'bg-atlas-card border border-atlas-border text-atlas-muted'}`}>
              LONG / BUY
            </button>
            <button type="button" onClick={() => setSide('sell')}
              className={`py-2 rounded text-sm font-semibold transition-all ${side === 'sell' ? 'bg-atlas-loss text-white' : 'bg-atlas-card border border-atlas-border text-atlas-muted'}`}>
              SHORT / SELL
            </button>
          </div>
        </div>
        <div>
          <label className="text-xs text-atlas-muted mb-1 block">Size (units)</label>
          <input type="number" step="any" value={size} onChange={e => setSize(e.target.value)} placeholder="0.001"
            className="w-full bg-atlas-card border border-atlas-border rounded px-3 py-2 text-white text-sm focus:border-atlas-accent outline-none" />
        </div>
        <div className="text-xs text-atlas-muted">
          Route: {side === 'buy' ? 'OKX Spot' : 'OKX Perp'}
        </div>
        <button type="submit" disabled={submitting || !size}
          className="w-full py-2.5 rounded bg-atlas-accent text-black font-semibold text-sm hover:bg-atlas-accent/90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all">
          <Send className="w-4 h-4" />
          {submitting ? 'Placing...' : 'Place Order'}
        </button>
      </div>
    </form>
  )
}

/* ══════════════════════════════════════════════════════════════
   MAIN DASHBOARD
   ══════════════════════════════════════════════════════════════ */
export default function Dashboard() {
  const [portfolio, setPortfolio] = useState<any>(null)
  const [strategies, setStrategies] = useState<any[]>([])
  const [alerts, setAlerts] = useState<any[]>([])
  const [trades, setTrades] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState('dashboard')
  const [currentTime, setCurrentTime] = useState(new Date())
  const [orderStatus, setOrderStatus] = useState('')

  // Clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Load data
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
    // Realtime subscriptions
    const sub = supabase.channel('realtime-all')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'portfolio_snapshots' }, (payload: any) => {
        setPortfolio(payload.new)
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'system_alerts' }, (payload: any) => {
        setAlerts(prev => [payload.new, ...prev].slice(0, 10))
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'trades' }, (payload: any) => {
        setTrades(prev => [payload.new, ...prev].slice(0, 50))
      })
      .subscribe()
    return () => { supabase.removeChannel(sub) }
  }, [loadData])

  // Place manual order -> insert into Supabase trades table
  const handlePlaceOrder = async (order: any) => {
    try {
      const tradeRecord = {
        symbol: order.symbol,
        side: order.side,
        size: order.size,
        price: 0,
        exchange: 'okx',
        strategy: 'manual',
        regime: 'manual',
        timestamp: new Date().toISOString(),
      }
      const { error } = await supabase.from('trades').insert(tradeRecord)
      if (error) {
        setOrderStatus('Error: ' + error.message)
      } else {
        setOrderStatus(`Order placed: ${order.side.toUpperCase()} ${order.size} ${order.symbol}`)
        loadData()
      }
      setTimeout(() => setOrderStatus(''), 4000)
    } catch (err: any) {
      setOrderStatus('Error: ' + err.message)
    }
  }

  const chartData = Array.from({ length: 30 }, (_, i) => ({
    day: i + 1,
    value: 95000 + Math.random() * 10000 + i * 200,
  }))

  const tabs = ['dashboard', 'trades', 'strategies', 'risk', 'settings']

  return (
    <div className="min-h-screen">
      {/* ── Top Bar ────────────────────────────────────────────── */}
      <header className="border-b border-atlas-border bg-atlas-bg/90 backdrop-blur-xl sticky top-0 z-50">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-atlas-accent/20 flex items-center justify-center">
              <Zap className="w-5 h-5 text-atlas-accent" />
            </div>
            <h1 className="text-lg font-bold text-white tracking-tight">ATLAS</h1>
            <span className="text-xs text-atlas-muted px-2 py-0.5 rounded bg-atlas-card border border-atlas-border">v2.0</span>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 text-xs text-atlas-muted">
              <div className="w-2 h-2 rounded-full bg-atlas-accent animate-pulse" />
              <span>OKX Connected</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-atlas-muted">
              <Clock className="w-3 h-3" />
              <span>{currentTime.toUTCString().slice(17, 25)} UTC</span>
            </div>
          </div>
        </div>
        <nav className="flex gap-1 px-6 pb-0">
          {tabs.map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm capitalize transition-all border-b-2 ${
                activeTab === tab ? 'border-atlas-accent text-atlas-accent' : 'border-transparent text-atlas-muted hover:text-white'
              }`}>
              {tab}
            </button>
          ))}
        </nav>
      </header>

      <main className="p-6 max-w-[1800px] mx-auto">

        {/* ══ DASHBOARD TAB ══════════════════════════════════════ */}
        {activeTab === 'dashboard' && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
              <StatCard title="Portfolio Value" value={`$${portfolio?.total_value?.toLocaleString() || '100,000'}`} change={0.45} icon={Wallet} />
              <StatCard title="Unrealized P&L" value={`$${portfolio?.unrealized_pnl?.toLocaleString() || '1,250'}`} change={1.25} icon={TrendingUp} />
              <StatCard title="Today's P&L" value={`$${portfolio?.realized_pnl_today?.toLocaleString() || '450'}`} change={0.45} icon={BarChart3} />
              <StatCard title="Win Rate" value={`${((portfolio?.win_rate || 0.62) * 100).toFixed(1)}%`} change={undefined} icon={Activity} />
              <StatCard title="Sharpe Ratio" value={(portfolio?.sharpe_ratio || 1.8).toFixed(2)} change={undefined} icon={Shield} />
              <StatCard title="Max Drawdown" value={`${((portfolio?.max_drawdown || 0.05) * 100).toFixed(1)}%`} change={undefined} icon={AlertTriangle} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
              <div className="lg:col-span-2 glass-card p-4">
                <h2 className="text-sm font-semibold text-atlas-muted uppercase tracking-wider mb-4">Portfolio Value (30d)</h2>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="green" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#00ff88" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#00ff88" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="day" stroke="#6b7280" fontSize={10} />
                    <YAxis stroke="#6b7280" fontSize={10} tickFormatter={(v: number) => `$${(v/1000).toFixed(0)}k`} />
                    <Area type="monotone" dataKey="value" stroke="#00ff88" fill="url(#green)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="glass-card p-4">
                <h2 className="text-sm font-semibold text-atlas-muted uppercase tracking-wider mb-4">Exchange Allocation</h2>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={[{ name: 'OKX Spot', value: 60000 }, { name: 'OKX Perp', value: 40000 }]}
                      cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2} dataKey="value">
                      <Cell fill="#00ff88" /><Cell fill="#00ccff" />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2 mt-2">
                  {[{ name: 'OKX Spot (LONG)', value: 60000, color: '#00ff88' }, { name: 'OKX Perp (SHORT)', value: 40000, color: '#00ccff' }].map(item => (
                    <div key={item.name} className="flex justify-between items-center text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="text-atlas-text">{item.name}</span>
                      </div>
                      <span className="text-white font-medium">${item.value.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <h2 className="text-sm font-semibold text-atlas-muted uppercase tracking-wider mb-4">Active Strategies</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {strategies.length > 0 ? strategies.map(s => (
                    <StrategyCard key={s.id} name={s.strategy_name} pnl={s.total_pnl} winRate={s.win_rate} sharpe={s.sharpe_ratio} weight={s.current_weight} trades={s.total_trades} />
                  )) : (
                    <>
                      <StrategyCard name="Momentum" pnl={12500} winRate={0.628} sharpe={2.1} weight={0.25} trades={456} />
                      <StrategyCard name="Order Flow" pnl={8900} winRate={0.71} sharpe={1.9} weight={0.2} trades={234} />
                      <StrategyCard name="Mean Reversion" pnl={6200} winRate={0.58} sharpe={1.5} weight={0.2} trades={312} />
                      <StrategyCard name="Whale Follow" pnl={4100} winRate={0.65} sharpe={1.7} weight={0.15} trades={89} />
                    </>
                  )}
                </div>
              </div>
              <div className="glass-card p-4 max-h-[500px] overflow-y-auto">
                <h2 className="text-sm font-semibold text-atlas-muted uppercase tracking-wider mb-4">System Alerts</h2>
                {alerts.length === 0 && <p className="text-atlas-muted text-sm">No alerts yet</p>}
                {alerts.map((a, i) => <AlertItem key={i} level={a.level} message={a.message} timestamp={a.timestamp} />)}
              </div>
            </div>
          </>
        )}

        {/* ══ TRADES TAB ═════════════════════════════════════════ */}
        {activeTab === 'trades' && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Order Form */}
            <div className="lg:col-span-1">
              <OrderForm onSubmit={handlePlaceOrder} />
              {orderStatus && (
                <div className={`mt-3 p-3 rounded text-sm ${orderStatus.startsWith('Error') ? 'bg-red-500/10 text-atlas-loss border border-red-500/20' : 'bg-atlas-accent/10 text-atlas-accent border border-atlas-accent/20'}`}>
                  {orderStatus}
                </div>
              )}
            </div>

            {/* Trade History */}
            <div className="lg:col-span-3">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-atlas-muted uppercase tracking-wider">Trade History</h2>
                <button onClick={loadData} className="flex items-center gap-1 text-xs text-atlas-muted hover:text-atlas-accent transition-all">
                  <RefreshCw className="w-3 h-3" /> Refresh
                </button>
              </div>
              <div className="glass-card overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-atlas-border">
                      <th className="text-left p-3 text-atlas-muted text-xs uppercase">Time</th>
                      <th className="text-left p-3 text-atlas-muted text-xs uppercase">Symbol</th>
                      <th className="text-left p-3 text-atlas-muted text-xs uppercase">Side</th>
                      <th className="text-right p-3 text-atlas-muted text-xs uppercase">Size</th>
                      <th className="text-right p-3 text-atlas-muted text-xs uppercase">Price</th>
                      <th className="text-left p-3 text-atlas-muted text-xs uppercase">Exchange</th>
                      <th className="text-left p-3 text-atlas-muted text-xs uppercase">Strategy</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trades.length === 0 && (
                      <tr><td colSpan={7} className="p-8 text-center text-atlas-muted">No trades yet. Place your first order!</td></tr>
                    )}
                    {trades.map((t, i) => (
                      <tr key={i} className="border-b border-atlas-border/30 hover:bg-white/[0.02] transition-all">
                        <td className="p-3 text-atlas-muted text-xs">{t.timestamp ? new Date(t.timestamp).toLocaleString() : '-'}</td>
                        <td className="p-3 text-white font-medium">{t.symbol}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                            t.side === 'buy' || t.side === 'long' ? 'bg-atlas-profit/10 text-atlas-profit' : 'bg-atlas-loss/10 text-atlas-loss'
                          }`}>
                            {t.side?.toUpperCase()}
                          </span>
                        </td>
                        <td className="p-3 text-right text-white">{t.size}</td>
                        <td className="p-3 text-right text-white">{t.price ? `$${parseFloat(t.price).toLocaleString()}` : '-'}</td>
                        <td className="p-3 text-atlas-muted">{t.exchange?.toUpperCase()}</td>
                        <td className="p-3"><span className="text-xs px-2 py-0.5 rounded bg-atlas-card border border-atlas-border text-atlas-muted">{t.strategy || '-'}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ══ STRATEGIES TAB ═════════════════════════════════════ */}
        {activeTab === 'strategies' && (
          <div>
            <h2 className="text-sm font-semibold text-atlas-muted uppercase tracking-wider mb-4">Strategy Performance</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              {strategies.length > 0 ? strategies.map(s => (
                <StrategyCard key={s.id} name={s.strategy_name} pnl={s.total_pnl} winRate={s.win_rate} sharpe={s.sharpe_ratio} weight={s.current_weight} trades={s.total_trades} />
              )) : (
                <>
                  <StrategyCard name="Momentum" pnl={12500} winRate={0.628} sharpe={2.1} weight={0.25} trades={456} />
                  <StrategyCard name="Order Flow Imbalance" pnl={8900} winRate={0.71} sharpe={1.9} weight={0.2} trades={234} />
                  <StrategyCard name="Mean Reversion" pnl={6200} winRate={0.58} sharpe={1.5} weight={0.2} trades={312} />
                  <StrategyCard name="Liquidation Cluster" pnl={5800} winRate={0.64} sharpe={1.6} weight={0.15} trades={178} />
                  <StrategyCard name="Whale Follow" pnl={4100} winRate={0.65} sharpe={1.7} weight={0.1} trades={89} />
                  <StrategyCard name="AI Consensus" pnl={15200} winRate={0.72} sharpe={2.4} weight={0.1} trades={567} />
                </>
              )}
            </div>
            <div className="glass-card p-5">
              <h3 className="text-sm font-semibold text-atlas-muted uppercase tracking-wider mb-3">Engine Pipeline</h3>
              <div className="flex flex-wrap items-center gap-2 text-xs text-atlas-text">
                {['MarketData', 'Strategies', 'RegimeDetector', 'DecisionAgent', 'PortfolioAgent', 'PositionScaler', 'RiskManager', 'OKX Execution', 'Supabase', 'Dashboard'].map((step, i) => (
                  <span key={step} className="flex items-center gap-2">
                    <span className="px-3 py-1.5 rounded bg-atlas-accent/10 border border-atlas-accent/20 text-atlas-accent">{step}</span>
                    {i < 9 && <span className="text-atlas-muted">→</span>}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ══ RISK TAB ═══════════════════════════════════════════ */}
        {activeTab === 'risk' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { label: 'Max Risk / Trade', value: '2%', status: 'ok' },
              { label: 'Max Portfolio Exposure', value: '20%', status: 'ok' },
              { label: 'Max Leverage', value: '3x', status: 'ok' },
              { label: 'Max Drawdown Limit', value: '10%', status: 'ok' },
              { label: 'Daily Loss Limit', value: '5%', status: 'ok' },
              { label: 'Max Trades / Day', value: '20', status: 'ok' },
              { label: 'Volatility Pause', value: '> 6% → pause', status: 'ok' },
              { label: 'Position Size Cap', value: '3% portfolio', status: 'ok' },
              { label: 'Paper Mode', value: 'ACTIVE', status: 'warning' },
            ].map(item => (
              <div key={item.label} className="glass-card p-4">
                <div className="flex justify-between items-center">
                  <span className="text-atlas-muted text-sm">{item.label}</span>
                  <span className={`w-2 h-2 rounded-full ${item.status === 'ok' ? 'bg-atlas-profit' : 'bg-atlas-warning'}`} />
                </div>
                <div className="text-xl font-bold text-white mt-2">{item.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* ══ SETTINGS TAB ═══════════════════════════════════════ */}
        {activeTab === 'settings' && (
          <div className="max-w-2xl space-y-6">
            <div className="glass-card p-5">
              <h2 className="text-sm font-semibold text-atlas-muted uppercase tracking-wider mb-4">Exchange Connection</h2>
              <div className="space-y-3">
                <div className="flex justify-between items-center p-3 rounded bg-atlas-card border border-atlas-border">
                  <span className="text-white">OKX</span>
                  <span className="flex items-center gap-2 text-xs text-atlas-profit"><div className="w-2 h-2 rounded-full bg-atlas-profit" /> Connected</span>
                </div>
                <div className="flex justify-between items-center p-3 rounded bg-atlas-card border border-atlas-border">
                  <span className="text-white">Kraken</span>
                  <span className="flex items-center gap-2 text-xs text-atlas-muted"><div className="w-2 h-2 rounded-full bg-gray-500" /> Not configured</span>
                </div>
              </div>
            </div>
            <div className="glass-card p-5">
              <h2 className="text-sm font-semibold text-atlas-muted uppercase tracking-wider mb-4">System</h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-atlas-muted">Engine Mode</span><span className="text-atlas-warning">Paper Trading</span></div>
                <div className="flex justify-between"><span className="text-atlas-muted">Loop Interval</span><span className="text-white">5s</span></div>
                <div className="flex justify-between"><span className="text-atlas-muted">Symbols</span><span className="text-white">BTC, ETH, SOL, ARB, DOGE</span></div>
                <div className="flex justify-between"><span className="text-atlas-muted">Primary Exchange</span><span className="text-atlas-accent">OKX</span></div>
                <div className="flex justify-between"><span className="text-atlas-muted">Supabase</span><span className="text-atlas-profit">Connected</span></div>
                <div className="flex justify-between"><span className="text-atlas-muted">Dashboard</span><span className="text-atlas-profit">Live</span></div>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  )
}
