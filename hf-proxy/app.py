"""
Valor Intelligence — Full-stack HF Space.

Serves the dashboard frontend at / and live data at /api/*.
One URL. One deployment. No CORS. Everything works.

  /           — The intelligence dashboard (React SPA)
  /api/feeds  — Aggregated RSS feeds with crisis-dimension analysis
  /api/prices — Real-time commodity prices (Brent, WTI, OVX)
  /api/health — Service status
"""

import os
import time
import re
import math
from pathlib import Path
from datetime import datetime, timezone

import feedparser
import yfinance as yf
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles

app = FastAPI(title="Valor Intelligence", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

# ─── STATIC FRONTEND ─────────────────────────────────────────
STATIC_DIR = Path(__file__).parent / "static"

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


# ─── CRISIS CALCULATOR ENGINE ────────────────────────────────
# Algorithm must match across app.py, DataService.jsx, data_fetch.py
#
# Core insight: the MISMATCH between narrative (event keywords) and
# physical reality (effect keywords) per cascade dimension IS the
# crisis signal. Negative mismatch = reality outrunning narrative =
# underpriced risk. That's where the information edge lives.

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
    "Geopolitical Escalation Cascade": ["assassination", "regime change", "succession", "irgc", "proxy", "houthi", "hezbollah", "retaliation", "strike", "nuclear", "enriched", "breakout", "khamenei", "sanctions", "carrier", "drone attack", "missile", "kharg", "ras tanura"],
}

# Build per-chain EFFECT term index (intersection of chain terms with effect keywords)
EFFECT_SET = set(EFFECT_KEYWORDS)
CHAIN_EFFECT_TERMS = {}
for _chain, _terms in CHAIN_TERMS.items():
    CHAIN_EFFECT_TERMS[_chain] = [t for t in _terms if t in EFFECT_SET]

# Phase state thresholds — effect signal density within a dimension
PHASE_THRESHOLDS = [(5, "CRISIS"), (3, "CRITICAL"), (1, "ALERT"), (0, "CALM")]

# Compound detection rules: (flag_name, chain_a, chain_b, min_phase_a, min_phase_b)
PHASE_ORDER = {"CALM": 0, "ALERT": 1, "CRITICAL": 2, "CRISIS": 3}
COMPOUND_RULES = [
    ("INSURANCE-FLOW LOCKOUT", "Maritime Insurance Cascade", "Physical Flow Cascade", "CRITICAL", "CRITICAL"),
    ("PHYSICAL-PRICE DISLOCATION", "Physical Flow Cascade", "Price Architecture Cascade", "CRITICAL", "ALERT"),
    ("SUPPLY-PRICE SQUEEZE", "Supply Constraint Cascade", "Price Architecture Cascade", "ALERT", "CRITICAL"),
    ("GEO-INSURANCE CASCADE", "Geopolitical Escalation Cascade", "Maritime Insurance Cascade", "CRITICAL", "ALERT"),
]

# Crisis index dimension weights (insurance is the kernel condition)
DIMENSION_WEIGHTS = {
    "Maritime Insurance Cascade": 0.30,
    "Physical Flow Cascade": 0.25,
    "Price Architecture Cascade": 0.15,
    "Supply Constraint Cascade": 0.15,
    "Geopolitical Escalation Cascade": 0.15,
}


def matches_keyword(text_lower, keyword):
    if keyword in WORD_BOUNDARY_SET:
        return bool(re.search(rf"\b{re.escape(keyword)}\b", text_lower))
    return keyword in text_lower


def _phase_for(effect_signal):
    for threshold, phase in PHASE_THRESHOLDS:
        if effect_signal >= threshold:
            return phase
    return "CALM"


def _compute_dimensions(lower, effect_hits_set, event_count):
    """Compute per-chain crisis dimensions for a single text."""
    dimensions = {}
    for chain_name, chain_effect_terms in CHAIN_EFFECT_TERMS.items():
        effect_terms = [t for t in chain_effect_terms if matches_keyword(lower, t)]
        effect_signal = len(effect_terms)
        # Event noise is global but weighted by chain relevance
        chain_all_terms = CHAIN_TERMS[chain_name]
        chain_active = any(matches_keyword(lower, t) for t in chain_all_terms)
        event_noise = event_count if chain_active else 0
        denom = max(event_noise + effect_signal, 1)
        mismatch = round((event_noise - effect_signal) / denom, 3)
        dimensions[chain_name] = {
            "effectSignal": effect_signal,
            "eventNoise": event_noise,
            "mismatchScore": mismatch,
            "phase": _phase_for(effect_signal),
            "effectTerms": effect_terms,
        }
    return dimensions


def _compute_compound_flags(dimensions):
    flags = []
    for flag_name, chain_a, chain_b, min_a, min_b in COMPOUND_RULES:
        dim_a = dimensions.get(chain_a, {})
        dim_b = dimensions.get(chain_b, {})
        phase_a = PHASE_ORDER.get(dim_a.get("phase", "CALM"), 0)
        phase_b = PHASE_ORDER.get(dim_b.get("phase", "CALM"), 0)
        if phase_a >= PHASE_ORDER[min_a] and phase_b >= PHASE_ORDER[min_b]:
            flags.append(flag_name)
    return flags


