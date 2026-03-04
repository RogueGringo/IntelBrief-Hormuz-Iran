FROM node:20-slim AS frontend
WORKDIR /build
COPY package.json package-lock.json* ./
RUN npm ci
COPY index.html vite.config.js ./
COPY src/ src/
# Build with base=/ since HF Space serves at root
RUN sed -i "s|base: '/IntelBrief-Hormuz-Iran/'|base: '/'|" vite.config.js && npm run build

FROM python:3.11-slim
WORKDIR /app
COPY hf-proxy/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY hf-proxy/app.py .
COPY --from=frontend /build/dist /app/static
EXPOSE 7860
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
