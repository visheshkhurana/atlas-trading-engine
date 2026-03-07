'use client'
import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@supabase/supabase-js'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from 'recharts'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL||'', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||'')

/* ═══════════════════════════════════════════════════════════════
   Analytics — PnL dashboard with equity curve, drawdown, calendar
   ═══════════════════════════════════════════════════════════════ */

export default function Analytics() {
  const [trades, setTrades] = useState<any[]>([])
  const [snapshots, setSnapshots] = useState<any[]>([])

  useEffect(() => {
    const load = async () => {
      const [tR, sR] = await Promise.all([
        supabase.from('trades').select('*').order('timestamp', { ascending: true }).limit(500),
        supabase.from('portfolio_snapshots').select('*').order('timestamp', { ascending: true }).limit(365),
      ])
      if (tR.data) setTrades(tR.data)
      if (sR.data) setSnapshots(sR.data)
    }
    load()
  }, [])

  const equityCurve = useMemo(() => {
    if (snapshots.length > 1) return snapshots.map((s, i) => ({ d: i + 1, v: s.total_value, label: new Date(s.timestamp).toLocaleDateString() }))
    let eq = 100000
    return Array.from({ length: 60 }, (_, i) => { eq += (Math.random() - 0.45) * 500; return { d: i + 1, v: Math.max(eq, 80000) } })
  }, [snapshots])

  const drawdownData = useMemo(() => {
    let peak = 0
    return equityCurve.map(p => {
      if (p.v > peak) peak = p.v
      const dd = peak > 0 ? ((p.v - peak) / peak) * 100 : 0
      return { d: p.d, dd }
    })
  }, [equityCurve])

  const dailyPnl = useMemo(() => {
    const byDay: Record<string, number> = {}
    trades.forEach(t => {
      if (!t.pnl) return
      const day = new Date(t.timestamp).toLocaleDateString()
      byDay[day] = (byDay[day] || 0) + t.pnl
    })
    if (Object.keys(byDay).length === 0) {
      return Array.from({ length: 30 }, (_, i) => ({ d: 'D' + (i + 1), pnl: (Math.random() - 0.4) * 200 }))
    }
    return Object.entries(byDay).map(([d, pnl]) => ({ d, pnl }))
  }, [trades])

  const calendarData = useMemo(() => {
    const map: Record<string, number> = {}
    trades.forEach(t => {
      if (!t.pnl) return
      const d = new Date(t.timestamp).toISOString().slice(0, 10)
      map[d] = (map[d] || 0) + t.pnl
    })
    const now = new Date()
    const days: { date: string; pnl: number; month: number; dow: number }[] = []
    for (let i = 89; i >= 0; i--) {
      const dt = new Date(now); dt.setDate(dt.getDate() - i)
      const key = dt.toISOString().slice(0, 10)
      days.push({ date: key, pnl: map[key] || 0, month: dt.getMonth(), dow: dt.getDay() })
    }
    return days
  }, [trades])

  const stats = useMemo(() => {
    const total = trades.reduce((s, t) => s + (t.pnl || 0), 0)
    const wins = trades.filter(t => (t.pnl || 0) > 0)
    const losses = trades.filter(t => (t.pnl || 0) < 0)
    const avgWin = wins.length ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0
    const avgLoss = losses.length ? Math.abs(losses.reduce((s, t) => s + t.pnl, 0) / losses.length) : 1
    const best = trades.reduce((m, t) => Math.max(m, t.pnl || 0), 0)
    const worst = trades.reduce((m, t) => Math.min(m, t.pnl || 0), 0)
    return { total, winRate: trades.length ? (wins.length / trades.length * 100).toFixed(1) : '—', profitFactor: avgLoss > 0 ? (avgWin / avgLoss).toFixed(2) : '—', avgWin: avgWin.toFixed(2), avgLoss: avgLoss.toFixed(2), best: best.toFixed(2), worst: worst.toFixed(2), totalTrades: trades.length }
  }, [trades])

  const TipPnl = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null
    const v = payload[0].value
    return <div className="okx-card px-3 py-2 text-xs" style={{ border: '1px solid var(--border)' }}><span className={v >= 0 ? 'green-text' : 'red-text'}>{v >= 0 ? '+' : ''}${v.toFixed(2)}</span></div>
  }

  return (
    <div className="p-5 space-y-4">
      {/* KPI Row */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { l: 'Total PnL', v: (stats.total >= 0 ? '+' : '') + '$' + stats.total.toFixed(2), c: stats.total >= 0 ? 'green-text' : 'red-text' },
          { l: 'Win Rate', v: stats.winRate + '%', c: '' },
          { l: 'Profit Factor', v: stats.profitFactor, c: '' },
          { l: 'Total Trades', v: String(stats.totalTrades), c: '' },
        ].map(s => (
          <div key={s.l} className="okx-card p-4">
            <div className="text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>{s.l}</div>
            <div className={`text-xl font-semibold ${s.c}`}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* Equity Curve */}
      <div className="okx-card p-4">
        <div className="text-sm font-medium mb-3">Equity Curve</div>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={equityCurve}>
            <defs><linearGradient id="eq" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#00b853" stopOpacity={0.15}/><stop offset="100%" stopColor="#00b853" stopOpacity={0}/></linearGradient></defs>
            <XAxis dataKey="d" stroke="#333" fontSize={10} tickLine={false} axisLine={false}/>
            <YAxis stroke="#333" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v:number)=>`${(v/1000).toFixed(0)}k`} width={40}/>
            <Tooltip content={<TipPnl />}/>
            <Area type="monotone" dataKey="v" stroke="#00b853" fill="url(#eq)" strokeWidth={1.5} dot={false}/>
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Drawdown */}
        <div className="okx-card p-4">
          <div className="text-sm font-medium mb-3">Drawdown %</div>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={drawdownData}>
              <XAxis dataKey="d" stroke="#333" fontSize={10} tickLine={false} axisLine={false}/>
              <YAxis stroke="#333" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v:number)=>v.toFixed(1)+'%'} width={45}/>
              <Area type="monotone" dataKey="dd" stroke="#ff4d4f" fill="rgba(255,77,79,0.1)" strokeWidth={1} dot={false}/>
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Daily PnL Bars */}
        <div className="okx-card p-4">
          <div className="text-sm font-medium mb-3">Daily PnL</div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={dailyPnl}>
              <XAxis dataKey="d" stroke="#333" fontSize={9} tickLine={false} axisLine={false}/>
              <YAxis stroke="#333" fontSize={10} tickLine={false} axisLine={false} width={40}/>
              <Tooltip content={<TipPnl />}/>
              <Bar dataKey="pnl" radius={[2, 2, 0, 0]}>
                {dailyPnl.map((e, i) => <Cell key={i} fill={e.pnl >= 0 ? '#00b853' : '#ff4d4f'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Calendar Heatmap */}
      <div className="okx-card p-4">
        <div className="text-sm font-medium mb-3">90-Day PnL Calendar</div>
        <div className="flex flex-wrap gap-1">
          {calendarData.map((d, i) => (
            <div key={i} className="w-3 h-3 rounded-sm" title={`${d.date}: ${d.pnl >= 0 ? '+' : ''}$${d.pnl.toFixed(2)}`}
              style={{ background: d.pnl > 0 ? `rgba(0,184,83,${Math.min(Math.abs(d.pnl) / 500, 1) * 0.8 + 0.2})` : d.pnl < 0 ? `rgba(255,77,79,${Math.min(Math.abs(d.pnl) / 500, 1) * 0.8 + 0.2})` : 'var(--bg-tertiary)' }} />
          ))}
        </div>
        <div className="flex items-center gap-2 mt-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
          <span>Loss</span>
          <div className="flex gap-0.5">{[0.2, 0.4, 0.6, 0.8, 1].map((o, i) => <div key={i} className="w-3 h-3 rounded-sm" style={{ background: `rgba(255,77,79,${o})` }}/>)}</div>
          <span className="mx-1">|</span>
          <div className="flex gap-0.5">{[0.2, 0.4, 0.6, 0.8, 1].map((o, i) => <div key={i} className="w-3 h-3 rounded-sm" style={{ background: `rgba(0,184,83,${o})` }}/>)}</div>
          <span>Profit</span>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { l: 'Avg Win', v: '+$' + stats.avgWin, c: 'green-text' },
          { l: 'Avg Loss', v: '-$' + stats.avgLoss, c: 'red-text' },
          { l: 'Best Trade', v: '+$' + stats.best, c: 'green-text' },
          { l: 'Worst Trade', v: '-$' + stats.worst.replace('-', ''), c: 'red-text' },
        ].map(s => (
          <div key={s.l} className="okx-card p-4">
            <div className="text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>{s.l}</div>
            <div className={`text-lg font-semibold ${s.c}`}>{s.v}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
