"""ATLAS — Autonomous Trading & Liquidity Analysis System.

Entry point.  Starts the autonomous trading engine loop.
Defaults to PAPER_MODE=true unless explicitly set to 'false'.

Usage:
    python -m backend.main
    # or
    PAPER_MODE=false python -m backend.main   # LIVE trading (use with caution)

Environment variables (see .env.local.example):
    SUPABASE_URL, SUPABASE_KEY
    KRAKEN_API_KEY, KRAKEN_SECRET
    OKX_API_KEY, OKX_SECRET, OKX_PASSPHRASE
    PAPER_MODE          (default: true)
    LOOP_INTERVAL       (default: 5 seconds)
    VOL_PAUSE           (default: 0.06 = 6 %)
    MAX_DAILY_TRADES    (default: 20)
    MAX_POS_PCT         (default: 0.03 = 3 %)
"""

import asyncio
import logging
import signal
import sys

from backend.engine.trading_engine import TradingEngine

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-7s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("atlas")


# ---------------------------------------------------------------------------
# Graceful shutdown
# ---------------------------------------------------------------------------
engine: TradingEngine | None = None


def _handle_signal(signum, frame):
    logger.info("Received signal %s — initiating shutdown", signum)
    if engine is not None:
        asyncio.ensure_future(engine.stop())


async def main():
    global engine

    logger.info("=" * 60)
    logger.info("  ATLAS — Autonomous Trading & Liquidity Analysis System")
    logger.info("=" * 60)

    engine = TradingEngine()

    # Register graceful shutdown handlers
    signal.signal(signal.SIGINT, _handle_signal)
    signal.signal(signal.SIGTERM, _handle_signal)

    try:
        await engine.run()
    except KeyboardInterrupt:
        logger.info("KeyboardInterrupt — shutting down")
        await engine.stop()
    except Exception as exc:
        logger.critical("Fatal error: %s", exc, exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