def _compute_crisis_index(dimensions, compound_flags):
    """0-100 aggregate crisis index."""
    # Weighted effect signal sum (normalize each dimension to 0-1 range, cap at 8 hits)
    raw = 0.0
    neg_mismatches = []
    for chain_name, weight in DIMENSION_WEIGHTS.items():
        dim = dimensions.get(chain_name, {})
        sig = min(dim.get("effectSignal", 0) / 8.0, 1.0)
        raw += sig * weight
        mm = dim.get("mismatchScore", 0)
        if mm < 0:
            neg_mismatches.append(mm)
    # Mismatch amplifier: reality outrunning narrative amplifies the index
    avg_neg = abs(sum(neg_mismatches) / len(neg_mismatches)) if neg_mismatches else 0
    mismatch_amp = 1.0 + (avg_neg * 0.5)
    # Compound multiplier
    compound_mul = 1.0 + (0.15 * len(compound_flags))
    index = raw * mismatch_amp * compound_mul * 100
    return min(100, round(index))


def classify_text(text):
    """Classify text and compute crisis dimensions.

    Returns backward-compatible fields (classification, score, effectHits,
    eventHits, chainMap, confidence) plus new crisis calculator fields
    (crisisDimensions, crisisIndex, compoundFlags).
    """
    empty = {
        "classification": "MIXED", "score": 0,
        "effectHits": [], "eventHits": [], "chainMap": [], "confidence": 0,
        "crisisDimensions": {name: {"effectSignal": 0, "eventNoise": 0, "mismatchScore": 0, "phase": "CALM", "effectTerms": []} for name in CHAIN_TERMS},
        "crisisIndex": 0, "compoundFlags": [],
    }
    if not text:
        return empty

    lower = text.lower()
    effect_hits = [k for k in EFFECT_KEYWORDS if matches_keyword(lower, k)]
    event_hits = [k for k in EVENT_KEYWORDS if matches_keyword(lower, k)]
    total = len(effect_hits) + len(event_hits)
    score = (len(effect_hits) - len(event_hits)) / total if total > 0 else 0
    chains = [name for name, terms in CHAIN_TERMS.items() if any(matches_keyword(lower, t) for t in terms)]

    # Crisis dimensions
    dimensions = _compute_dimensions(lower, set(effect_hits), len(event_hits))
    compound_flags = _compute_compound_flags(dimensions)
    crisis_index = _compute_crisis_index(dimensions, compound_flags)

    return {
        # Backward-compatible fields
        "classification": "EFFECT" if score > 0.15 else ("EVENT" if score < -0.15 else "MIXED"),
        "score": round(score, 3),
        "effectHits": effect_hits,
        "eventHits": event_hits,
        "chainMap": chains,
        "confidence": min(100, round((total / 8) * 100)) if total > 0 else 0,
        # Crisis calculator fields
        "crisisDimensions": dimensions,
        "crisisIndex": crisis_index,
        "compoundFlags": compound_flags,
    }


def compute_crisis_aggregate(items):
    """Compute aggregate crisis metrics across all feed items."""
    if not items:
        return None
    # Sum per-dimension signals across all items
    agg_dims = {}
    for chain_name in CHAIN_TERMS:
        total_effect = 0
        total_noise = 0
        for item in items:
            dim = item.get("crisisDimensions", {}).get(chain_name, {})
            total_effect += dim.get("effectSignal", 0)
            total_noise += dim.get("eventNoise", 0)
        denom = max(total_effect + total_noise, 1)
        mismatch = round((total_noise - total_effect) / denom, 3)
        agg_dims[chain_name] = {
            "effectSignal": total_effect,
            "eventNoise": total_noise,
            "mismatchScore": mismatch,
            "phase": _phase_for(total_effect),
        }
    compound = _compute_compound_flags(agg_dims)
    index = _compute_crisis_index(agg_dims, compound)

    # Temporal trend: split items by midpoint, compare first half vs second half
    mid = len(items) // 2
    trends = {}
    if mid > 0:
        recent = items[:mid]
        older = items[mid:]
        for chain_name in CHAIN_TERMS:
            recent_sig = sum(i.get("crisisDimensions", {}).get(chain_name, {}).get("effectSignal", 0) for i in recent)
            older_sig = sum(i.get("crisisDimensions", {}).get(chain_name, {}).get("effectSignal", 0) for i in older)
            if recent_sig > older_sig + 1:
                trends[chain_name] = "ESCALATING"
            elif older_sig > recent_sig + 1:
                trends[chain_name] = "DE-ESCALATING"
            else:
                trends[chain_name] = "STABLE"

    return {
        "dimensions": agg_dims,
        "crisisIndex": index,
        "compoundFlags": compound,
        "trends": trends,
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

    # Aggregate crisis metrics across the full feed
    crisis_aggregate = compute_crisis_aggregate(deduped)

    payload = {
        "items": deduped,
        "sourceStatus": source_status,
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "liveCount": sum(1 for s in source_status.values() if s.get("ok")),
        "totalSources": len(FEED_SOURCES),
        "source": "live" if deduped else "unavailable",
        "crisisAggregate": crisis_aggregate,
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


# ─── SERVE FRONTEND (SPA) ─────────────────────────────────────
if STATIC_DIR.exists():
    # Serve static assets (JS, CSS, images)
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(request: Request, full_path: str):
        # Try exact file first (favicon, etc.)
        file_path = STATIC_DIR / full_path
        if full_path and file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        # Otherwise serve index.html (SPA routing)
        return FileResponse(STATIC_DIR / "index.html")


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 7860))
    uvicorn.run(app, host="0.0.0.0", port=port)
