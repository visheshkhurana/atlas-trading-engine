"""TradingEngine – main orchestrator: strategies -> risk -> execution."""

import asyncio
import time
import logging
from typing import Dict, List

from backend.engine.event_bus import EventBus, EventType
from backend.data.market_data import MarketDataEngine
from backend.strategies import (
    MomentumStrategy,
    MeanReversionStrategy,
    LiquidationStrategy,
    WhaleFollowStrategy,
)
from backend.risk.risk_manager import RiskManager
from backend.execution.exchange_connector import ExchangeConnector

logger = logging.getLogger(__name__)


class TradingEngine:
    """Core loop: collect data -> run strategies -> risk check -> execute."""

    def __init__(self, config: dict):
        self.config = config
        self.event_bus = EventBus()

        # Sub-systems
        self.market_data = MarketDataEngine(config.get("market_data", {}), self.event_bus)
        self.risk_manager = RiskManager(config.get("risk", {}), self.event_bus)
        self.exchange = ExchangeConnector(config.get("execution", {}))

        # Strategies
        strat_cfg = config.get("strategies", {})
        self.strategies = [
            MomentumStrategy(strat_cfg.get("momentum", {})),
            MeanReversionStrategy(strat_cfg.get("mean_reversion", {})),
            LiquidationStrategy(strat_cfg.get("liquidation", {})),
            WhaleFollowStrategy(strat_cfg.get("whale_follow", {})),
        ]

        self._running = False
        self.cycle_interval: float = config.get("cycle_interval", 10.0)
        self.min_consensus: int = config.get("min_consensus", 2)
        self.min_confidence: float = config.get("min_confidence", 0.5)

    # ------------------------------------------------------------------
    async def start(self):
        """Boot all sub-systems and enter the main loop."""
        logger.info("=== ATLAS Trading Engine starting ===")
        await self.exchange.start()
        self._running = True

        # Start market data in background
        asyncio.create_task(self.market_data.start())
        # Give data feeds a moment to populate
        await asyncio.sleep(5)

        logger.info("Entering main trading loop (interval=%.1fs)", self.cycle_interval)
        while self._running:
            try:
                await self._trading_cycle()
            except Exception as exc:
                logger.error("Trading cycle error: %s", exc, exc_info=True)
            await asyncio.sleep(self.cycle_interval)

    async def stop(self):
        self._running = False
        await self.market_data.stop()
        await self.exchange.stop()
        logger.info("=== ATLAS Trading Engine stopped ===")

    # ------------------------------------------------------------------
    async def _trading_cycle(self):
        """One full iteration: data -> signals -> consensus -> risk -> execute."""
        exchanges = list(self.market_data.exchanges.keys())
        if not exchanges:
            return

        for exc_name in exchanges:
            for symbol in self.market_data.symbols:
                snapshot = self.market_data.build_market_snapshot(exc_name, symbol)
                if not snapshot.get("price"):
                    continue

                # 1) Collect signals from all strategies
                signals = []
                for strategy in self.strategies:
                    try:
                        sig = await strategy.evaluate(snapshot)
                        if sig and sig.confidence >= self.min_confidence:
                            signals.append(sig)
                    except Exception as e:
                        logger.warning("Strategy %s error: %s", strategy.name, e)

                if not signals:
                    continue

                # 2) Consensus voting
                long_votes = [s for s in signals if s.direction == "long"]
                short_votes = [s for s in signals if s.direction == "short"]

                best_signal = None
                if len(long_votes) >= self.min_consensus:
                    best_signal = max(long_votes, key=lambda s: s.confidence)
                elif len(short_votes) >= self.min_consensus:
                    best_signal = max(short_votes, key=lambda s: s.confidence)

                if best_signal is None:
                    continue

                logger.info(
                    "Consensus reached: %s %s (conf=%.2f, votes=%d)",
                    best_signal.direction, symbol, best_signal.confidence,
                    len(long_votes) if best_signal.direction == "long" else len(short_votes),
                )

                # 3) Risk check
                risk_result = self.risk_manager.check_signal(best_signal)
                if not risk_result["approved"]:
                    logger.info("Risk rejected: %s", risk_result["reason"])
                    await self.event_bus.publish(EventType.RISK_ALERT, {
                        "symbol": symbol,
                        "reason": risk_result["reason"],
                        "signal": best_signal.__dict__,
                    })
                    continue

                # 4) Execute
                side = "buy" if best_signal.direction == "long" else "sell"
                order = await self.exchange.place_order(
                    exchange=exc_name,
                    symbol=symbol,
                    side=side,
                    amount=risk_result["position_size"],
                    order_type="market",
                    price=snapshot["price"],
                    leverage=risk_result["leverage"],
                )

                if "error" not in order:
                    self.risk_manager.register_position(
                        symbol=symbol,
                        direction=best_signal.direction,
                        size=risk_result["position_size"],
                        entry_price=order.get("price", snapshot["price"]),
                        stop_loss=risk_result["stop_loss"],
                        take_profit=risk_result["take_profit"],
                    )
                    await self.event_bus.publish(EventType.TRADE_EXECUTED, {
                        "order": order,
                        "signal": best_signal.__dict__,
                        "risk": risk_result,
                    })
                    logger.info("Trade executed: %s", order)
                else:
                    logger.error("Order failed: %s", order["error"])

        # 5) Check stops on open positions
        prices = {}
        for exc_name in exchanges:
            for symbol in self.market_data.symbols:
                p = self.market_data.get_latest_price(exc_name, symbol)
                if p:
                    prices[symbol] = p

        self.risk_manager.update_prices(prices)
        triggered = self.risk_manager.check_stops()
        for symbol, reason, price in triggered:
            side = "sell" if self.risk_manager.positions[symbol].direction == "long" else "buy"
            exc_name = exchanges[0]
            order = await self.exchange.place_order(
                exchange=exc_name, symbol=symbol, side=side,
                amount=self.risk_manager.positions[symbol].size,
                order_type="market", price=price,
            )
            pnl = self.risk_manager.close_position(symbol, price)
            logger.info("Stop triggered (%s) %s: PnL=%.2f", reason, symbol, pnl)
            await self.event_bus.publish(EventType.TRADE_EXECUTED, {
                "type": reason,
                "symbol": symbol,
                "pnl": pnl,
                "order": order,
            })
