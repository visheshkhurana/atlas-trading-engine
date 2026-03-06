"""ExchangeConnector – order execution with paper-trading fallback."""

import asyncio
import time
import logging
from typing import Dict, Optional

import ccxt.async_support as ccxt

logger = logging.getLogger(__name__)


class ExchangeConnector:
    """Unified order execution across exchanges with paper trading mode."""

    def __init__(self, config: dict):
        self.config = config
        self.paper_mode: bool = config.get("paper_mode", True)
        self.exchanges: Dict[str, ccxt.Exchange] = {}

        # Paper trading state
        self._paper_orders: list = []
        self._paper_balance: float = config.get("initial_capital", 10_000)
        self._order_id_counter: int = 0

    # ------------------------------------------------------------------
    async def start(self):
        if self.paper_mode:
            logger.info("ExchangeConnector running in PAPER mode")
            return

        exchange_configs = self.config.get("exchanges", {})
        for name, exc_cfg in exchange_configs.items():
            cls = getattr(ccxt, name, None)
            if cls is None:
                continue
            self.exchanges[name] = cls({
                "apiKey": exc_cfg.get("api_key", ""),
                "secret": exc_cfg.get("secret", ""),
                "password": exc_cfg.get("password", ""),
                "enableRateLimit": True,
                "options": exc_cfg.get("options", {}),
            })
            logger.info("ExchangeConnector: connected to %s", name)

    async def stop(self):
        for exchange in self.exchanges.values():
            await exchange.close()
        logger.info("ExchangeConnector stopped")

    # ------------------------------------------------------------------
    # Order Methods
    # ------------------------------------------------------------------
    async def place_order(
        self,
        exchange: str,
        symbol: str,
        side: str,  # "buy" or "sell"
        amount: float,
        order_type: str = "market",
        price: Optional[float] = None,
        leverage: float = 1.0,
    ) -> dict:
        """Place an order on the specified exchange."""
        if self.paper_mode:
            return self._paper_order(exchange, symbol, side, amount, order_type, price)

        exc = self.exchanges.get(exchange)
        if exc is None:
            return {"error": f"Exchange {exchange} not connected"}

        try:
            # Set leverage if supported
            if leverage > 1.0 and hasattr(exc, "set_leverage"):
                try:
                    await exc.set_leverage(leverage, symbol)
                except Exception:
                    pass  # Not all exchanges support this

            params = {}
            if order_type == "market":
                order = await exc.create_market_order(symbol, side, amount, params=params)
            elif order_type == "limit" and price:
                order = await exc.create_limit_order(symbol, side, amount, price, params=params)
            else:
                return {"error": f"Unsupported order type: {order_type}"}

            logger.info(
                "Order placed: %s %s %s %.6f on %s – id=%s",
                order_type, side, symbol, amount, exchange, order.get("id"),
            )
            return {
                "order_id": order.get("id"),
                "exchange": exchange,
                "symbol": symbol,
                "side": side,
                "amount": amount,
                "type": order_type,
                "price": order.get("average") or order.get("price") or price,
                "status": order.get("status", "open"),
                "timestamp": time.time(),
            }
        except Exception as exc_err:
            logger.error("Order failed: %s", exc_err)
            return {"error": str(exc_err)}

    async def cancel_order(self, exchange: str, order_id: str, symbol: str) -> dict:
        if self.paper_mode:
            return {"order_id": order_id, "status": "cancelled"}

        exc = self.exchanges.get(exchange)
        if exc is None:
            return {"error": f"Exchange {exchange} not connected"}
        try:
            result = await exc.cancel_order(order_id, symbol)
            return {"order_id": order_id, "status": "cancelled", "result": result}
        except Exception as e:
            return {"error": str(e)}

    async def get_balance(self, exchange: str) -> dict:
        if self.paper_mode:
            return {"USDT": {"free": self._paper_balance, "total": self._paper_balance}}

        exc = self.exchanges.get(exchange)
        if exc is None:
            return {}
        try:
            balance = await exc.fetch_balance()
            return balance.get("total", {})
        except Exception as e:
            logger.error("Balance fetch error: %s", e)
            return {}

    # ------------------------------------------------------------------
    # Paper Trading
    # ------------------------------------------------------------------
    def _paper_order(
        self, exchange: str, symbol: str, side: str,
        amount: float, order_type: str, price: Optional[float],
    ) -> dict:
        self._order_id_counter += 1
        order_id = f"paper_{self._order_id_counter}"
        fill_price = price or 0  # In real paper mode, use last known price

        order = {
            "order_id": order_id,
            "exchange": exchange,
            "symbol": symbol,
            "side": side,
            "amount": amount,
            "type": order_type,
            "price": fill_price,
            "status": "filled",
            "paper": True,
            "timestamp": time.time(),
        }
        self._paper_orders.append(order)
        logger.info("[PAPER] %s %s %.6f %s @ %.2f", side, symbol, amount, order_type, fill_price)
        return order

    def get_paper_orders(self) -> list:
        return list(self._paper_orders)
