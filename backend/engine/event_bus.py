import asyncio
import logging
from typing import Dict, List, Callable, Any
from datetime import datetime

logger = logging.getLogger(__name__)


class Event:
    def __init__(self, event_type: str, data: Any, source: str = "system"):
        self.event_type = event_type
        self.data = data
        self.source = source
        self.timestamp = datetime.utcnow()
        self.id = f"{event_type}_{self.timestamp.timestamp()}"


class EventBus:
    def __init__(self):
        self.subscribers: Dict[str, List[Callable]] = {}
        self.event_history: List[Event] = []
        self.max_history = 1000

    def subscribe(self, event_type: str, handler: Callable):
        if event_type not in self.subscribers:
            self.subscribers[event_type] = []
        self.subscribers[event_type].append(handler)
        logger.info(f"Subscribed {handler.__name__} to {event_type}")

    def unsubscribe(self, event_type: str, handler: Callable):
        if event_type in self.subscribers:
            self.subscribers[event_type].remove(handler)

    async def publish(self, event_type: str, data: Any, source: str = "system"):
        event = Event(event_type, data, source)
        self.event_history.append(event)
        if len(self.event_history) > self.max_history:
            self.event_history = self.event_history[-self.max_history:]
        if event_type in self.subscribers:
            tasks = []
            for handler in self.subscribers[event_type]:
                try:
                    if asyncio.iscoroutinefunction(handler):
                        tasks.append(handler(event))
                    else:
                        handler(event)
                except Exception as e:
                    logger.error(f"Handler {handler.__name__} failed: {e}")
            if tasks:
                await asyncio.gather(*tasks, return_exceptions=True)

    def get_history(self, event_type: str = None, limit: int = 100):
        if event_type:
            return [e for e in self.event_history if e.event_type == event_type][-limit:]
        return self.event_history[-limit:]


# Event type constants
MARKET_DATA_UPDATE = "market_data_update"
ORDER_BOOK_UPDATE = "order_book_update"
TRADE_SIGNAL = "trade_signal"
TRADE_EXECUTED = "trade_executed"
POSITION_UPDATE = "position_update"
RISK_ALERT = "risk_alert"
PORTFOLIO_UPDATE = "portfolio_update"
SYSTEM_ALERT = "system_alert"
WHALE_ALERT = "whale_alert"
LIQUIDATION_EVENT = "liquidation_event"
