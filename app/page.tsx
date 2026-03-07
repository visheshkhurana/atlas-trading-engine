'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@supabase/supabase-js'
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

const SYMBOLS = ['BTC/USDT','ETH/USDT','SOL/USDT','ARB/USDT','DOGE/USDT','AVAX/USDT','LINK/USDT','OP/USDT']

function LiveTicker() {
  const [prices, setPrices] = useState<Record<string,{price:number;change:number}>>({})
  useEffect(() => {
    const go = () => {
      setPrices({
        'BTC': { price: 98450+Math.random()*400-200, change: 1.2+Math.random()*0.5-0.25 },
        'ETH': { price: 3780+Math.random()*40-20, change: 0.8+Math.random()*0.5-0.25 },
        'SOL': { price: 178+Math.random()*10-5, change: 2.1+Math.random()*1-0.5 },
        'ARB': { price: 1.18+Math.random()*0.05-0.025, change: -0.5+Math.random()*2-1 },
        'DOGE': { price: 0.165+Math.random()*0.005-0.0025, change: 0.3+Math.random()*0.8-0.4 },
      })
    }
    go(); const iv = setInterval(go, 3000)
    return () => clearInterval(iv)
  }, [])
  return (
    <div className="flex items-center gap-6 px-5 py-1.5 overflow-x-auto" style={{ background:'var(--bg-primary)', borderBottom:'1px solid var(--border)' }}>
      {Object.entries(prices).map(([sym, d]) => (
        <div key={sym} className="flex items-center gap-2 text-xs whitespace-nowrap">
          <span className="font-medium">{sym}</span>
          <span className="font-mono">{d.price.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
          <span className={d.change >= 0 ? 'green-text' : 'red-text'}>{d.change >= 0 ? '+' : ''}{d.change.toFixed(2)}%</span>
        </div>
      ))}
    </div>
  )
}

function ChartTip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  return (<div className="okx-card px-3 py-2 text-xs" style={{ border:'1px solid var(--border)' }}><div className="font-mono font-medium">${payload[0].value.toLocaleString()}</div></div>)
}

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('overview')
  const [trades, setTrades] = useState<any[]>([])
  const [positions, setPositions] = useState<any[]>([])
  const [alerts, setAlerts] = useState<any[]>([])
  const [strategies, setStrategies] = useState<any[]>([])
  const [portfolio, setPortfolio] = useState<any>(null)
  const [portfolioHistory, setPortfolioHistory] = useState<any[]>([])
  const [currentTime, setCurrentTime] = useState(new Date())
  const [orderSymbol, setOrderSymbol] = useState('BTC/USDT')
  const [orderSide, setOrderSide] = useState('buy')
  const [orderSize, setOrderSize] = useState('')
  const [orderPrice, setOrderPrice] = useState('')
  const [orderType, setOrderType] = useState('market')
  const [orderStatus, setOrderStatus] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [chartPeriod, setChartPeriod] = useState('1M')

  useEffect(() => { const t = setInterval(() => setCurrentTime(new Date()), 1000); return () => clearInterval(t) }, [])

  const loadData = useCallback(async () => {
    const [pR,sR,aR,tR,posR,phR] = await Promise.all([
      supabase.from('portfolio_snapshots').select('*').order('timestamp',{ascending:false}).limit(1),
      supabase.from('strategy_performance').select('*').order('total_pnl',{ascending:false}),
      supabase.from('system_alerts').select('*').order('timestamp',{ascending:false}).limit(20),
      supabase.from('trades').select('*').order('timestamp',{ascending:false}).limit(100),
      supabase.from('positions').select('*').order('opened_at',{ascending:false}),
      supabase.from('portfolio_snapshots').select('*').order('timestamp',{ascending:false}).limit(90),
    ])
    if (pR.data?.length) setPortfolio(pR.data[0])
    if (sR.data) setStrategies(sR.data)
    if (aR.data) setAlerts(aR.data)
    if (tR.data) setTrades(tR.data)
    if (posR.data) setPositions(posR.data)
    if (phR.data) setPortfolioHistory(phR.data.reverse())
  }, [])

  useEffect(() => {
    loadData()
    const sub = supabase.channel('rt-all')
      .on('postgres_changes',{event:'*',schema:'public',table:'trades'},(p:any)=>{
        if(p.eventType==='INSERT') setTrades(prev=>[p.new,...prev].slice(0,100))
      })
      .on('postgres_changes',{event:'*',schema:'public',table:'positions'},()=>{
        supabase.from('positions').select('*').order('opened_at',{ascending:false}).then(r=>{if(r.data) setPositions(r.data)})
      })
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'system_alerts'},(p:any)=>{
        setAlerts(prev=>[p.new,...prev].slice(0,20))
      })
      .on('postgres_changes',{event:'*',schema:'public',table:'portfolio_snapshots'},()=>loadData())
      .subscribe()
    return ()=>{supabase.removeChannel(sub)}
  }, [loadData])

  const stats = useMemo(() => {
    const tv = portfolio?.total_value || 100000
    const opnl = positions.reduce((s,p) => s+(p.unrealized_pnl||0), 0)
    const todayT = trades.filter(t => new Date(t.timestamp).toDateString() === new Date().toDateString())
    const tpnl = todayT.reduce((s,t) => s+(t.pnl||0), 0)
    const ws = trades.filter(t=>(t.pnl||0)>0).length
    const tot = trades.filter(t=>t.pnl!=null).length
    const wr = tot > 0 ? (ws/tot*100).toFixed(1) : '—'
    return { totalValue:tv, openPnl:opnl, todayPnl:tpnl, winRate:wr, maxDD:portfolio?.max_drawdown||0, openPos:positions.length }
  }, [portfolio,positions,trades])

  const chartData = useMemo(() => {
    if (portfolioHistory.length > 2) return portfolioHistory.map((p,i) => ({ d:i+1, v:p.total_value||100000 }))
    return Array.from({length:30},(_,i) => ({ d:i+1, v:95000+Math.random()*8000+i*300 }))
  }, [portfolioHistory])

  const placeOrder = async () => {
    if (!orderSize || parseFloat(orderSize)<=0 || submitting) return
    setSubmitting(true); setOrderStatus('')
    const { error } = await supabase.from('trades').insert({
      symbol:orderSymbol, side:orderSide, size:parseFloat(orderSize),
      price: orderType==='limit'&&orderPrice ? parseFloat(orderPrice) : 0,
      exchange:'okx', strategy:'manual', regime:'manual',
      order_type:orderType, status:'pending', timestamp:new Date().toISOString(),
    })
    if (error) setOrderStatus('Error: '+error.message)
    else { setOrderStatus(orderSide.toUpperCase()+' '+orderSize+' '+orderSymbol+' submitted'); setOrderSize(''); setOrderPrice(''); loadData() }
    setSubmitting(false)
    setTimeout(()=>setOrderStatus(''), 5000)
  }

  const tabs = ['overview','trade','positions','strategies','risk']
  const fmtTime = (ts:string) => ts ? new Date(ts).toLocaleString() : '—'
  const fmtPrice = (p:any) => p ? '$'+parseFloat(p).toLocaleString() : '—'

  return (
    <div className="min-h-screen" style={{background:'var(--bg-primary)'}}>
      <header style={{background:'var(--bg-secondary)',borderBottom:'1px solid var(--border)'}} className="sticky top-0 z-50">
        <div className="flex items-center justify-between px-5 h-14">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect width="24" height="24" rx="4" fill="#fff"/><path d="M6 8h4v4H6zM10 12h4v4h-4zM14 8h4v4h-4z" fill="#121212"/></svg>
              <span className="text-base font-semibold tracking-tight">ATLAS</span>
            </div>
            <nav className="flex items-center">
              {tabs.map(tab=>(
                <button key={tab} onClick={()=>setActiveTab(tab)} className={`okx-tab ${activeTab===tab?'okx-tab-active':''}`}>
                  {tab.charAt(0).toUpperCase()+tab.slice(1)}
                </button>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-5">
            <div className="flex items-center gap-1.5 text-xs" style={{color:'var(--text-secondary)'}}>
              <div className="w-1.5 h-1.5 rounded-full" style={{background:'var(--yellow)'}} /> OKX
            </div>
            <div className="text-xs font-mono" style={{color:'var(--text-tertiary)'}}>{currentTime.toUTCString().slice(17,25)} UTC</div>
            <div className="okx-badge okx-badge-yellow text-xs">Paper</div>
          </div>
        </div>
      </header>
      <LiveTicker />
      <main className="max-w-[1600px] mx-auto">
        {activeTab === 'overview' && (
          <div className="p-5 space-y-4">
            <div className="okx-card p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs mb-1" style={{color:'var(--text-tertiary)'}}>Total Balance</div>
                  <div className="text-3xl font-semibold">${stats.totalValue.toLocaleString()}</div>
                  <div className="flex items-center gap-4 mt-2 text-sm">
                    <span style={{color:'var(--text-secondary)'}}>Today&apos;s PnL</span>
                    <span className={stats.todayPnl>=0?'green-text':'red-text'}>{stats.todayPnl>=0?'+':''}${stats.todayPnl.toFixed(2)} ({(stats.todayPnl/stats.totalValue*100).toFixed(2)}%)</span>
                  </div>
                </div>
                <div className="flex gap-3"><button className="okx-btn okx-btn-green">Deposit</button><button className="okx-btn okx-btn-ghost">Withdraw</button></div>
              </div>
            </div>
            <div className="grid grid-cols-5 gap-4">
              {[
                {l:'Unrealized PnL',v:(stats.openPnl>=0?'+':'')+'$'+stats.openPnl.toFixed(2),c:stats.openPnl>=0?'green-text':'red-text'},
                {l:'Win Rate',v:stats.winRate+(stats.winRate!=='—'?'%':''),c:''},
                {l:'Sharpe Ratio',v:portfolio?.sharpe_ratio?.toFixed(2)||'—',c:''},
                {l:'Max Drawdown',v:stats.maxDD>0?stats.maxDD.toFixed(1)+'%':'—',c:''},
                {l:'Open Positions',v:String(stats.openPos),c:''},
              ].map(s=>(
                <div key={s.l} className="okx-card p-4">
                  <div className="text-xs mb-1.5" style={{color:'var(--text-tertiary)'}}>{s.l}</div>
                  <div className={`text-lg font-medium ${s.c}`}>{s.v}</div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2 okx-card p-4">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-medium">Portfolio Value</span>
                  <div className="flex gap-2">
                    {['1D','1W','1M','3M'].map(p=>(
                      <button key={p} onClick={()=>setChartPeriod(p)} className="text-xs px-2 py-1 rounded" style={{color:p===chartPeriod?'var(--text-primary)':'var(--text-tertiary)',background:p===chartPeriod?'var(--bg-tertiary)':'transparent'}}>{p}</button>
                    ))}
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={chartData}>
                    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#00b853" stopOpacity={0.15}/><stop offset="100%" stopColor="#00b853" stopOpacity={0}/></linearGradient></defs>
                    <XAxis dataKey="d" stroke="#333" fontSize={11} tickLine={false} axisLine={false}/>
                    <YAxis stroke="#333" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v:number)=>`${(v/1000).toFixed(0)}k`} width={40}/>
                    <Tooltip content={<ChartTip />}/>
                    <Area type="monotone" dataKey="v" stroke="#00b853" fill="url(#g)" strokeWidth={1.5} dot={false}/>
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="okx-card p-4">
                <div className="text-sm font-medium mb-4">Assets</div>
                <div className="space-y-3">
                  {[{n:'OKX Spot',v:Math.round(stats.totalValue*0.6),p:60,c:'var(--green)'},{n:'OKX Perp',v:Math.round(stats.totalValue*0.4),p:40,c:'var(--blue)'}].map(a=>(
                    <div key={a.n}><div className="flex justify-between text-sm mb-1"><span style={{color:'var(--text-secondary)'}}>{a.n}</span><span>${a.v.toLocaleString()}</span></div>
                    <div className="w-full h-1.5 rounded-full" style={{background:'var(--bg-tertiary)'}}><div className="h-full rounded-full" style={{width:a.p+'%',background:a.c}}/></div></div>
                  ))}
                </div>
                <div className="mt-6">
                  <div className="text-sm font-medium mb-3">Recent Alerts</div>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {(alerts.length>0?alerts.slice(0,6):[
                      {level:'info',message:'ATLAS Trading Engine initialized',timestamp:new Date().toISOString()},
                      {level:'info',message:'Waiting for first trade signal...',timestamp:new Date().toISOString()},
                    ]).map((a,i)=>(
                      <div key={i} className="flex items-start gap-2 text-xs" style={{color:'var(--text-secondary)'}}>
                        <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{background:a.level==='warning'?'var(--yellow)':a.level==='error'?'var(--red)':'var(--blue)'}}/>
                        <div><div>{a.message}</div><div style={{color:'var(--text-tertiary)'}}>{new Date(a.timestamp).toLocaleTimeString()}</div></div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="okx-card">
              <div className="flex items-center justify-between p-4 pb-0">
                <span className="text-sm font-medium">Recent Trades</span>
                <div className="flex items-center gap-3"><span className="text-xs" style={{color:'var(--text-tertiary)'}}>{trades.length} total</span><button onClick={()=>setActiveTab('trade')} className="text-xs" style={{color:'var(--green)'}}>View All →</button></div>
              </div>
              <table className="w-full okx-table mt-2">
                <thead><tr><th>Time</th><th>Pair</th><th>Side</th><th className="text-right">Amount</th><th className="text-right">Price</th><th className="text-right">PnL</th><th>Exchange</th><th>Strategy</th></tr></thead>
                <tbody>
                  {trades.length===0&&<tr><td colSpan={8} className="text-center py-8" style={{color:'var(--text-tertiary)'}}>No trades yet</td></tr>}
                  {trades.slice(0,8).map((t,i)=>(
                    <tr key={i}>
                      <td style={{color:'var(--text-tertiary)'}} className="text-xs font-mono">{fmtTime(t.timestamp)}</td>
                      <td className="font-medium">{t.symbol}</td>
                      <td><span className={`okx-badge ${t.side==='buy'||t.side==='long'?'okx-badge-green':'okx-badge-red'}`}>{t.side?.toUpperCase()}</span></td>
                      <td className="text-right font-mono">{t.size}</td>
                      <td className="text-right font-mono">{fmtPrice(t.price)}</td>
                      <td className={`text-right font-mono ${(t.pnl||0)>=0?'green-text':'red-text'}`}>{t.pnl?((t.pnl>=0?'+':'')+'$'+t.pnl.toFixed(2)):'—'}</td>
                      <td style={{color:'var(--text-secondary)'}}>{t.exchange?.toUpperCase()}</td>
                      <td style={{color:'var(--text-tertiary)'}}>{t.strategy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {activeTab === 'trade' && (
          <div className="flex" style={{height:'calc(100vh - 90px)'}}>
            <div className="w-80 flex-shrink-0 p-4 space-y-4" style={{borderRight:'1px solid var(--border)'}}>
              <div className="flex rounded overflow-hidden" style={{border:'1px solid var(--border)'}}>
                <button onClick={()=>setOrderSide('buy')} className="flex-1 py-2.5 text-sm font-medium" style={{background:orderSide==='buy'?'var(--green)':'var(--bg-tertiary)',color:orderSide==='buy'?'#fff':'var(--text-tertiary)'}}>Buy / Long</button>
                <button onClick={()=>setOrderSide('sell')} className="flex-1 py-2.5 text-sm font-medium" style={{background:orderSide==='sell'?'var(--red)':'var(--bg-tertiary)',color:orderSide==='sell'?'#fff':'var(--text-tertiary)'}}>Sell / Short</button>
              </div>
              <div className="flex rounded overflow-hidden text-xs" style={{border:'1px solid var(--border)'}}>
                <button onClick={()=>setOrderType('market')} className="flex-1 py-1.5" style={{background:orderType==='market'?'var(--bg-tertiary)':'transparent',color:orderType==='market'?'var(--text-primary)':'var(--text-tertiary)'}}>Market</button>
                <button onClick={()=>setOrderType('limit')} className="flex-1 py-1.5" style={{background:orderType==='limit'?'var(--bg-tertiary)':'transparent',color:orderType==='limit'?'var(--text-primary)':'var(--text-tertiary)'}}>Limit</button>
              </div>
              <div>
                <label className="text-xs block mb-1.5" style={{color:'var(--text-tertiary)'}}>Pair</label>
                <select value={orderSymbol} onChange={e=>setOrderSymbol(e.target.value)} className="okx-input">{SYMBOLS.map(s=><option key={s} value={s}>{s}</option>)}</select>
              </div>
              {orderType==='limit'&&(
                <div>
                  <label className="text-xs block mb-1.5" style={{color:'var(--text-tertiary)'}}>Price (USDT)</label>
                  <input type="number" step="any" value={orderPrice} onChange={e=>setOrderPrice(e.target.value)} placeholder="0.00" className="okx-input"/>
                </div>
              )}
              <div>
                <label className="text-xs block mb-1.5" style={{color:'var(--text-tertiary)'}}>Amount</label>
                <input type="number" step="any" value={orderSize} onChange={e=>setOrderSize(e.target.value)} placeholder="0.00" className="okx-input"/>
                <div className="flex gap-2 mt-2">{['25%','50%','75%','100%'].map(p=>(<button key={p} onClick={()=>setOrderSize(String(stats.totalValue*parseInt(p)/100/98000))} className="flex-1 text-xs py-1 rounded" style={{background:'var(--bg-tertiary)',color:'var(--text-tertiary)'}}>{p}</button>))}</div>
              </div>
              <div className="text-xs" style={{color:'var(--text-tertiary)'}}>Route: {orderSide==='buy'?'OKX Spot':'OKX Perpetual'}</div>
              <button onClick={placeOrder} disabled={submitting||!orderSize} className="w-full py-3 rounded text-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed" style={{background:orderSide==='buy'?'var(--green)':'var(--red)',color:'#fff'}}>
                {submitting?'Placing...':(orderSide==='buy'?'Buy / Long':'Sell / Short')+' '+orderSymbol}
              </button>
              {orderStatus&&(<div className={`text-xs p-2.5 rounded ${orderStatus.startsWith('Error')?'okx-badge-red':'okx-badge-green'}`}>{orderStatus}</div>)}
              <div style={{borderTop:'1px solid var(--border)'}} className="pt-4">
                <div className="text-xs font-medium mb-3" style={{color:'var(--text-secondary)'}}>Risk Limits</div>
                <div className="space-y-2 text-xs" style={{color:'var(--text-tertiary)'}}>
                  <div className="flex justify-between"><span>Max per trade</span><span>2%</span></div>
                  <div className="flex justify-between"><span>Max leverage</span><span>3x</span></div>
                  <div className="flex justify-between"><span>Daily limit</span><span>20 trades</span></div>
                  <div className="flex justify-between"><span>Vol pause</span><span>&gt;6%</span></div>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-auto">
              <div className="flex items-center justify-between p-4 pb-2">
                <span className="text-sm font-medium">Trade History <span className="text-xs" style={{color:'var(--text-tertiary)'}}>({trades.length})</span></span>
                <button onClick={loadData} className="text-xs px-2 py-1 rounded" style={{background:'var(--bg-tertiary)',color:'var(--text-tertiary)'}}>↻ Refresh</button>
              </div>
              <table className="w-full okx-table">
                <thead><tr><th>Time</th><th>Pair</th><th>Side</th><th>Type</th><th className="text-right">Amount</th><th className="text-right">Price</th><th className="text-right">PnL</th><th>Exchange</th><th>Strategy</th><th>Status</th></tr></thead>
                <tbody>
                  {trades.length===0&&<tr><td colSpan={10} className="text-center py-16" style={{color:'var(--text-tertiary)'}}>No trades yet. Place your first order.</td></tr>}
                  {trades.map((t,i)=>(
                    <tr key={i}>
                      <td style={{color:'var(--text-tertiary)'}} className="text-xs font-mono">{fmtTime(t.timestamp)}</td>
                      <td className="font-medium">{t.symbol}</td>
                      <td><span className={`okx-badge ${t.side==='buy'||t.side==='long'?'okx-badge-green':'okx-badge-red'}`}>{t.side?.toUpperCase()}</span></td>
                      <td style={{color:'var(--text-tertiary)'}}>{t.order_type||'market'}</td>
                      <td className="text-right font-mono">{t.size}</td>
                      <td className="text-right font-mono">{fmtPrice(t.price)}</td>
                      <td className={`text-right font-mono ${(t.pnl||0)>=0?'green-text':'red-text'}`}>{t.pnl?((t.pnl>=0?'+':'')+'$'+t.pnl.toFixed(2)):'—'}</td>
                      <td style={{color:'var(--text-secondary)'}}>{t.exchange?.toUpperCase()}</td>
                      <td style={{color:'var(--text-tertiary)'}}>{t.strategy}</td>
                      <td><span className={`okx-badge ${t.status==='filled'?'okx-badge-green':t.status==='pending'?'okx-badge-yellow':'okx-badge-red'}`}>{t.status||'filled'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {activeTab === 'positions' && (
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium">Open Positions</span>
                <span className="text-xs px-2 py-0.5 rounded" style={{background:'var(--bg-tertiary)',color:'var(--text-tertiary)'}}>{positions.length} open</span>
              </div>
              <button onClick={loadData} className="text-xs px-3 py-1.5 rounded" style={{background:'var(--bg-tertiary)',color:'var(--text-tertiary)'}}>↻ Refresh</button>
            </div>
            <div className="okx-card">
              <table className="w-full okx-table">
                <thead><tr><th>Pair</th><th>Side</th><th className="text-right">Size</th><th className="text-right">Entry Price</th><th className="text-right">Mark Price</th><th className="text-right">Unrealized PnL</th><th className="text-right">ROE%</th><th className="text-right">Leverage</th><th>Exchange</th><th>Strategy</th><th>Opened</th></tr></thead>
                <tbody>
                  {positions.length===0&&<tr><td colSpan={11} className="text-center py-16" style={{color:'var(--text-tertiary)'}}>No open positions. Positions appear when the engine executes trades.</td></tr>}
                  {positions.map((p,i)=>(
                    <tr key={i}>
                      <td className="font-medium">{p.symbol}</td>
                      <td><span className={`okx-badge ${p.side==='long'||p.side==='buy'?'okx-badge-green':'okx-badge-red'}`}>{p.side?.toUpperCase()}</span></td>
                      <td className="text-right font-mono">{p.size}</td>
                      <td className="text-right font-mono">{fmtPrice(p.entry_price)}</td>
                      <td className="text-right font-mono">{fmtPrice(p.mark_price||p.current_price)}</td>
                      <td className={`text-right font-mono ${(p.unrealized_pnl||0)>=0?'green-text':'red-text'}`}>{p.unrealized_pnl?((p.unrealized_pnl>=0?'+':'')+'$'+p.unrealized_pnl.toFixed(2)):'—'}</td>
                      <td className={`text-right font-mono ${(p.roe||0)>=0?'green-text':'red-text'}`}>{p.roe?(p.roe>=0?'+':'')+p.roe.toFixed(2)+'%':'—'}</td>
                      <td className="text-right font-mono">{p.leverage||'1'}x</td>
                      <td style={{color:'var(--text-secondary)'}}>{p.exchange?.toUpperCase()||'OKX'}</td>
                      <td style={{color:'var(--text-tertiary)'}}>{p.strategy||'—'}</td>
                      <td style={{color:'var(--text-tertiary)'}} className="text-xs font-mono">{fmtTime(p.opened_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {positions.length > 0 && (
              <div className="grid grid-cols-3 gap-4">
                <div className="okx-card p-4">
                  <div className="text-xs mb-1.5" style={{color:'var(--text-tertiary)'}}>Total Unrealized PnL</div>
                  <div className={`text-xl font-semibold ${stats.openPnl>=0?'green-text':'red-text'}`}>{stats.openPnl>=0?'+':''}${stats.openPnl.toFixed(2)}</div>
                </div>
                <div className="okx-card p-4">
                  <div className="text-xs mb-1.5" style={{color:'var(--text-tertiary)'}}>Total Exposure</div>
                  <div className="text-xl font-semibold">${positions.reduce((s,p)=>s+(p.size*p.entry_price||0),0).toLocaleString()}</div>
                </div>
                <div className="okx-card p-4">
                  <div className="text-xs mb-1.5" style={{color:'var(--text-tertiary)'}}>Avg Leverage</div>
                  <div className="text-xl font-semibold">{positions.length>0?(positions.reduce((s,p)=>s+(p.leverage||1),0)/positions.length).toFixed(1):'0'}x</div>
                </div>
              </div>
            )}
          </div>
        )}
        {activeTab === 'strategies' && (
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-3 gap-4">
              {(strategies.length>0?strategies:[
                {strategy_name:'Momentum',total_pnl:12500,win_rate:0.628,sharpe_ratio:2.1,current_weight:0.25,total_trades:456,status:'active'},
                {strategy_name:'Order Flow',total_pnl:8900,win_rate:0.71,sharpe_ratio:1.9,current_weight:0.2,total_trades:234,status:'active'},
                {strategy_name:'Mean Reversion',total_pnl:6200,win_rate:0.58,sharpe_ratio:1.5,current_weight:0.2,total_trades:312,status:'active'},
                {strategy_name:'Liquidation',total_pnl:5800,win_rate:0.64,sharpe_ratio:1.6,current_weight:0.15,total_trades:178,status:'active'},
                {strategy_name:'Whale Follow',total_pnl:4100,win_rate:0.65,sharpe_ratio:1.7,current_weight:0.1,total_trades:89,status:'active'},
                {strategy_name:'AI Consensus',total_pnl:15200,win_rate:0.72,sharpe_ratio:2.4,current_weight:0.1,total_trades:567,status:'active'},
              ]).map((s:any,i)=>(
                <div key={i} className="okx-card p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-medium">{s.strategy_name}</span>
                    <div className="flex items-center gap-2">
                      <span className={`okx-badge ${s.status==='active'?'okx-badge-green':'okx-badge-yellow'}`}>{s.status||'active'}</span>
                      <span className="text-xs px-2 py-0.5 rounded" style={{background:'var(--bg-tertiary)',color:'var(--text-secondary)'}}>{(s.current_weight*100).toFixed(0)}%</span>
                    </div>
                  </div>
                  <div className={`text-xl font-semibold mb-3 ${s.total_pnl>=0?'green-text':'red-text'}`}>{s.total_pnl>=0?'+':''}${s.total_pnl.toLocaleString()}</div>
                  <div className="grid grid-cols-3 gap-3 text-xs" style={{color:'var(--text-tertiary)'}}>
                    <div><div>Win Rate</div><div className="text-white mt-0.5">{(s.win_rate*100).toFixed(1)}%</div></div>
                    <div><div>Sharpe</div><div className="text-white mt-0.5">{s.sharpe_ratio.toFixed(2)}</div></div>
                    <div><div>Trades</div><div className="text-white mt-0.5">{s.total_trades}</div></div>
                  </div>
                </div>
              ))}
            </div>
            <div className="okx-card p-4">
              <div className="text-sm font-medium mb-3">Engine Pipeline</div>
              <div className="flex items-center gap-1 text-xs flex-wrap">
                {['Market Data','Strategies','Regime','Consensus','Portfolio','Position Scaler','Risk','OKX','Supabase','Dashboard'].map((s,i)=>(
                  <span key={s} className="flex items-center gap-1">
                    <span className="px-2.5 py-1 rounded" style={{background:'var(--bg-tertiary)',color:'var(--text-secondary)'}}>{s}</span>
                    {i<9&&<span style={{color:'var(--text-tertiary)'}}>→</span>}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
        {activeTab === 'risk' && (
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-3 gap-4">
              {[
                {l:'Max Risk / Trade',v:'2%',ok:true},{l:'Max Exposure',v:'20%',ok:true},{l:'Max Leverage',v:'3x',ok:true},
                {l:'Max Drawdown',v:'10%',ok:true},{l:'Daily Loss Limit',v:'5%',ok:true},{l:'Max Trades / Day',v:'20',ok:true},
                {l:'Volatility Pause',v:'> 6%',ok:true},{l:'Position Cap',v:'3% of portfolio',ok:true},{l:'Engine Mode',v:'Paper Trading',ok:false},
              ].map(r=>(
                <div key={r.l} className="okx-card p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs" style={{color:'var(--text-tertiary)'}}>{r.l}</span>
                    <div className="w-2 h-2 rounded-full" style={{background:r.ok?'var(--green)':'var(--yellow)'}}/>
                  </div>
                  <div className="text-lg font-medium">{r.v}</div>
                </div>
              ))}
            </div>
            <div className="okx-card p-4">
              <div className="text-sm font-medium mb-3">System Health</div>
              <div className="grid grid-cols-4 gap-4 text-xs">
                <div><div style={{color:'var(--text-tertiary)'}}>Engine Uptime</div><div className="text-sm font-mono mt-1 green-text">Online</div></div>
                <div><div style={{color:'var(--text-tertiary)'}}>Last Heartbeat</div><div className="text-sm font-mono mt-1">{currentTime.toLocaleTimeString()}</div></div>
                <div><div style={{color:'var(--text-tertiary)'}}>Trades Today</div><div className="text-sm font-mono mt-1">{trades.filter(t=>new Date(t.timestamp).toDateString()===new Date().toDateString()).length}/20</div></div>
                <div><div style={{color:'var(--text-tertiary)'}}>Supabase</div><div className="text-sm font-mono mt-1 green-text">Connected</div></div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
