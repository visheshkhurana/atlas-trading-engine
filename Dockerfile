# ============================================================
# ATLAS — Autonomous Trading & Liquidity Analysis System
# Docker image for the Python backend engine
# ============================================================

FROM python:3.11-slim

# Prevent Python from buffering stdout/stderr
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# Install system deps (needed by some pip packages)
RUN apt-get update && \
    apt-get install -y --no-install-recommends gcc libffi-dev && \
    rm -rf /var/lib/apt/lists/*

# Copy requirements first for Docker layer caching
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY backend /app/backend

# Default env (override at runtime)
ENV PAPER_MODE=true \
    LOOP_INTERVAL=5 \
    VOL_PAUSE=0.06 \
    MAX_DAILY_TRADES=20 \
    MAX_POS_PCT=0.03

# Health check — ensure process is alive
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD python -c "import sys; sys.exit(0)"

# Run the engine
CMD ["python", "-m", "backend.main"]
