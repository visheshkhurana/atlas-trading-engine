"""RiskManager – position sizing, drawdown, exposure limits & kill switch."""

import time
import logging
from dataclasses import dataclass, field
from typing import Dict, Optional

from backend.engine.event_bus import EventBus, EventType

logger = logging.getLogger(__name__)


@dataclass
class PositionRecord:
    symbol: str
    direction: str
    size: float
    entry_price: float
    current_price: float = 0.0
    unrealised_pnl: float = 0.0
    stop_loss: float = 0.0
    take_profit: float = 0.0
    opened_at: float = field(default_factory=time.time)


class RiskManager:
    """Central risk gate – every order proposal must pass through here."""

    def __init__(self, config: dict, event_bus: EventBus):
        self.config = config
        self.event_bus = event_bus

        # Limits
        self.max_position_pct: float = config.get("max_position_pct", 0.02)
        self.max_portfolio_risk: float = config.get("max_portfolio_risk", 0.06)
        self.max_leverage: float = config.get("max_leverage", 3.0)
        self.max_drawdown_pct: float = config.get("max_drawdown_pct", 0.10)
        self.max_open_positions: int = config.get("max_open_positions", 5)
        self.max_correlated_exposure: float = config.get("max_correlated_exposure", 0.15)

        # State
        self.portfolio_value: float = config.get("initial_capital", 10_000)
        self.peak_value: float = self.portfolio_value
        self.positions: Dict[str, PositionRecord] = {}
        self.kill_switch_active: bool = False
        self.daily_loss: float = 0.0
        self.daily_loss_limit: float = config.get("daily_loss_limit", 0.05)

    # ------------------------------------------------------------------
    def check_signal(self, signal) -> dict:
        """Validate a trade signal against risk rules.
        
        Returns dict with 'approved', 'position_size', 'leverage', 'stop_loss',
        'take_profit', and 'reason' keys.
        """
        if self.kill_switch_active:
            return self._reject("Kill switch active")

        if len(self.positions) >= self.max_open_positions:
            return self._reject("Max open positions reached")

        # Drawdown check
        drawdown = self._current_drawdown()
        if drawdown >= self.max_drawdown_pct:
            self.kill_switch_active = True
            logger.critical("KILL SWITCH – drawdown %.2f%% exceeds limit", drawdown * 100)
            return self._reject(f"Drawdown {drawdown:.2%} exceeds limit")

        # Daily loss check
        if self.daily_loss / self.portfolio_value >= self.daily_loss_limit:
            return self._reject("Daily loss limit reached")

        # Position sizing: risk_pct * portfolio / distance_to_stop
        volatility = signal.metadata.get("std", 0) or signal.metadata.get("volatility", 0.02)
        price = signal.metadata.get("entry_price", 0) or signal.metadata.get("price", 0)
        if price <= 0:
            return self._reject("Invalid entry price")

        stop_distance = 2.0 * volatility  # 2x ATR / std as stop
        if stop_distance <= 0:
            stop_distance = price * 0.02  # fallback 2%

        position_value = (self.max_position_pct * self.portfolio_value) / (stop_distance / price)
        position_value = min(position_value, self.portfolio_value * self.max_portfolio_risk)

        # Leverage
        leverage = min(
            signal.confidence * self.max_leverage,
            self.max_leverage,
        )
        leverage = max(leverage, 1.0)

        size = position_value / price

        # Stop loss / take profit
        if signal.direction == "long":
            stop_loss = price - stop_distance
            take_profit = price + stop_distance * 2.5
        else:
            stop_loss = price + stop_distance
            take_profit = price - stop_distance * 2.5

        return {
            "approved": True,
            "position_size": round(size, 6),
            "position_value": round(position_value, 2),
            "leverage": round(leverage, 2),
            "stop_loss": round(stop_loss, 2),
            "take_profit": round(take_profit, 2),
            "risk_pct": round(self.max_position_pct * 100, 2),
            "drawdown": round(drawdown * 100, 2),
            "reason": "approved",
        }

    # ------------------------------------------------------------------
    def register_position(self, symbol: str, direction: str, size: float,
                          entry_price: float, stop_loss: float, take_profit: float):
        self.positions[symbol] = PositionRecord(
            symbol=symbol,
            direction=direction,
            size=size,
            entry_price=entry_price,
            current_price=entry_price,
            stop_loss=stop_loss,
            take_profit=take_profit,
        )
        logger.info("Position opened: %s %s %.6f @ %.2f", direction, symbol, size, entry_price)

    def close_position(self, symbol: str, exit_price: float) -> float:
        pos = self.positions.pop(symbol, None)
        if pos is None:
            return 0.0
        if pos.direction == "long":
            pnl = (exit_price - pos.entry_price) * pos.size
        else:
            pnl = (pos.entry_price - exit_price) * pos.size
        self.portfolio_value += pnl
        self.peak_value = max(self.peak_value, self.portfolio_value)
        if pnl < 0:
            self.daily_loss += abs(pnl)
        logger.info("Position closed: %s PnL=%.2f", symbol, pnl)
        return pnl

    def update_prices(self, prices: Dict[str, float]):
        """Update current prices for all open positions."""
        for symbol, pos in self.positions.items():
            if symbol in prices:
                pos.current_price = prices[symbol]
                if pos.direction == "long":
                    pos.unrealised_pnl = (pos.current_price - pos.entry_price) * pos.size
                else:
                    pos.unrealised_pnl = (pos.entry_price - pos.current_price) * pos.size

    def check_stops(self) -> list:
        """Return list of symbols that hit stop-loss or take-profit."""
        triggered = []
        for symbol, pos in list(self.positions.items()):
            if pos.direction == "long":
                if pos.current_price <= pos.stop_loss:
                    triggered.append((symbol, "stop_loss", pos.current_price))
                elif pos.current_price >= pos.take_profit:
                    triggered.append((symbol, "take_profit", pos.current_price))
            else:
                if pos.current_price >= pos.stop_loss:
                    triggered.append((symbol, "stop_loss", pos.current_price))
                elif pos.current_price <= pos.take_profit:
                    triggered.append((symbol, "take_profit", pos.current_price))
        return triggered

    def reset_daily(self):
        """Call at start of each trading day."""
        self.daily_loss = 0.0
        self.kill_switch_active = False
        logger.info("Daily risk counters reset")

    # ------------------------------------------------------------------
    def _current_drawdown(self) -> float:
        if self.peak_value == 0:
            return 0.0
        unrealised = sum(p.unrealised_pnl for p in self.positions.values())
        current = self.portfolio_value + unrealised
        return (self.peak_value - current) / self.peak_value

    @staticmethod
    def _reject(reason: str) -> dict:
        return {
            "approved": False,
            "position_size": 0,
            "position_value": 0,
            "leverage": 0,
            "stop_loss": 0,
            "take_profit": 0,
            "risk_pct": 0,
            "drawdown": 0,
            "reason": reason,
        }
