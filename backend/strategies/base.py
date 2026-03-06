from abc import ABC, abstractmethod
from typing import Dict, Optional
from datetime import datetime


class Signal:
    def __init__(self, direction: str, confidence: float, strategy: str,
                 symbol: str, exchange: str, metadata: Dict = None):
        self.direction = direction
        self.confidence = confidence
        self.strategy = strategy
        self.symbol = symbol
        self.exchange = exchange
        self.metadata = metadata or {}
        self.timestamp = datetime.utcnow()

    def to_dict(self):
        return {
            "direction": self.direction,
            "confidence": self.confidence,
            "strategy": self.strategy,
            "symbol": self.symbol,
            "exchange": self.exchange,
            "metadata": self.metadata,
            "timestamp": self.timestamp.isoformat(),
        }


class Strategy(ABC):
    def __init__(self, name: str, weight: float = 1.0):
        self.name = name
        self.weight = weight
        self.enabled = True

    @abstractmethod
    def generate_signal(self, market_state: Dict) -> Optional[Signal]:
        raise NotImplementedError

    def __repr__(self):
        return f"Strategy({self.name}, weight={self.weight})"
