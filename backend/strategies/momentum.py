from typing import Dict, Optional
from .base import Strategy, Signal


class MomentumStrategy(Strategy):
    def __init__(self, weight: float = 1.0):
        super().__init__("momentum", weight)
        self.min_confidence = 0.6

    def generate_signal(self, market: Dict) -> Optional[Signal]:
        price = market.get("price", 0)
        ma_fast = market.get("ma_fast", 0)
        ma_slow = market.get("ma_slow", 0)
        imbalance = market.get("imbalance", 0.5)
        volume_delta = market.get("volume_delta", 0)
        symbol = market.get("symbol", "BTC/USDT")
        exchange = market.get("exchange", "kraken")

        if not all([price, ma_fast, ma_slow]):
            return None

        confidence = 0.5
        if ma_fast > ma_slow:
            direction = "LONG"
            ma_spread = (ma_fast - ma_slow) / ma_slow
            confidence += min(ma_spread * 10, 0.2)
        elif ma_fast < ma_slow:
            direction = "SHORT"
            ma_spread = (ma_slow - ma_fast) / ma_slow
            confidence += min(ma_spread * 10, 0.2)
        else:
            return None

        if direction == "LONG" and imbalance > 0.55:
            confidence += 0.1
        elif direction == "SHORT" and imbalance < 0.45:
            confidence += 0.1

        if direction == "LONG" and volume_delta > 0:
            confidence += 0.05
        elif direction == "SHORT" and volume_delta < 0:
            confidence += 0.05

        if direction == "LONG" and price > ma_fast:
            confidence += 0.05
        elif direction == "SHORT" and price < ma_fast:
            confidence += 0.05

        confidence = min(confidence, 0.95)
        if confidence < self.min_confidence:
            return None

        return Signal(
            direction=direction,
            confidence=round(confidence, 3),
            strategy=self.name,
            symbol=symbol,
            exchange=exchange,
            metadata={"ma_fast": ma_fast, "ma_slow": ma_slow, "imbalance": imbalance, "price": price},
        )
