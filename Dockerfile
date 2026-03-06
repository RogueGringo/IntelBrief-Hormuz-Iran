FROM node:20-slim AS frontend
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY public/ ./public/
COPY src/ ./src/
RUN npm run build

FROM python:3.11-slim

# HF Spaces requires user ID 1000
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user PATH=/home/user/.local/bin:$PATH
ENV LOG_LEVEL=INFO
ENV CORS_ORIGINS=*
WORKDIR $HOME/app

# Install sovereign-lib first (changes less often)
COPY --chown=user sovereign-lib/ ./sovereign-lib/
RUN pip install --no-cache-dir -e ./sovereign-lib

# Install backend dependencies
COPY --chown=user hf-proxy/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY --chown=user hf-proxy/*.py ./
COPY --chown=user --from=frontend /build/dist $HOME/app/static

# Create data directory with correct ownership
RUN mkdir -p $HOME/app/data

EXPOSE 7860
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:7860/api/health')" || exit 1
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860", "--log-level", "info"]
