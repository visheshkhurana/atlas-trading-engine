"""LiveExecution — production order execution via OKX (primary).

OKX is used as the primary exchange for both spot (LONG) and
perpetual futures (SHORT) trades.  Kraken support is disabled
until keys are configured correctly.

Environment variables expected (match Vercel config):
    OKX_Keys          ->  OKX API key
    Okx_Secret_keys   ->  OKX API secret
    OKX_PASSPHRASE    ->  OKX passphrase (optional, defaults to "")
"""

import os
import time
import logging
from typing import Dict, Optional

import ccxt

logger = logging.getLogger(__name__)


class LiveExecution:
    """Real exchange execution via CCXT — OKX primary."""

    def __init__(self, config: dict = None):
        config = config or {}
        self._clients: Dict[str, ccxt.Exchange] = {}
        self._order_history: list = []

        # ── OKX (primary) ──────────────────────────────────────────
        okx_key = config.get("okx_api_key") or os.getenv("OKX_Keys", "")
        okx_secret = config.get("okx_secret") or os.getenv("Okx_Secret_keys", "")
        okx_passphrase = config.get("okx_passphrase") or os.getenv("OKX_PASSPHRASE", "")

        if okx_key and okx_secret:
            try:
                self._clients["okx"] = ccxt.okx({
                    "apiKey": okx_key,
                    "secret": okx_secret,
                    "password": okx_passphrase,
                    "options": {"defaultType": "swap"},  # perp by default
                    "enableRateLimit": True,
                })
                # Also create a spot client for LONG trades
                self._clients["okx_spot"] = ccxt.okx({
                    "apiKey": okx_key,
                    "secret": okx_secret,
                    "password": okx_passphrase,
                    "options": {"defaultType": "spot"},
                    "enableRateLimit": True,
                })
                logger.info("OKX clients initialized (spot + perp)")
            except Exception as exc:
                logger.error("OKX init failed: %s", exc)
        else:
            logger.warning("OKX keys not found — execution will be paper-only")

        # ── Kraken (disabled for now) ──────────────────────────────
        # Will be enabled when Kraken keys are properly configured
        # kraken_key = os.getenv("KRAKEN_API_KEY", "")
        # kraken_secret = os.getenv("KRAKEN_SECRET", "")

    @property
    def available_exchanges(self) -> list:
        return list(self._clients.keys())

    def _get_client(self, exchange: str, side: str = "buy") -> Optional[ccxt.Exchange]:
        """Get the right OKX client based on trade side.
        
        LONG (buy)  -> OKX spot
        SHORT (sell) -> OKX perp (swap)
        """
        if side in ("buy", "long"):
            client = self._clients.get("okx_spot")
            if client:
                return client
        # For short / sell, use perp
        client = self._clients.get("okx")
        if client:
            return client
        # Fallback to any available
        if self._clients:
            return next(iter(self._clients.values()))
        return None

    def place_order(
        self,
        exchange: str,
        symbol: str,
        side: str,
        amount: float,
        order_type: str = "market",
        price: float = None,
    ) -> dict:
        """Place an order on OKX.
        
        Args:
            exchange: exchange name (will use OKX regardless for now)
            symbol: trading pair e.g. 'BTC/USDT'
            side: 'buy'/'long' or 'sell'/'short'
            amount: order size
            order_type: 'market' or 'limit'
            price: limit price (required for limit orders)
        """
        # Normalise side
        normalised_side = "buy" if side in ("buy", "long") else "sell"
        
        client = self._get_client(exchange, normalised_side)
        if client is None:
            logger.error("No exchange client available for %s", exchange)
            return {"status": "error", "message": "No exchange client"}

        try:
            logger.info(
                "Placing %s %s order: %s %.6f on OKX",
                order_type.upper(), normalised_side.upper(), symbol, amount,
            )

            if order_type == "limit" and price:
                order = client.create_order(
                    symbol=symbol,
                    type="limit",
                    side=normalised_side,
                    amount=amount,
                    price=price,
                )
            else:
                order = client.create_order(
                    symbol=symbol,
                    type="market",
                    side=normalised_side,
                    amount=amount,
                )

            result = {
                "order_id": order.get("id"),
                "symbol": symbol,
                "side": normalised_side,
                "amount": amount,
                "price": order.get("average") or order.get("price") or price or 0,
                "status": order.get("status", "filled"),
                "exchange": "okx",
                "filled": order.get("filled", amount),
                "timestamp": time.time(),
                "raw": order,
            }

            self._order_history.append(result)
            logger.info(
                "Order filled: %s %s %.6f @ %.2f on OKX",
                normalised_side.upper(), symbol, amount, result["price"],
            )
            return result

        except ccxt.InsufficientFunds as exc:
            logger.error("Insufficient funds: %s", exc)
            return {"status": "error", "message": f"Insufficient funds: {exc}"}
        except ccxt.InvalidOrder as exc:
            logger.error("Invalid order: %s", exc)
            return {"status": "error", "message": f"Invalid order: {exc}"}
        except ccxt.NetworkError as exc:
            logger.error("Network error: %s", exc)
            return {"status": "error", "message": f"Network error: {exc}"}
        except Exception as exc:
            logger.error("Order failed: %s", exc)
            return {"status": "error", "message": str(exc)}

    def get_balance(self, exchange: str = "okx") -> dict:
        """Fetch account balance from OKX."""
        client = self._clients.get("okx_spot") or self._clients.get("okx")
        if client is None:
            return {"error": "No client available"}
        try:
            balance = client.fetch_balance()
            return {
                "total": balance.get("total", {}),
                "free": balance.get("free", {}),
                "used": balance.get("used", {}),
            }
        except Exception as exc:
            logger.error("Balance fetch failed: %s", exc)
            return {"error": str(exc)}

    def get_open_positions(self) -> list:
        """Fetch open positions from OKX perp."""
        client = self._clients.get("okx")
        if client is None:
            return []
        try:
            positions = client.fetch_positions()
            return [
                {
                    "symbol": p["symbol"],
                    "side": p["side"],
                    "size": p["contracts"],
                    "entry_price": p["entryPrice"],
                    "unrealized_pnl": p["unrealizedPnl"],
                    "leverage": p["leverage"],
                }
                for p in positions
                if p.get("contracts") and float(p["contracts"]) > 0
            ]
        except Exception as exc:
            logger.error("Positions fetch failed: %s", exc)
            return []

    def cancel_order(self, symbol: str, order_id: str, exchange: str = "okx") -> dict:
        """Cancel an open order."""
        client = self._clients.get("okx") or self._clients.get("okx_spot")
        if client is None:
            return {"error": "No client"}
        try:
            result = client.cancel_order(order_id, symbol)
            return {"status": "cancelled", "order_id": order_id, "raw": result}
        except Exception as exc:
            logger.error("Cancel failed: %s", exc)
            return {"error": str(exc)}

    @property
    def order_history(self) -> list:
        return list(self._order_history)
