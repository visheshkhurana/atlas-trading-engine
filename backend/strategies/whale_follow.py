"""Whale Follow Strategy – track large wallet movements and exchange flows."""

from typing import Dict, List, Optional
from .base import Strategy, Signal


class WhaleFollowStrategy(Strategy):
    """Follow smart-money / whale wallet activity."""

    name = "whale_follow"

    def __init__(self, config: dict):
        super().__init__(config)
        self.whale_threshold_usd: float = config.get("whale_threshold_usd", 500_000)
        self.flow_imbalance_threshold: float = config.get("flow_imbalance_threshold", 0.3)
        self.min_whale_count: int = config.get("min_whale_count", 3)
        self.lookback_minutes: int = config.get("lookback_minutes", 60)

    # ------------------------------------------------------------------
    async def evaluate(self, market_data: dict) -> Optional[Signal]:
        """Evaluate whale activity and generate signal."""

        whale_buys: float = market_data.get("whale_buy_volume", 0)
        whale_sells: float = market_data.get("whale_sell_volume", 0)
        exchange_inflow: float = market_data.get("exchange_inflow", 0)
        exchange_outflow: float = market_data.get("exchange_outflow", 0)
        whale_tx_count: int = market_data.get("whale_tx_count", 0)
        price: float = market_data.get("price", 0)

        total_whale = whale_buys + whale_sells
        if total_whale < self.whale_threshold_usd:
            return None
        if whale_tx_count < self.min_whale_count:
            return None

        # Whale pressure ratio: -1 (all sells) to +1 (all buys)
        whale_pressure = (whale_buys - whale_sells) / total_whale if total_whale else 0

        # Exchange flow: net outflow = bullish (coins leaving exchanges)
        total_flow = exchange_inflow + exchange_outflow
        flow_ratio = 0.0
        if total_flow > 0:
            flow_ratio = (exchange_outflow - exchange_inflow) / total_flow

        # Combined signal
        combined = 0.6 * whale_pressure + 0.4 * flow_ratio

        if abs(combined) < self.flow_imbalance_threshold:
            return None

        direction = "long" if combined > 0 else "short"
        confidence = min(abs(combined), 1.0)

        return Signal(
            strategy=self.name,
            symbol=market_data.get("symbol", ""),
            direction=direction,
            confidence=round(confidence, 4),
            metadata={
                "whale_pressure": round(whale_pressure, 4),
                "flow_ratio": round(flow_ratio, 4),
                "combined_signal": round(combined, 4),
                "whale_buys_usd": whale_buys,
                "whale_sells_usd": whale_sells,
                "exchange_inflow": exchange_inflow,
                "exchange_outflow": exchange_outflow,
                "whale_tx_count": whale_tx_count,
                "price": price,
            },
        )
