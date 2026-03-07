"""PortfolioAgent – capital allocation, rebalancing & strategy weighting."""

import logging
from typing import Dict, List

logger = logging.getLogger(__name__)


class PortfolioAgent:
    """Manages capital allocation across strategies and rebalances exposure."""

    def __init__(self, config: dict = None):
        config = config or {}
        self.base_allocations: Dict[str, float] = config.get("allocations", {
            "momentum": 0.35,
            "mean_reversion": 0.25,
            "liquidation": 0.25,
            "whale_follow": 0.15,
        })
        self.max_single_position_pct: float = config.get("max_single_position_pct", 0.10)
        self.max_correlated_pct: float = config.get("max_correlated_pct", 0.30)
        self.min_trade_size_usd: float = config.get("min_trade_size_usd", 10.0)

        # Adaptive weights (updated by auto-learning)
        self._adaptive_weights: Dict[str, float] = dict(self.base_allocations)

    # ------------------------------------------------------------------
    def allocate(self, signals: list, portfolio: dict) -> list:
        """Allocate capital to each approved signal based on strategy weights.

        Args:
            signals: list of dicts with 'strategy', 'symbol', 'direction', 'confidence'
            portfolio: dict with 'value', 'positions' keys

        Returns:
            list of trade proposals with 'symbol', 'side', 'size_usd', 'strategy'
        """
        capital = portfolio.get("value", 0)
        if capital <= 0:
            return []

        existing_positions = portfolio.get("positions", {})
        approved = []

        for signal in signals:
            strat = signal.get("strategy", "")
            weight = self._adaptive_weights.get(strat, 0.1)
            strat_capital = capital * weight

            # Scale by confidence
            confidence = signal.get("confidence", 0.5)
            size_usd = strat_capital * confidence

            # Cap single position
            size_usd = min(size_usd, capital * self.max_single_position_pct)

            # Skip tiny trades
            if size_usd < self.min_trade_size_usd:
                continue

            # Check correlated exposure
            symbol = signal.get("symbol", "")
            existing_exposure = self._symbol_exposure(symbol, existing_positions, capital)
            if existing_exposure + size_usd > capital * self.max_correlated_pct:
                size_usd = max(0, capital * self.max_correlated_pct - existing_exposure)
                if size_usd < self.min_trade_size_usd:
                    continue

            approved.append({
                "symbol": symbol,
                "side": signal.get("direction", "long"),
                "size_usd": round(size_usd, 2),
                "strategy": strat,
                "confidence": confidence,
                "weight": weight,
            })

        logger.info("Portfolio allocated %d trades from %d signals", len(approved), len(signals))
        return approved

    # ------------------------------------------------------------------
    def update_weights(self, performance: Dict[str, dict]):
        """Auto-adjust strategy weights based on performance metrics.

        Args:
            performance: dict mapping strategy name -> {win_rate, profit_factor, sharpe}
        """
        scores = {}
        total = 0
        for strat, metrics in performance.items():
            win_rate = metrics.get("win_rate", 0.5)
            profit_factor = metrics.get("profit_factor", 1.0)
            # Weight formula: profit_factor * win_rate
            score = profit_factor * win_rate
            scores[strat] = max(score, 0.05)  # floor to prevent zeroing out
            total += scores[strat]

        if total > 0:
            for strat in scores:
                self._adaptive_weights[strat] = round(scores[strat] / total, 4)

        logger.info("Adaptive weights updated: %s", self._adaptive_weights)

    # ------------------------------------------------------------------
    @staticmethod
    def _symbol_exposure(symbol: str, positions: dict, capital: float) -> float:
        """Calculate current USD exposure to a symbol."""
        pos = positions.get(symbol, {})
        size = pos.get("size", 0)
        price = pos.get("current_price", 0)
        return abs(size * price)

    @property
    def current_weights(self) -> dict:
        return dict(self._adaptive_weights)
