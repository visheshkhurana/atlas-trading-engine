"""TradingEngine — fully autonomous orchestrator.

Pipeline:
  MarketDataEngine -> Strategies -> RegimeDetector -> DecisionAgent
  -> PortfolioAgent -> PositionScalingManager -> RiskManager
  -> LiveExecution (Kraken spot / OKX perp) -> Supabase logging
"""

import asyncio
import os
import time
import logging
import statistics
from datetime import datetime, timezone
from typing import Dict, List, Optional

from backend.engine.event_bus import EventBus, EventType
from backend.data.market_data import MarketDataEngine
from backend.strategies import (
    MomentumStrategy,
    MeanReversionStrategy,
    LiquidationStrategy,
    WhaleFollowStrategy,
    OrderFlowStrategy,
)
from backend.agents.decision_agent import DecisionAgent
from backend.agents.portfolio_agent import PortfolioAgent
from backend.agents.regime_detector import RegimeDetector
from backend.agents.position_manager import PositionScalingManager
from backend.risk.risk_manager import RiskManager
from backend.execution.live_execution import LiveExecution

try:
    from supabase import create_client
except ImportError:
    create_client = None

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants / env
# ---------------------------------------------------------------------------
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
PAPER_MODE = os.getenv("PAPER_MODE", "true").lower() == "true"
LOOP_INTERVAL = int(os.getenv("LOOP_INTERVAL", "5"))
VOLATILITY_PAUSE_THRESHOLD = float(os.getenv("VOL_PAUSE", "0.06"))
MAX_TRADES_PER_DAY = int(os.getenv("MAX_DAILY_TRADES", "20"))
MAX_POSITION_PCT = float(os.getenv("MAX_POS_PCT", "0.03"))

SYMBOLS = [
    "BTC/USDT",
    "ETH/USDT",
    "SOL/USDT",
    "ARB/USDT",
    "DOGE/USDT",
]


