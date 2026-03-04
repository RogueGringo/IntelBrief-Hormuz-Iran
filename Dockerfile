FROM node:20-slim AS frontend
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*
WORKDIR /build
ADD https://api.github.com/repos/RogueGringo/IntelBrief-Hormuz-Iran/git/refs/heads/main /tmp/cachebust.json
RUN git clone --depth 1 https://github.com/RogueGringo/IntelBrief-Hormuz-Iran.git .
RUN npm ci
# Build with base=/ since HF Space serves at root
RUN sed -i "s|base: '/IntelBrief-Hormuz-Iran/'|base: '/'|" vite.config.js && npm run build

FROM python:3.11-slim
WORKDIR /app
COPY --from=frontend /build/hf-proxy/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY --from=frontend /build/hf-proxy/app.py .
COPY --from=frontend /build/dist /app/static
EXPOSE 7860
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
