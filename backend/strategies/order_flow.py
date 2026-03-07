"""Order Flow Imbalance Trading Engine.

Detects hidden accumulation/distribution by measuring real-time
buying vs selling pressure in the order book before price moves.

Routing: LONG -> spot (Kraken), SHORT -> perp (OKX)
"""

import time, logging
from typing import Optional
from .base import Strategy, Signal

logger = logging.getLogger(__name__)


class OrderFlowStrategy(Strategy):
    """Trade order-book imbalance with volume-delta confirmation."""

    name = "order_flow"

    def __init__(self, config: dict = None):
        super().__init__(config or {})
        self.long_threshold = self.config.get("imbalance_long", 0.65)
        self.short_threshold = self.config.get("imbalance_short", 0.35)
        self.delta_threshold = self.config.get("volume_delta_threshold", 0)
        self.depth = self.config.get("depth_levels", 10)
        self.spread_max = self.config.get("spread_max_pct", 0.005)

    async def evaluate(self, market_data: dict) -> Optional[Signal]:
        bids = market_data.get("bids", [])
        asks = market_data.get("asks", [])
        if not bids or not asks:
            return None

        bid_vol = sum(b[1] for b in bids[:self.depth])
        ask_vol = sum(a[1] for a in asks[:self.depth])
        total = bid_vol + ask_vol
        if total == 0:
            return None

        imbalance = bid_vol / total
        best_bid, best_ask = bids[0][0], asks[0][0]
        mid = (best_bid + best_ask) / 2
        spread_pct = (best_ask - best_bid) / mid if mid else 0
        if spread_pct > self.spread_max:
            return None

        vol_delta = market_data.get("volume_delta", 0)
        price = market_data.get("price", mid)
        symbol = market_data.get("symbol", "")

        if imbalance > self.long_threshold:
            if self.delta_threshold and vol_delta < self.delta_threshold:
                return None
            return Signal(
                strategy=self.name, symbol=symbol, direction="long",
                confidence=round(min(imbalance, 1.0), 4),
                metadata={"imbalance": round(imbalance, 4), "bid_volume": round(bid_vol, 4),
                    "ask_volume": round(ask_vol, 4), "volume_delta": round(vol_delta, 4),
                    "spread_pct": round(spread_pct, 6), "price": price,
                    "trade_type": "spot", "exchange": "kraken"})

        if imbalance < self.short_threshold:
            if self.delta_threshold and vol_delta > -self.delta_threshold:
                return None
            return Signal(
                strategy=self.name, symbol=symbol, direction="short",
                confidence=round(min(1 - imbalance, 1.0), 4),
                metadata={"imbalance": round(imbalance, 4), "bid_volume": round(bid_vol, 4),
                    "ask_volume": round(ask_vol, 4), "volume_delta": round(vol_delta, 4),
                    "spread_pct": round(spread_pct, 6), "price": price,
                    "trade_type": "perp", "exchange": "okx"})

        return None