class TradingEngine:
    """Core autonomous loop: data -> signal -> consensus -> risk -> execute."""

    def __init__(self, config: Optional[dict] = None):
        self.config = config or {}
        self.event_bus = EventBus()

        # --- data ---
        self.market = MarketDataEngine()

        # --- strategies ---
        self.strategies = [
            MomentumStrategy(),
            MeanReversionStrategy(),
            LiquidationStrategy(),
            WhaleFollowStrategy(),
            OrderFlowStrategy(),
        ]

        # --- agents ---
        self.decision_agent = DecisionAgent()
        self.portfolio_agent = PortfolioAgent()
        self.regime_detector = RegimeDetector()
        self.position_manager = PositionScalingManager()

        # --- risk & execution ---
        self.risk = RiskManager()
        self.execution = LiveExecution()

        # --- supabase ---
        self.supabase = None
        if create_client and SUPABASE_URL and SUPABASE_KEY:
            try:
                self.supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
                logger.info("Supabase client initialized")
            except Exception as exc:
                logger.warning("Supabase init failed: %s", exc)

        # --- runtime state ---
        self.running = False
        self.daily_trade_count = 0
        self.last_reset_date = datetime.now(timezone.utc).date()
        self.trade_history: List[dict] = []

    # ------------------------------------------------------------------
    # helpers
    # ------------------------------------------------------------------
    def _reset_daily_counter(self):
        today = datetime.now(timezone.utc).date()
        if today != self.last_reset_date:
            self.daily_trade_count = 0
            self.last_reset_date = today
            logger.info("Daily trade counter reset")

    @staticmethod
    def _calc_volatility(prices: List[float]) -> float:
        if len(prices) < 2:
            return 0.0
        returns = [
            (prices[i] - prices[i - 1]) / prices[i - 1]
            for i in range(1, len(prices))
        ]
        return statistics.stdev(returns) if len(returns) > 1 else 0.0

    # ------------------------------------------------------------------
    # signal generation
    # ------------------------------------------------------------------
    async def _generate_signals(self, market_state: dict) -> List[dict]:
        signals: List[dict] = []
        for strat in self.strategies:
            try:
                sig = strat.generate_signal(market_state)
                if sig:
                    signals.append(sig)
            except Exception as exc:
                logger.warning("Strategy %s error: %s", strat.__class__.__name__, exc)
        return signals

    # ------------------------------------------------------------------
    # supabase persistence
    # ------------------------------------------------------------------
    async def _log_trade(self, trade: dict):
        if self.supabase is None:
            return
        try:
            self.supabase.table("trades").insert({
                "symbol": trade.get("symbol"),
                "side": trade.get("side"),
                "size": trade.get("size"),
                "price": trade.get("price"),
                "exchange": trade.get("exchange"),
                "strategy": trade.get("strategy", "consensus"),
                "regime": trade.get("regime", "unknown"),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }).execute()
        except Exception as exc:
            logger.warning("Supabase log_trade error: %s", exc)

    async def _log_portfolio_snapshot(self, portfolio: dict, regime: str):
        if self.supabase is None:
            return
        try:
            self.supabase.table("portfolio_snapshots").insert({
                "total_value": portfolio.get("value", 0),
                "regime": regime,
                "positions_count": portfolio.get("positions_count", 0),
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }).execute()
        except Exception as exc:
            logger.warning("Supabase snapshot error: %s", exc)

    async def _log_alert(self, level: str, message: str):
        if self.supabase is None:
            return
        try:
            self.supabase.table("system_alerts").insert({
                "level": level,
                "message": message,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }).execute()
        except Exception as exc:
            logger.warning("Supabase alert error: %s", exc)

    # ------------------------------------------------------------------
    # main autonomous loop
    # ------------------------------------------------------------------
    async def run(self):
        self.running = True
        logger.info(
            "ATLAS Engine started | paper=%s | interval=%ss | vol_pause=%.2f",
            PAPER_MODE, LOOP_INTERVAL, VOLATILITY_PAUSE_THRESHOLD,
        )
        await self._log_alert("info", "ATLAS Engine started")

        while self.running:
            cycle_start = time.monotonic()
            try:
                self._reset_daily_counter()

                # --- 1. Market data snapshot (all symbols) ---
                snapshots: Dict[str, dict] = {}
                for sym in SYMBOLS:
                    try:
                        snap = await self.market.snapshot(sym)
                        snapshots[sym] = snap
                    except Exception as exc:
                        logger.warning("Snapshot %s failed: %s", sym, exc)

                if not snapshots:
                    logger.warning("No market data — sleeping")
                    await asyncio.sleep(LOOP_INTERVAL)
                    continue

                # --- 2. Volatility safety check ---
                primary = snapshots.get("BTC/USDT", {})
                prices = primary.get("recent_prices", [])
                vol = self._calc_volatility(prices)

                if vol > VOLATILITY_PAUSE_THRESHOLD:
                    msg = f"Volatility pause triggered: {vol:.4f} > {VOLATILITY_PAUSE_THRESHOLD}"
                    logger.warning(msg)
                    await self._log_alert("warning", msg)
                    self.event_bus.emit(EventType.RISK_ALERT, {"volatility": vol})
                    await asyncio.sleep(60)
                    continue

                # --- 3. Regime detection ---
                regime = self.regime_detector.detect(primary)
                logger.info("Regime: %s | Volatility: %.4f", regime, vol)

                # --- 4. Generate signals per symbol ---
                all_signals: List[dict] = []
                for sym, snap in snapshots.items():
                    snap["symbol"] = sym
                    snap["regime"] = regime
                    sigs = await self._generate_signals(snap)
                    for s in sigs:
                        s.setdefault("symbol", sym)
                    all_signals.extend(sigs)

                if not all_signals:
                    logger.info("No signals this cycle")
                    await asyncio.sleep(LOOP_INTERVAL)
                    continue

                # --- 5. Decision agent consensus scoring ---
                ranked = self.decision_agent.score(all_signals, regime)
                logger.info("Ranked signals: %d", len(ranked))

                # --- 6. Portfolio allocation ---
                portfolio = {
                    "value": primary.get("portfolio_value", 10000),
                    "positions_count": len(self.trade_history),
                }
                trades = self.portfolio_agent.allocate(ranked, portfolio)

                # --- 7. Position scaling (R-multiple) ---
                scaled_trades = []
                for t in trades:
                    try:
                        scaled = self.position_manager.calculate_position(
                            portfolio_value=portfolio["value"],
                            entry_price=t.get("price", 0),
                            stop_price=t.get("stop_loss", 0),
                            current_pnl_r=t.get("pnl_r", 0),
                        )
                        t["size"] = scaled.get("position_size", t.get("size", 0))
                        t["leverage"] = scaled.get("leverage", 1)
                        scaled_trades.append(t)
                    except Exception as exc:
                        logger.warning("Position scaling error: %s", exc)
                        scaled_trades.append(t)

                # --- 8. Risk validation & execution ---
                executed = 0
                for trade in scaled_trades:
                    # daily limit
                    if self.daily_trade_count >= MAX_TRADES_PER_DAY:
                        logger.warning("Daily trade limit reached (%d)", MAX_TRADES_PER_DAY)
                        await self._log_alert("warning", "Daily trade limit reached")
                        break

                    # max position size
                    max_size = MAX_POSITION_PCT * portfolio["value"]
                    if trade.get("size", 0) * trade.get("price", 1) > max_size:
                        trade["size"] = max_size / max(trade.get("price", 1), 1)

                    # risk check
                    if not self.risk.validate_trade(trade, portfolio):
                        logger.info("Trade rejected by risk manager: %s", trade.get("symbol"))
                        continue

                    # route: LONG -> Kraken spot, SHORT -> OKX perp
                    side = trade.get("side", "buy")
                    if side in ("buy", "long"):
                        exchange = "kraken"
                    else:
                        exchange = "okx"
                    trade["exchange"] = exchange

                    # execute
                    if PAPER_MODE:
                        result = {
                            "price": trade.get("price", 0),
                            "filled": trade.get("size", 0),
                            "status": "paper_filled",
                        }
                        logger.info(
                            "[PAPER] %s %s %.6f @ %.2f on %s",
                            side.upper(), trade["symbol"],
                            trade["size"], trade.get("price", 0), exchange,
                        )
                    else:
                        try:
                            result = self.execution.place_order(
                                exchange=exchange,
                                symbol=trade["symbol"],
                                side=side,
                                amount=trade["size"],
                            )
                        except Exception as exc:
                            logger.error("Execution error: %s", exc)
                            await self._log_alert("error", f"Execution failed: {exc}")
                            continue

                    # record
                    trade_record = {
                        "symbol": trade["symbol"],
                        "side": side,
                        "size": trade["size"],
                        "price": result.get("price", trade.get("price", 0)),
                        "exchange": exchange,
                        "strategy": trade.get("strategy", "consensus"),
                        "regime": regime,
                    }
                    await self._log_trade(trade_record)
                    self.trade_history.append(trade_record)
                    self.daily_trade_count += 1
                    executed += 1

                    self.event_bus.emit(EventType.ORDER_FILLED, trade_record)

                # --- 9. Portfolio snapshot ---
                await self._log_portfolio_snapshot(portfolio, regime)

                elapsed = time.monotonic() - cycle_start
                logger.info(
                    "Cycle done | signals=%d | executed=%d | %.2fs",
                    len(all_signals), executed, elapsed,
                )

            except Exception as exc:
                logger.error("ENGINE ERROR: %s", exc, exc_info=True)
                await self._log_alert("error", f"Engine error: {exc}")
                await asyncio.sleep(10)
                continue

            await asyncio.sleep(LOOP_INTERVAL)

    async def stop(self):
        self.running = False
        logger.info("ATLAS Engine stopping")
        await self._log_alert("info", "ATLAS Engine stopped")
