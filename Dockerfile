FROM node:20-slim AS frontend
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY src/ ./src/
# Build with base=/ since HF Space serves at root
RUN sed -i "s|base: '/IntelBrief-Hormuz-Iran/'|base: '/'|" vite.config.js && npm run build

FROM python:3.11-slim

# HF Spaces requires user ID 1000
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user PATH=/home/user/.local/bin:$PATH
WORKDIR $HOME/app

COPY --chown=user hf-proxy/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY --chown=user hf-proxy/app.py .
COPY --chown=user --from=frontend /build/dist $HOME/app/static
EXPOSE 7860
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]
