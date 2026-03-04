"""
Valor Intelligence Proxy — Hugging Face Space backend.

Serves as a CORS-free proxy for the static dashboard:
  /api/feeds   — Aggregated RSS feeds, classified as effect/event
  /api/prices  — Real-time commodity prices (Brent, WTI, OVX)
  /api/health  — Service status

Deploy to HF Spaces (Docker SDK) and point the dashboard at it.
"""

import os
import time
import json
import re
import math
from datetime import datetime, timezone

import feedparser
import yfinance as yf
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

app = FastAPI(title="Valor Intelligence Proxy", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

# ─── CONFIGURATION ────────────────────────────────────────────
FEED_SOURCES = [
    {"id": "google-hormuz", "name": "Google News — Hormuz",
     "url": "https://news.google.com/rss/search?q=strait+of+hormuz+oil+tanker&hl=en-US&gl=US&ceid=US:en",
     "category": "maritime", "priority": 1},
    {"id": "google-iran-oil", "name": "Google News — Iran Oil",
     "url": "https://news.google.com/rss/search?q=iran+oil+sanctions+energy&hl=en-US&gl=US&ceid=US:en",
     "category": "macro", "priority": 1},
    {"id": "google-crude-oil", "name": "Google News — Crude Oil",
     "url": "https://news.google.com/rss/search?q=crude+oil+brent+wti+price&hl=en-US&gl=US&ceid=US:en",
     "category": "price", "priority": 1},
    {"id": "google-tanker-shipping", "name": "Google News — Tanker Shipping",
     "url": "https://news.google.com/rss/search?q=tanker+shipping+VLCC+freight+rates&hl=en-US&gl=US&ceid=US:en",
     "category": "maritime", "priority": 2},
    {"id": "google-oil-supply", "name": "Google News — Oil Supply",
     "url": "https://news.google.com/rss/search?q=oil+production+rig+count+EIA+SPR&hl=en-US&gl=US&ceid=US:en",
     "category": "supply", "priority": 2},
    {"id": "eia-twip", "name": "EIA — This Week in Petroleum",
     "url": "https://www.eia.gov/petroleum/weekly/includes/twip_rss.xml",
     "category": "supply", "priority": 2},
    {"id": "gcaptain", "name": "gCaptain — Maritime News",
     "url": "https://gcaptain.com/feed/",
     "category": "maritime", "priority": 2},
    {"id": "maritime-exec", "name": "The Maritime Executive",
     "url": "https://maritime-executive.com/rss",
     "category": "maritime", "priority": 3},
    {"id": "oilprice", "name": "OilPrice.com",
     "url": "https://oilprice.com/rss/main",
     "category": "price", "priority": 3},
]

COMMODITY_SYMBOLS = {
    "brent": "BZ=F",
    "wti": "CL=F",
    "ovx": "^OVX",
}

# ─── CACHING ──────────────────────────────────────────────────
_cache = {}

def get_cached(key, ttl_seconds):
    entry = _cache.get(key)
    if not entry:
        return None
    if time.time() - entry["stored_at"] > ttl_seconds:
        return None
    return entry["data"]

def set_cache(key, data):
    _cache[key] = {"data": data, "stored_at": time.time()}


# ─── KEYWORD CLASSIFICATION ──────────────────────────────────
WORD_BOUNDARY_SET = {"if", "may", "says", "ais", "spr", "duc", "bbl"}

EFFECT_KEYWORDS = [
    "transit", "ais", "insurance", "p&i", "coverage", "vlcc", "freight",
    "force majeure", "spr", "drawdown", "rig count", "duc", "backwardation",
    "pipeline", "bpd", "production", "inventory", "withdrawn", "suspended",
    "collapsed", "stranded", "utilization", "capacity", "barrels", "tanker",
    "vessel", "rates", "premium", "reinsurance", "spread", "curve", "netback",
    "breakeven", "measured", "tonnage", "loading", "discharge",
    "shut-in", "flaring", "refinery", "throughput", "storage",
    "exports", "imports", "shipments", "cargo", "demurrage", "charter",
    "strait", "hormuz", "closure", "blockade",
    "sanctions", "embargo", "quota", "allocation",
    "million barrels", "bbl", "per day", "daily",
]

EVENT_KEYWORDS = [
    "announced", "predicted", "analysts say", "expected", "could", "might",
    "sources say", "reportedly", "sentiment", "fears", "hopes", "rally",
    "tumble", "surge", "plunge", "breaking", "rumor", "speculation",
    "believes", "opinion", "according to", "may", "possibly", "likely",
    "forecast", "projected", "risk of", "warns", "caution", "concerned",
    "worried", "optimistic", "pessimistic", "bullish", "bearish", "mood",
    "says", "thinks", "suggests", "imagine", "if",
]

CHAIN_TERMS = {
    "Maritime Insurance Cascade": ["insurance", "p&i", "coverage", "withdrawn", "reinsurance", "premium", "hull", "war risk", "club", "lloyd"],
    "Physical Flow Cascade": ["transit", "ais", "tanker", "vessel", "stranded", "vlcc", "freight", "pipeline", "tonnage", "loading", "cargo", "draft", "hormuz", "strait", "shipping", "blockade"],
    "Price Architecture Cascade": ["brent", "wti", "spread", "backwardation", "curve", "netback", "breakeven", "ovx", "futures", "contango", "oil price", "crude price", "barrel"],
    "Supply Constraint Cascade": ["rig count", "duc", "production", "bpd", "capacity", "frac", "drilling", "completions", "shut-in", "spr", "reserve", "opec", "output"],
}

def matches_keyword(text_lower, keyword):
    if keyword in WORD_BOUNDARY_SET:
        return bool(re.search(rf"\b{re.escape(keyword)}\b", text_lower))
    return keyword in text_lower

def classify_text(text):
    if not text:
        return {"classification": "MIXED", "score": 0, "effectHits": [], "eventHits": [], "chainMap": [], "confidence": 0}
    lower = text.lower()
    effect_hits = [k for k in EFFECT_KEYWORDS if matches_keyword(lower, k)]
    event_hits = [k for k in EVENT_KEYWORDS if matches_keyword(lower, k)]
    total = len(effect_hits) + len(event_hits)
    score = (len(effect_hits) - len(event_hits)) / total if total > 0 else 0
    chains = [name for name, terms in CHAIN_TERMS.items() if any(matches_keyword(lower, t) for t in terms)]
    return {
        "classification": "EFFECT" if score > 0.15 else ("EVENT" if score < -0.15 else "MIXED"),
        "score": round(score, 3),
        "effectHits": effect_hits,
        "eventHits": event_hits,
        "chainMap": chains,
        "confidence": min(100, round((total / 8) * 100)) if total > 0 else 0,
    }


# ─── FEED ENDPOINT ────────────────────────────────────────────
@app.get("/api/feeds")
async def get_feeds():
    cached = get_cached("feeds", 180)  # 3 min TTL
    if cached:
        return JSONResponse({**cached, "source": "cached"})

    all_items = []
    source_status = {}

    for src in sorted(FEED_SOURCES, key=lambda s: s["priority"]):
        try:
            feed = feedparser.parse(src["url"])
            entries = feed.entries[:8]
            if not entries:
                source_status[src["id"]] = {"ok": False, "error": "Empty feed"}
                continue
            source_status[src["id"]] = {"ok": True, "count": len(entries)}
            for entry in entries:
                title = getattr(entry, "title", "") or ""
                desc = getattr(entry, "summary", "") or ""
                desc = re.sub(r"<[^>]*>", "", desc).strip()
                link = getattr(entry, "link", "") or ""
                pub = getattr(entry, "published", "") or ""
                classification = classify_text(title + " " + desc)
                all_items.append({
                    "title": title,
                    "description": desc[:500],
                    "link": link,
                    "pubDate": pub,
                    "source": src["name"],
                    "sourceId": src["id"],
                    "category": src["category"],
                    **classification,
                })
        except Exception as e:
            source_status[src["id"]] = {"ok": False, "error": str(e)[:100]}

    # Sort by date, deduplicate
    def safe_ts(item):
        try:
            from email.utils import parsedate_to_datetime
            return parsedate_to_datetime(item["pubDate"]).timestamp()
        except Exception:
            return 0
    all_items.sort(key=safe_ts, reverse=True)

    seen = set()
    deduped = []
    for item in all_items:
        key = re.sub(r"[^a-z0-9]", "", item["title"].lower())[:60]
        if key not in seen:
            seen.add(key)
            deduped.append(item)

    payload = {
        "items": deduped,
        "sourceStatus": source_status,
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "liveCount": sum(1 for s in source_status.values() if s.get("ok")),
        "totalSources": len(FEED_SOURCES),
        "source": "live" if deduped else "unavailable",
    }
    if deduped:
        set_cache("feeds", payload)
    return JSONResponse(payload)


# ─── PRICE ENDPOINT ───────────────────────────────────────────
@app.get("/api/prices")
async def get_prices():
    cached = get_cached("prices", 120)  # 2 min TTL
    if cached:
        return JSONResponse({**cached, "source": "cached"})

    prices = {}
    now = datetime.now(timezone.utc).isoformat()

    for name, symbol in COMMODITY_SYMBOLS.items():
        try:
            ticker = yf.Ticker(symbol)
            info = ticker.fast_info
            price = getattr(info, "last_price", None)
            if price is not None and not math.isnan(price):
                prices[name] = {
                    "price": round(float(price), 2),
                    "source": "live",
                    "fetchedAt": now,
                }
        except Exception:
            pass

    # Derived values
    if "brent" in prices and "wti" in prices:
        prices["spread"] = {
            "price": round(prices["brent"]["price"] - prices["wti"]["price"], 2),
            "source": "derived",
            "fetchedAt": now,
        }
        prices["kcposted"] = {
            "price": round(prices["wti"]["price"] - 13.25, 2),
            "source": "derived",
            "fetchedAt": now,
        }

    payload = {
        "prices": prices,
        "fetchedAt": now,
        "liveCount": sum(1 for p in prices.values() if p.get("source") == "live"),
        "source": "live" if prices else "unavailable",
    }
    if prices:
        set_cache("prices", payload)
    return JSONResponse(payload)


# ─── HEALTH ───────────────────────────────────────────────────
@app.get("/api/health")
async def health():
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 7860))
    uvicorn.run(app, host="0.0.0.0", port=port)
