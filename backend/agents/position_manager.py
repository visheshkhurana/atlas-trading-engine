"""AI Position Scaling Manager.

Scales into winning positions using R-multiple logic.
+1R -> add 50% initial size, move stop to breakeven.
+2R -> add 25% initial size, trail stop to +1R.

Routing: LONG -> spot (Kraken), SHORT -> perp (OKX).
"""

import time, logging
from typing import Dict, Optional
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class ScaledPosition:
    symbol: str
    direction: str
    entry_price: float
    stop_price: float
    initial_size: float
    current_size: float
    tranches: list = field(default_factory=list)
    scaled_1r: bool = False
    scaled_2r: bool = False
    trade_type: str = "spot"
    exchange: str = "kraken"
    opened_at: float = field(default_factory=time.time)

    @property
    def risk_distance(self) -> float:
        return abs(self.entry_price - self.stop_price)

    def update_r(self, current_price: float):
        rd = self.risk_distance
        if rd == 0:
            self._r = 0
            return
        if self.direction == "long":
            self._r = (current_price - self.entry_price) / rd
        else:
            self._r = (self.entry_price - current_price) / rd


class PositionScalingManager:
    """Scale into winning positions using R-multiple logic."""

    def __init__(self, config: dict = None):
        config = config or {}
        self.risk_per_trade = config.get("risk_per_trade", 0.02)
        self.scale_1r_pct = config.get("scale_1r_pct", 0.50)
        self.scale_2r_pct = config.get("scale_2r_pct", 0.25)
        self.max_position_pct = config.get("max_position_pct", 0.20)
        self.positions: Dict[str, ScaledPosition] = {}

    def open_position(self, symbol, direction, entry_price, stop_price, portfolio_value):
        stop_dist_pct = abs(entry_price - stop_price) / entry_price if entry_price else 0.03
        size_usd = min(
            (portfolio_value * self.risk_per_trade) / stop_dist_pct,
            portfolio_value * self.max_position_pct,
        )
        trade_type = "spot" if direction == "long" else "perp"
        exchange = "kraken" if direction == "long" else "okx"

        pos = ScaledPosition(
            symbol=symbol, direction=direction, entry_price=entry_price,
            stop_price=stop_price, initial_size=size_usd, current_size=size_usd,
            tranches=[{"size_usd": round(size_usd, 2), "price": entry_price,
                       "r": 0, "ts": time.time()}],
            trade_type=trade_type, exchange=exchange,
        )
        self.positions[symbol] = pos
        logger.info("OPEN %s %s $%.2f @ %.2f stop=%.2f via %s/%s",
                     direction, symbol, size_usd, entry_price, stop_price, trade_type, exchange)
        return {"action": "OPEN", "symbol": symbol, "direction": direction,
                "size_usd": round(size_usd, 2),
                "size_units": round(size_usd / entry_price, 6) if entry_price else 0,
                "entry_price": entry_price, "stop_price": stop_price,
                "trade_type": trade_type, "exchange": exchange}

    def check_scaling(self, symbol, current_price, portfolio_value) -> Optional[dict]:
        pos = self.positions.get(symbol)
        if not pos:
            return None
        pos.update_r(current_price)
        r = pos._r

        if not pos.scaled_1r and r >= 1.0:
            add = pos.initial_size * self.scale_1r_pct
            add = min(add, portfolio_value * self.max_position_pct - pos.current_size)
            if add <= 0:
                return None
            pos.scaled_1r = True
            pos.current_size += add
            pos.stop_price = pos.entry_price  # breakeven
            pos.tranches.append({"size_usd": round(add, 2), "price": current_price, "r": round(r, 2), "ts": time.time()})
            logger.info("SCALE +1R %s add $%.2f total=$%.2f", symbol, add, pos.current_size)
            return {"action": "ADD", "symbol": symbol, "size_usd": round(add, 2),
                    "r": round(r, 2), "new_stop": pos.stop_price, "trade_type": pos.trade_type, "exchange": pos.exchange}

        if pos.scaled_1r and not pos.scaled_2r and r >= 2.0:
            add = pos.initial_size * self.scale_2r_pct
            add = min(add, portfolio_value * self.max_position_pct - pos.current_size)
            if add <= 0:
                return None
            pos.scaled_2r = True
            pos.current_size += add
            rd = pos.risk_distance
            pos.stop_price = pos.entry_price + rd if pos.direction == "long" else pos.entry_price - rd
            pos.tranches.append({"size_usd": round(add, 2), "price": current_price, "r": round(r, 2), "ts": time.time()})
            logger.info("SCALE +2R %s add $%.2f total=$%.2f", symbol, add, pos.current_size)
            return {"action": "ADD", "symbol": symbol, "size_usd": round(add, 2),
                    "r": round(r, 2), "new_stop": pos.stop_price, "trade_type": pos.trade_type, "exchange": pos.exchange}

        return None

    def close_position(self, symbol, exit_price) -> Optional[dict]:
        pos = self.positions.pop(symbol, None)
        if not pos:
            return None
        total_cost = sum(t["size_usd"] for t in pos.tranches)
        w_entry = sum(t["size_usd"] * t["price"] for t in pos.tranches) / total_cost if total_cost else pos.entry_price
        units = total_cost / w_entry if w_entry else 0
        pnl = (exit_price - w_entry) * units if pos.direction == "long" else (w_entry - exit_price) * units
        logger.info("CLOSE %s PnL=$%.2f (%d tranches)", symbol, pnl, len(pos.tranches))
        return {"action": "CLOSE", "symbol": symbol, "pnl_usd": round(pnl, 2),
                "entry_avg": round(w_entry, 2), "exit": round(exit_price, 2),
                "tranches": len(pos.tranches), "trade_type": pos.trade_type, "exchange": pos.exchange}

    @property
    def total_exposure(self):
        return sum(p.current_size for p in self.positions.values())
