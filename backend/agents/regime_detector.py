"""RegimeDetector – classify market into trending, range, panic, etc."""

import numpy as np
import logging
from typing import List

logger = logging.getLogger(__name__)

# Regimes
TRENDING = "trending"
RANGE = "range"
HIGH_VOLATILITY = "high_volatility"
LOW_LIQUIDITY = "low_liquidity"
PANIC = "panic"
BREAKOUT = "breakout"
UNKNOWN = "unknown"


class RegimeDetector:
    """Detect the current market regime from price and volume data."""

    def __init__(self, config: dict = None):
        config = config or {}
        self.volatility_panic_threshold: float = config.get("volatility_panic_threshold", 0.06)
        self.volatility_high_threshold: float = config.get("volatility_high_threshold", 0.03)
        self.trend_adx_threshold: float = config.get("trend_adx_threshold", 25.0)
        self.breakout_volume_ratio: float = config.get("breakout_volume_ratio", 2.5)
        self.lookback: int = config.get("lookback", 50)
        self._current_regime: str = UNKNOWN

    # ------------------------------------------------------------------
    def detect(self, closes: List[float], volumes: List[float] = None) -> str:
        """Classify the current market regime.

        Args:
            closes: list of recent close prices (at least self.lookback)
            volumes: optional list of volumes

        Returns:
            regime string: trending, range, high_volatility, panic, breakout, etc.
        """
        if len(closes) < self.lookback:
            return UNKNOWN

        arr = np.array(closes[-self.lookback:])
        returns = np.diff(arr) / arr[:-1]

        # Volatility (hourly std of returns)
        volatility = float(np.std(returns))

        # Panic: extreme volatility
        if volatility > self.volatility_panic_threshold:
            self._current_regime = PANIC
            logger.info("Regime: PANIC (vol=%.4f)", volatility)
            return PANIC

        # High volatility
        if volatility > self.volatility_high_threshold:
            # Check for breakout with volume
            if volumes and len(volumes) >= self.lookback:
                vol_arr = np.array(volumes[-self.lookback:])
                recent_vol = float(np.mean(vol_arr[-5:]))
                avg_vol = float(np.mean(vol_arr[:-5]))
                if avg_vol > 0 and recent_vol / avg_vol > self.breakout_volume_ratio:
                    self._current_regime = BREAKOUT
                    logger.info("Regime: BREAKOUT (vol=%.4f, vol_ratio=%.2f)", volatility, recent_vol/avg_vol)
                    return BREAKOUT

            self._current_regime = HIGH_VOLATILITY
            logger.info("Regime: HIGH_VOLATILITY (vol=%.4f)", volatility)
            return HIGH_VOLATILITY

        # Trend detection via directional movement
        adx = self._approx_adx(arr)
        if adx > self.trend_adx_threshold:
            self._current_regime = TRENDING
            logger.info("Regime: TRENDING (adx=%.2f)", adx)
            return TRENDING

        # Default: range-bound
        self._current_regime = RANGE
        logger.info("Regime: RANGE (adx=%.2f, vol=%.4f)", adx, volatility)
        return RANGE

    # ------------------------------------------------------------------
    @staticmethod
    def _approx_adx(prices: np.ndarray, period: int = 14) -> float:
        """Approximate ADX from price series."""
        if len(prices) < period + 1:
            return 0.0

        highs = np.maximum(prices[1:], prices[:-1])
        lows = np.minimum(prices[1:], prices[:-1])
        tr = highs - lows

        up_moves = np.diff(highs)
        down_moves = -np.diff(lows)

        plus_dm = np.where((up_moves > down_moves) & (up_moves > 0), up_moves, 0)
        minus_dm = np.where((down_moves > up_moves) & (down_moves > 0), down_moves, 0)

        # Simple smoothing
        n = min(period, len(tr) - 1, len(plus_dm))
        if n <= 0:
            return 0.0

        atr = float(np.mean(tr[-n:]))
        if atr == 0:
            return 0.0

        plus_di = float(np.mean(plus_dm[-n:])) / atr * 100
        minus_di = float(np.mean(minus_dm[-n:])) / atr * 100

        di_sum = plus_di + minus_di
        if di_sum == 0:
            return 0.0

        dx = abs(plus_di - minus_di) / di_sum * 100
        return dx

    @property
    def current_regime(self) -> str:
        return self._current_regime
