'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Activity, TrendingUp, TrendingDown, Wallet, Shield, Zap, BarChart3, AlertTriangle, Clock } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

const COLORS = ['#00ff88', '#00ccff', '#ff6644', '#ffaa00', '#aa66ff', '#ff44aa']

function StatCard({ title, value, change, icon: Icon, color = 'green' }: any) {
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

function AlertItem({ level, message, timestamp }: any) {
  const colors: any = { info: 'text-blue-400', warning: 'text-atlas-warning', critical: 'text-atlas-loss' }
  const icons: any = { info: Activity, warning: AlertTriangle, critical: AlertTriangle }
  const AlertIcon = icons[level] || Activity
  return (
    <div className="flex items-start gap-3 p-3 border-b border-atlas-border/50 last:border-0">
      <AlertIcon className={`w-4 h-4 mt-0.5 ${colors[level]}`} />
      <div className="flex-1">
        <p className="text-sm text-atlas-text">{message}</p>
        <p className="text-xs text-atlas-muted mt-1">{new Date(timestamp).toLocaleString()}</p>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [portfolio, setPortfolio] = useState<any>(null)
  const [strategies, setStrategies] = useState<any[]>([])
  const [alerts, setAlerts] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState('dashboard')
  const [currentTime, setCurrentTime] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    async function load() {
      const { data: p } = await supabase.from('portfolio_snapshots').select('*').order('timestamp', { ascending: false }).limit(1)
      if (p && p.length) setPortfolio(p[0])
      
      const { data: s } = await supabase.from('strategy_performance').select('*').order('total_pnl', { ascending: false })
      if (s) setStrategies(s)
      
      const { data: a } = await supabase.from('system_alerts').select('*').order('timestamp', { ascending: false }).limit(10)
      if (a) setAlerts(a)
    }
    load()

    const sub = supabase.channel('realtime').on('postgres_changes', { event: '*', schema: 'public', table: 'portfolio_snapshots' }, (payload: any) => {
      setPortfolio(payload.new)
    }).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'system_alerts' }, (payload: any) => {
      setAlerts(prev => [payload.new, ...prev].slice(0, 10))
    }).subscribe()

    return () => { supabase.removeChannel(sub) }
  }, [])

  const chartData = Array.from({ length: 30 }, (_, i) => ({
    day: i + 1,
    value: 95000 + Math.random() * 10000 + i * 200,
    pnl: (Math.random() - 0.3) * 2000
  }))

  const tabs = ['dashboard', 'trades', 'strategies', 'risk', 'settings']

  return (
    <div className="min-h-screen">
      {/* Top Bar */}
      <header className="border-b border-atlas-border bg-atlas-bg/90 backdrop-blur-xl sticky top-0 z-50">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-atlas-accent/20 flex items-center justify-center">
              <Zap className="w-5 h-5 text-atlas-accent" />
            </div>
            <h1 className="text-lg font-bold text-white tracking-tight">ATLAS</h1>
            <span className="text-xs text-atlas-muted px-2 py-0.5 rounded bg-atlas-card border border-atlas-border">v1.0.0</span>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 text-xs text-atlas-muted">
              <div className="w-2 h-2 rounded-full bg-atlas-accent animate-pulse-green" />
              <span>Engine Active</span>
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

      {/* Main Content */}
      <main className="p-6 max-w-[1800px] mx-auto">
        {/* Portfolio Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
          <StatCard title="Portfolio Value" value={`$${portfolio?.total_value?.toLocaleString() || '100,000'}`} change={portfolio?.daily_return ? (portfolio.daily_return * 100).toFixed(2) : 0.45} icon={Wallet} />
          <StatCard title="Unrealized P&L" value={`$${portfolio?.unrealized_pnl?.toLocaleString() || '1,250'}`} change={1.25} icon={TrendingUp} />
          <StatCard title="Today's P&L" value={`$${portfolio?.realized_pnl_today?.toLocaleString() || '450'}`} change={0.45} icon={BarChart3} />
          <StatCard title="Win Rate" value={`${((portfolio?.win_rate || 0.62) * 100).toFixed(1)}%`} change={undefined} icon={Activity} />
          <StatCard title="Sharpe Ratio" value={(portfolio?.sharpe_ratio || 1.8).toFixed(2)} change={undefined} icon={Shield} />
          <StatCard title="Max Drawdown" value={`${((portfolio?.max_drawdown || 0.05) * 100).toFixed(1)}%`} change={undefined} icon={AlertTriangle} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Portfolio Chart */}
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

          {/* Exchange Balances */}
          <div className="glass-card p-4">
            <h2 className="text-sm font-semibold text-atlas-muted uppercase tracking-wider mb-4">Exchange Allocation</h2>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={Object.entries(portfolio?.exchange_balances || { hyperliquid: 45000, kraken: 35000, pkx: 20000 }).map(([name, value]) => ({ name, value }))}
                  cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2} dataKey="value">
                  {Object.entries(portfolio?.exchange_balances || {}).map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2 mt-2">
              {Object.entries(portfolio?.exchange_balances || { hyperliquid: 45000, kraken: 35000, pkx: 20000 }).map(([name, value]: any, i) => (
                <div key={name} className="flex justify-between items-center text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i] }} />
                    <span className="capitalize text-atlas-text">{name}</span>
                  </div>
                  <span className="text-white font-medium">${value.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Strategies & Alerts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <h2 className="text-sm font-semibold text-atlas-muted uppercase tracking-wider mb-4">Active Strategies</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {strategies.map(s => (
                <StrategyCard key={s.id} name={s.strategy_name} pnl={s.total_pnl} winRate={s.win_rate}
                  sharpe={s.sharpe_ratio} weight={s.current_weight} trades={s.total_trades} />
              ))}
            </div>
          </div>

          <div className="glass-card p-4 max-h-[500px] overflow-y-auto">
            <h2 className="text-sm font-semibold text-atlas-muted uppercase tracking-wider mb-4">System Alerts</h2>
            {alerts.length === 0 && <p className="text-atlas-muted text-sm">No alerts</p>}
            {alerts.map((a, i) => (
              <AlertItem key={i} level={a.level} message={a.message} timestamp={a.timestamp} />
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
