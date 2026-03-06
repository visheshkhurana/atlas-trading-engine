"""Mean Reversion Strategy – Z-score based with Bollinger Bands."""

import numpy as np
from typing import Dict, List, Optional
from .base import Strategy, Signal


class MeanReversionStrategy(Strategy):
    """Detect overbought / oversold via z-score and trade the reversion."""

    name = "mean_reversion"

    def __init__(self, config: dict):
        super().__init__(config)
        self.bb_period: int = config.get("bb_period", 20)
        self.bb_std: float = config.get("bb_std", 2.0)
        self.zscore_entry: float = config.get("zscore_entry", 2.0)
        self.zscore_exit: float = config.get("zscore_exit", 0.5)
        self.min_mean_reversion_rate: float = config.get("min_mean_reversion_rate", 0.6)
        self.lookback: int = config.get("lookback", 100)

    # ------------------------------------------------------------------
    async def evaluate(self, market_data: dict) -> Optional[Signal]:
        """Return a Signal when z-score exceeds thresholds."""

        closes: List[float] = market_data.get("closes", [])
        if len(closes) < self.lookback:
            return None

        window = np.array(closes[-self.lookback :])
        mean = float(np.mean(window))
        std = float(np.std(window))
        if std == 0:
            return None

        current = closes[-1]
        zscore = (current - mean) / std

        # Bollinger Band width for regime filter
        bb_upper = mean + self.bb_std * std
        bb_lower = mean - self.bb_std * std
        bb_width = (bb_upper - bb_lower) / mean if mean else 0

        # Historical mean-reversion rate
        mr_rate = self._mean_reversion_rate(window, mean)
        if mr_rate < self.min_mean_reversion_rate:
            return None  # trending market – skip

        # Signals
        if zscore <= -self.zscore_entry:
            confidence = min(abs(zscore) / 4.0, 1.0) * mr_rate
            return Signal(
                strategy=self.name,
                symbol=market_data.get("symbol", ""),
                direction="long",
                confidence=round(confidence, 4),
                metadata={
                    "zscore": round(zscore, 4),
                    "mean": round(mean, 2),
                    "std": round(std, 4),
                    "bb_width": round(bb_width, 6),
                    "mr_rate": round(mr_rate, 4),
                    "entry_price": current,
                    "target_price": round(mean, 2),
                },
            )
        elif zscore >= self.zscore_entry:
            confidence = min(abs(zscore) / 4.0, 1.0) * mr_rate
            return Signal(
                strategy=self.name,
                symbol=market_data.get("symbol", ""),
                direction="short",
                confidence=round(confidence, 4),
                metadata={
                    "zscore": round(zscore, 4),
                    "mean": round(mean, 2),
                    "std": round(std, 4),
                    "bb_width": round(bb_width, 6),
                    "mr_rate": round(mr_rate, 4),
                    "entry_price": current,
                    "target_price": round(mean, 2),
                },
            )

        return None

    # ------------------------------------------------------------------
    @staticmethod
    def _mean_reversion_rate(prices: np.ndarray, mean: float) -> float:
        """Fraction of times price crossed back through the mean."""
        if len(prices) < 3:
            return 0.0
        above = prices > mean
        crossings = int(np.sum(np.diff(above.astype(int)) != 0))
        max_possible = len(prices) - 1
        return crossings / max_possible if max_possible else 0.0
