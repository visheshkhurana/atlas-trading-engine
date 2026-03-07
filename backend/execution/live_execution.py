"""LiveExecution – production order execution for Kraken & OKX."""

import os
import time
import logging
from typing import Dict, Optional

import ccxt

logger = logging.getLogger(__name__)


class LiveExecution:
    """Real exchange execution via CCXT for Kraken and OKX."""

    def __init__(self, config: dict = None):
        config = config or {}
        self._clients: Dict[str, ccxt.Exchange] = {}
        self._order_history: list = []

        # Kraken
        kraken_key = config.get("kraken_api_key") or os.getenv("KRAKEN_API_KEY", "")
        kraken_secret = config.get("kraken_secret") or os.getenv("KRAKEN_SECRET", "")
        if kraken_key and kraken_secret:
            self._clients["kraken"] = ccxt.kraken({
                "apiKey": kraken_key,
                "secret": kraken_secret,
                "enableRateLimit": True,
            })
            logger.info("Kraken live execution ready")

        # OKX
        okx_key = config.get("okx_api_key") or os.getenv("OKX_API_KEY", "")
        okx_secret = config.get("okx_secret") or os.getenv("OKX_SECRET", "")
        okx_pass = config.get("okx_passphrase") or os.getenv("OKX_PASSPHRASE", "")
        if okx_key and okx_secret:
            self._clients["okx"] = ccxt.okx({
                "apiKey": okx_key,
                "secret": okx_secret,
                "password": okx_pass,
                "enableRateLimit": True,
            })
            logger.info("OKX live execution ready")

        if not self._clients:
            logger.warning("No exchange API keys configured – live execution disabled")

    # ------------------------------------------------------------------
    def place_order(
        self,
        exchange: str,
        symbol: str,
        side: str,
        size: float,
        order_type: str = "market",
        price: Optional[float] = None,
        leverage: float = 1.0,
    ) -> dict:
        """Place a live order on the specified exchange."""
        client = self._clients.get(exchange)
        if client is None:
            return {"error": f"Exchange {exchange} not configured"}

        try:
            # Set leverage if supported
            if leverage > 1.0:
                try:
                    client.set_leverage(leverage, symbol)
                except Exception:
                    logger.debug("Leverage setting not supported on %s", exchange)

            if order_type == "market":
                order = client.create_market_order(
                    symbol=symbol, side=side, amount=size,
                )
            elif order_type == "limit" and price is not None:
                order = client.create_limit_order(
                    symbol=symbol, side=side, amount=size, price=price,
                )
            else:
                return {"error": f"Invalid order_type={order_type} or missing price"}

            result = {
                "order_id": order.get("id"),
                "exchange": exchange,
                "symbol": symbol,
                "side": side,
                "amount": size,
                "type": order_type,
                "price": order.get("average") or order.get("price") or price,
                "status": order.get("status", "unknown"),
                "fee": order.get("fee", {}),
                "timestamp": time.time(),
                "raw": order,
            }
            self._order_history.append(result)
            logger.info(
                "[LIVE] %s %s %.6f %s on %s – id=%s price=%s",
                side.upper(), symbol, size, order_type, exchange,
                result["order_id"], result["price"],
            )
            return result

        except ccxt.InsufficientFunds as e:
            logger.error("Insufficient funds on %s: %s", exchange, e)
            return {"error": f"Insufficient funds: {e}"}
        except ccxt.InvalidOrder as e:
            logger.error("Invalid order on %s: %s", exchange, e)
            return {"error": f"Invalid order: {e}"}
        except ccxt.NetworkError as e:
            logger.error("Network error on %s: %s", exchange, e)
            return {"error": f"Network error: {e}"}
        except Exception as e:
            logger.error("Order failed on %s: %s", exchange, e)
            return {"error": str(e)}

    # ------------------------------------------------------------------
    def cancel_order(self, exchange: str, order_id: str, symbol: str) -> dict:
        client = self._clients.get(exchange)
        if client is None:
            return {"error": f"Exchange {exchange} not configured"}
        try:
            result = client.cancel_order(order_id, symbol)
            return {"order_id": order_id, "status": "cancelled", "raw": result}
        except Exception as e:
            return {"error": str(e)}

    def get_balance(self, exchange: str) -> dict:
        client = self._clients.get(exchange)
        if client is None:
            return {}
        try:
            balance = client.fetch_balance()
            return {
                "free": balance.get("free", {}),
                "used": balance.get("used", {}),
                "total": balance.get("total", {}),
            }
        except Exception as e:
            logger.error("Balance fetch error on %s: %s", exchange, e)
            return {"error": str(e)}

    def get_open_orders(self, exchange: str, symbol: str = None) -> list:
        client = self._clients.get(exchange)
        if client is None:
            return []
        try:
            return client.fetch_open_orders(symbol)
        except Exception as e:
            logger.error("Open orders fetch error: %s", e)
            return []

    def get_positions(self, exchange: str) -> list:
        client = self._clients.get(exchange)
        if client is None:
            return []
        try:
            if hasattr(client, "fetch_positions"):
                return client.fetch_positions()
            return []
        except Exception as e:
            logger.error("Positions fetch error: %s", e)
            return []

    @property
    def available_exchanges(self) -> list:
        return list(self._clients.keys())

    @property
    def order_history(self) -> list:
        return list(self._order_history)
