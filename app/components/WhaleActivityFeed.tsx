'use client';
import { useState, useEffect, useCallback } from 'react';

interface WhaleEvent {
  id: string;
  type: 'large_buy' | 'large_sell' | 'transfer' | 'exchange_inflow' | 'exchange_outflow';
  asset: string;
  amount: number;
  usdValue: number;
  from: string;
  to: string;
  timestamp: Date;
  significance: 'high' | 'medium' | 'low';
}

const typeConfig = {
  large_buy: { icon: '🐋', label: 'Large Buy', color: 'var(--green)' },
  large_sell: { icon: '🔴', label: 'Large Sell', color: 'var(--red)' },
  transfer: { icon: '📦', label: 'Transfer', color: 'var(--yellow)' },
  exchange_inflow: { icon: '📥', label: 'Exchange Inflow', color: 'var(--yellow)' },
  exchange_outflow: { icon: '📤', label: 'Exchange Outflow', color: 'var(--green)' },
};

function truncAddr(addr: string): string {
  if (addr.length <= 12) return addr;
  return addr.slice(0, 6) + '...' + addr.slice(-4);
}

function formatUSD(v: number): string {
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K';
  return '$' + v.toFixed(0);
}

function timeAgo(d: Date): string {
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

function generateMockWhaleEvent(): WhaleEvent {
  const types: WhaleEvent['type'][] = ['large_buy', 'large_sell', 'transfer', 'exchange_inflow', 'exchange_outflow'];
  const assets = ['BTC', 'ETH', 'SOL', 'DOGE', 'XRP', 'AVAX', 'MATIC', 'LINK'];
  const exchanges = ['OKX', 'Binance', 'Coinbase', 'Kraken', 'Bybit'];
  const type = types[Math.floor(Math.random() * types.length)];
  const asset = assets[Math.floor(Math.random() * assets.length)];
  const usdValue = Math.random() * 50000000 + 500000;
  const price = asset === 'BTC' ? 67900 : asset === 'ETH' ? 1984 : asset === 'SOL' ? 84 : 1;
  const amount = usdValue / price;
  const randomAddr = () => '0x' + Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join('');

  let from = randomAddr(), to = randomAddr();
  if (type === 'exchange_inflow') to = exchanges[Math.floor(Math.random() * exchanges.length)];
  if (type === 'exchange_outflow') from = exchanges[Math.floor(Math.random() * exchanges.length)];
  if (type === 'large_buy') { from = exchanges[Math.floor(Math.random() * exchanges.length)]; to = 'Buyer Wallet'; }
  if (type === 'large_sell') { from = 'Seller Wallet'; to = exchanges[Math.floor(Math.random() * exchanges.length)]; }

  return {
    id: Math.random().toString(36).slice(2, 10),
    type, asset, amount, usdValue, from, to,
    timestamp: new Date(Date.now() - Math.random() * 3600000),
    significance: usdValue > 20000000 ? 'high' : usdValue > 5000000 ? 'medium' : 'low',
  };
}

export default function WhaleActivityFeed() {
  const [events, setEvents] = useState<WhaleEvent[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    const initial = Array.from({ length: 20 }, generateMockWhaleEvent)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    setEvents(initial);
  }, []);

  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(() => {
      const newEvent = generateMockWhaleEvent();
      newEvent.timestamp = new Date();
      setEvents(prev => [newEvent, ...prev].slice(0, 50));
    }, 8000 + Math.random() * 12000);
    return () => clearInterval(interval);
  }, [isPaused]);

  const filtered = filter === 'all' ? events : events.filter(e => e.type === filter);

  const stats = {
    totalVolume: events.reduce((s, e) => s + e.usdValue, 0),
    buys: events.filter(e => e.type === 'large_buy').length,
    sells: events.filter(e => e.type === 'large_sell').length,
    highSignificance: events.filter(e => e.significance === 'high').length,
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        {[
          { l: 'Total Whale Volume', v: formatUSD(stats.totalVolume) },
          { l: 'Large Buys', v: stats.buys.toString(), c: 'green-text' },
          { l: 'Large Sells', v: stats.sells.toString(), c: 'red-text' },
          { l: 'High Impact Events', v: stats.highSignificance.toString(), c: 'text-yellow-400' },
        ].map(s => (
          <div key={s.l} className="okx-card p-3">
            <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{s.l}</div>
            <div className={`text-xl font-bold mt-1 ${s.c || ''}`}>{s.v}</div>
          </div>
        ))}
      </div>

      <div className="okx-card p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="text-lg">🐋</span>
            <h3 className="font-medium">Live Whale Activity</h3>
            <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--green)', color: '#000' }}>
              {isPaused ? 'PAUSED' : 'LIVE'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setIsPaused(!isPaused)} className="okx-btn-secondary text-xs px-3 py-1">
              {isPaused ? '▶ Resume' : '⏸ Pause'}
            </button>
            <select
              value={filter}
              onChange={e => setFilter(e.target.value)}
              className="text-xs px-2 py-1 rounded"
              style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)' }}
            >
              <option value="all">All Events</option>
              <option value="large_buy">Buys</option>
              <option value="large_sell">Sells</option>
              <option value="transfer">Transfers</option>
              <option value="exchange_inflow">Inflows</option>
              <option value="exchange_outflow">Outflows</option>
            </select>
          </div>
        </div>

        <div className="space-y-1 max-h-96 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
          {filtered.map(event => {
            const cfg = typeConfig[event.type];
            return (
              <div
                key={event.id}
                className={`flex items-center justify-between p-2 rounded transition-all hover:brightness-110 ${event.significance === 'high' ? 'ring-1 ring-yellow-500/30' : ''}`}
                style={{ background: 'var(--bg-primary)' }}
              >
                <div className="flex items-center gap-3 flex-1">
                  <span className="text-lg">{cfg.icon}</span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{event.asset}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: cfg.color + '20', color: cfg.color }}>
                        {cfg.label}
                      </span>
                      {event.significance === 'high' && <span className="text-xs">🔥</span>}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                      {truncAddr(event.from)} → {truncAddr(event.to)}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-sm font-medium" style={{ color: cfg.color }}>
                    {formatUSD(event.usdValue)}
                  </div>
                  <div className="text-xs font-mono" style={{ color: 'var(--text-tertiary)' }}>
                    {event.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} {event.asset}
                  </div>
                </div>
                <div className="text-xs ml-3 w-14 text-right" style={{ color: 'var(--text-tertiary)' }}>
                  {timeAgo(event.timestamp)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
