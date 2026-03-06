"""MarketDataEngine – real-time OHLCV, order book, funding rates via CCXT."""

import asyncio
import time
import logging
from typing import Dict, List, Optional, Any

import ccxt.async_support as ccxt

from backend.engine.event_bus import EventBus, EventType

logger = logging.getLogger(__name__)


class MarketDataEngine:
    """Connects to multiple exchanges via CCXT and streams market data."""

    def __init__(self, config: dict, event_bus: EventBus):
        self.config = config
        self.event_bus = event_bus
        self.exchanges: Dict[str, ccxt.Exchange] = {}
        self.symbols: List[str] = config.get("symbols", ["BTC/USDT"])
        self.poll_interval: float = config.get("poll_interval", 5.0)
        self._running = False

        # Caches
        self._orderbooks: Dict[str, dict] = {}
        self._tickers: Dict[str, dict] = {}
        self._ohlcv: Dict[str, list] = {}
        self._funding_rates: Dict[str, float] = {}

    # ------------------------------------------------------------------
    async def start(self):
        """Initialise exchange connections and begin polling."""
        exchange_configs = self.config.get("exchanges", {})
        for name, exc_cfg in exchange_configs.items():
            cls = getattr(ccxt, name, None)
            if cls is None:
                logger.warning("Exchange %s not found in CCXT", name)
                continue
            self.exchanges[name] = cls({
                "apiKey": exc_cfg.get("api_key", ""),
                "secret": exc_cfg.get("secret", ""),
                "password": exc_cfg.get("password", ""),
                "enableRateLimit": True,
                "options": exc_cfg.get("options", {}),
            })
            logger.info("Connected to %s", name)

        self._running = True
        await asyncio.gather(
            self._poll_tickers(),
            self._poll_orderbooks(),
            self._poll_ohlcv(),
            self._poll_funding_rates(),
        )

    async def stop(self):
        """Gracefully close all exchange connections."""
        self._running = False
        for exchange in self.exchanges.values():
            await exchange.close()
        logger.info("MarketDataEngine stopped")

    # ------------------------------------------------------------------
    # Polling loops
    # ------------------------------------------------------------------
    async def _poll_tickers(self):
        while self._running:
            for name, exchange in self.exchanges.items():
                try:
                    for symbol in self.symbols:
                        ticker = await exchange.fetch_ticker(symbol)
                        key = f"{name}:{symbol}"
                        self._tickers[key] = ticker
                        await self.event_bus.publish(EventType.MARKET_DATA, {
                            "type": "ticker",
                            "exchange": name,
                            "symbol": symbol,
                            "price": ticker.get("last", 0),
                            "bid": ticker.get("bid", 0),
                            "ask": ticker.get("ask", 0),
                            "volume_24h": ticker.get("quoteVolume", 0),
                            "change_pct": ticker.get("percentage", 0),
                            "timestamp": time.time(),
                        })
                except Exception as exc:
                    logger.error("Ticker poll error %s: %s", name, exc)
            await asyncio.sleep(self.poll_interval)

    async def _poll_orderbooks(self):
        while self._running:
            for name, exchange in self.exchanges.items():
                try:
                    for symbol in self.symbols:
                        ob = await exchange.fetch_order_book(symbol, limit=25)
                        key = f"{name}:{symbol}"
                        self._orderbooks[key] = ob

                        bids = ob.get("bids", [])
                        asks = ob.get("asks", [])
                        bid_vol = sum(b[1] for b in bids[:10]) if bids else 0
                        ask_vol = sum(a[1] for a in asks[:10]) if asks else 0
                        total = bid_vol + ask_vol
                        imbalance = (bid_vol - ask_vol) / total if total else 0

                        await self.event_bus.publish(EventType.ORDER_FLOW, {
                            "exchange": name,
                            "symbol": symbol,
                            "bid_volume": bid_vol,
                            "ask_volume": ask_vol,
                            "imbalance": round(imbalance, 4),
                            "spread": (asks[0][0] - bids[0][0]) if bids and asks else 0,
                            "timestamp": time.time(),
                        })
                except Exception as exc:
                    logger.error("Orderbook poll error %s: %s", name, exc)
            await asyncio.sleep(self.poll_interval * 2)

    async def _poll_ohlcv(self):
        while self._running:
            for name, exchange in self.exchanges.items():
                try:
                    for symbol in self.symbols:
                        candles = await exchange.fetch_ohlcv(
                            symbol, timeframe="5m", limit=200
                        )
                        key = f"{name}:{symbol}"
                        self._ohlcv[key] = candles
                        closes = [c[4] for c in candles]
                        volumes = [c[5] for c in candles]

                        await self.event_bus.publish(EventType.MARKET_DATA, {
                            "type": "ohlcv",
                            "exchange": name,
                            "symbol": symbol,
                            "closes": closes,
                            "volumes": volumes,
                            "candles": candles[-5:],
                            "timestamp": time.time(),
                        })
                except Exception as exc:
                    logger.error("OHLCV poll error %s: %s", name, exc)
            await asyncio.sleep(self.poll_interval * 6)

    async def _poll_funding_rates(self):
        while self._running:
            for name, exchange in self.exchanges.items():
                try:
                    if not exchange.has.get("fetchFundingRate"):
                        continue
                    for symbol in self.symbols:
                        fr = await exchange.fetch_funding_rate(symbol)
                        rate = fr.get("fundingRate", 0) or 0
                        key = f"{name}:{symbol}"
                        self._funding_rates[key] = rate

                        await self.event_bus.publish(EventType.MARKET_DATA, {
                            "type": "funding_rate",
                            "exchange": name,
                            "symbol": symbol,
                            "funding_rate": rate,
                            "next_funding_time": fr.get("fundingDatetime"),
                            "timestamp": time.time(),
                        })
                except Exception as exc:
                    logger.error("Funding rate poll error %s: %s", name, exc)
            await asyncio.sleep(60)

    # ------------------------------------------------------------------
    # Public helpers
    # ------------------------------------------------------------------
    def get_latest_price(self, exchange: str, symbol: str) -> float:
        key = f"{exchange}:{symbol}"
        ticker = self._tickers.get(key, {})
        return ticker.get("last", 0)

    def get_orderbook(self, exchange: str, symbol: str) -> dict:
        return self._orderbooks.get(f"{exchange}:{symbol}", {})

    def get_closes(self, exchange: str, symbol: str) -> List[float]:
        candles = self._ohlcv.get(f"{exchange}:{symbol}", [])
        return [c[4] for c in candles]

    def get_funding_rate(self, exchange: str, symbol: str) -> float:
        return self._funding_rates.get(f"{exchange}:{symbol}", 0)

    def build_market_snapshot(self, exchange: str, symbol: str) -> dict:
        """Assemble a unified snapshot dict consumed by strategies."""
        key = f"{exchange}:{symbol}"
        ticker = self._tickers.get(key, {})
        ob = self._orderbooks.get(key, {})
        candles = self._ohlcv.get(key, [])
        closes = [c[4] for c in candles]
        volumes = [c[5] for c in candles]

        bids = ob.get("bids", [])
        asks = ob.get("asks", [])
        bid_vol = sum(b[1] for b in bids[:10]) if bids else 0
        ask_vol = sum(a[1] for a in asks[:10]) if asks else 0
        total = bid_vol + ask_vol

        return {
            "exchange": exchange,
            "symbol": symbol,
            "price": ticker.get("last", 0),
            "bid": ticker.get("bid", 0),
            "ask": ticker.get("ask", 0),
            "volume_24h": ticker.get("quoteVolume", 0),
            "closes": closes,
            "volumes": volumes,
            "bid_volume": bid_vol,
            "ask_volume": ask_vol,
            "order_flow_imbalance": (bid_vol - ask_vol) / total if total else 0,
            "funding_rate": self._funding_rates.get(key, 0),
            "timestamp": time.time(),
        }
