"""Liquidation Cluster Strategy – trade around large liquidation zones."""

import numpy as np
from typing import Dict, List, Optional
from .base import Strategy, Signal


class LiquidationStrategy(Strategy):
    """Identify liquidation clusters and trade the expected cascade."""

    name = "liquidation"

    def __init__(self, config: dict):
        super().__init__(config)
        self.liq_threshold: float = config.get("liq_threshold", 0.6)
        self.funding_extreme: float = config.get("funding_extreme", 0.01)
        self.oi_change_threshold: float = config.get("oi_change_threshold", 0.05)
        self.min_cluster_size: float = config.get("min_cluster_size", 1_000_000)

    # ------------------------------------------------------------------
    async def evaluate(self, market_data: dict) -> Optional[Signal]:
        """Evaluate liquidation pressure and generate signal."""

        long_liqs: float = market_data.get("long_liquidations", 0)
        short_liqs: float = market_data.get("short_liquidations", 0)
        funding_rate: float = market_data.get("funding_rate", 0)
        open_interest: float = market_data.get("open_interest", 0)
        oi_change: float = market_data.get("oi_change_pct", 0)
        price: float = market_data.get("price", 0)

        total_liqs = long_liqs + short_liqs
        if total_liqs < self.min_cluster_size:
            return None

        # Liquidation pressure ratio
        if total_liqs == 0:
            return None
        liq_pressure = (long_liqs - short_liqs) / total_liqs  # -1 to +1

        # Funding rate extremity
        funding_extreme = abs(funding_rate) > self.funding_extreme

        # Open interest divergence
        oi_divergence = abs(oi_change) > self.oi_change_threshold

        # --- Long signal: heavy long liquidations (negative pressure) ---
        if liq_pressure <= -self.liq_threshold:
            # Longs getting liquidated -> potential oversold bounce
            confidence = min(abs(liq_pressure), 1.0)
            if funding_extreme and funding_rate < 0:
                confidence *= 1.2  # negative funding = extra conviction
            if oi_divergence and oi_change < 0:
                confidence *= 1.1  # OI dropping = liquidation cascade ending
            confidence = min(confidence, 1.0)

            return Signal(
                strategy=self.name,
                symbol=market_data.get("symbol", ""),
                direction="long",
                confidence=round(confidence, 4),
                metadata={
                    "liq_pressure": round(liq_pressure, 4),
                    "long_liqs": long_liqs,
                    "short_liqs": short_liqs,
                    "funding_rate": funding_rate,
                    "oi_change_pct": round(oi_change, 4),
                    "price": price,
                },
            )

        # --- Short signal: heavy short liquidations (positive pressure) ---
        elif liq_pressure >= self.liq_threshold:
            confidence = min(abs(liq_pressure), 1.0)
            if funding_extreme and funding_rate > 0:
                confidence *= 1.2
            if oi_divergence and oi_change < 0:
                confidence *= 1.1
            confidence = min(confidence, 1.0)

            return Signal(
                strategy=self.name,
                symbol=market_data.get("symbol", ""),
                direction="short",
                confidence=round(confidence, 4),
                metadata={
                    "liq_pressure": round(liq_pressure, 4),
                    "long_liqs": long_liqs,
                    "short_liqs": short_liqs,
                    "funding_rate": funding_rate,
                    "oi_change_pct": round(oi_change, 4),
                    "price": price,
                },
            )

        return None
