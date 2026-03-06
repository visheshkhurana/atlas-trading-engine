"""ATLAS Trading Engine – entry point."""

import asyncio
import json
import logging
import os
import signal
import sys

from backend.engine.trading_engine import TradingEngine

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("atlas.log", mode="a"),
    ],
)
logger = logging.getLogger("atlas")

# ---------------------------------------------------------------------------
# Default configuration
# ---------------------------------------------------------------------------
DEFAULT_CONFIG = {
    "cycle_interval": 10.0,
    "min_consensus": 2,
    "min_confidence": 0.5,
    "market_data": {
        "symbols": ["BTC/USDT", "ETH/USDT"],
        "poll_interval": 5.0,
        "exchanges": {
            # Add exchange credentials via environment variables
            # "hyperliquid": {"api_key": "", "secret": ""},
            # "kraken": {"api_key": "", "secret": ""},
        },
    },
    "strategies": {
        "momentum": {
            "fast_period": 12,
            "slow_period": 26,
            "signal_period": 9,
            "volume_confirm": True,
            "min_volume_ratio": 1.5,
        },
        "mean_reversion": {
            "bb_period": 20,
            "bb_std": 2.0,
            "zscore_entry": 2.0,
            "zscore_exit": 0.5,
            "lookback": 100,
        },
        "liquidation": {
            "liq_threshold": 0.6,
            "funding_extreme": 0.01,
            "min_cluster_size": 1_000_000,
        },
        "whale_follow": {
            "whale_threshold_usd": 500_000,
            "flow_imbalance_threshold": 0.3,
            "min_whale_count": 3,
        },
    },
    "risk": {
        "initial_capital": 10_000,
        "max_position_pct": 0.02,
        "max_portfolio_risk": 0.06,
        "max_leverage": 3.0,
        "max_drawdown_pct": 0.10,
        "max_open_positions": 5,
        "daily_loss_limit": 0.05,
    },
    "execution": {
        "paper_mode": True,
        "initial_capital": 10_000,
        "exchanges": {},
    },
}


def load_config() -> dict:
    """Load config from file or environment, falling back to defaults."""
    config_path = os.environ.get("ATLAS_CONFIG", "config.json")
    if os.path.exists(config_path):
        with open(config_path) as f:
            user_config = json.load(f)
        # Merge user config over defaults
        merged = {**DEFAULT_CONFIG, **user_config}
        logger.info("Config loaded from %s", config_path)
        return merged
    logger.info("Using default configuration (paper mode)")
    return DEFAULT_CONFIG


async def run():
    config = load_config()
    engine = TradingEngine(config)

    # Graceful shutdown
    loop = asyncio.get_running_loop()

    def _shutdown():
        logger.info("Shutdown signal received")
        asyncio.create_task(engine.stop())

    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, _shutdown)

    logger.info("=" * 60)
    logger.info("  ATLAS – Autonomous Trading & Liquidity Analysis System")
    logger.info("  Paper Mode: %s", config["execution"]["paper_mode"])
    logger.info("  Symbols: %s", config["market_data"]["symbols"])
    logger.info("=" * 60)

    await engine.start()


if __name__ == "__main__":
    asyncio.run(run())
