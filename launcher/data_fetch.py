"""
Data fetching module — pull live feeds + prices with progress display.
Re-uses the same logic as hf-proxy/app.py for consistency.
"""

import re
import time
import math
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

try:
    import feedparser
except ImportError:
    feedparser = None

try:
    import yfinance as yf
except ImportError:
    yf = None

from launcher.display import C, progress_bar, SequenceLog, sparkline, ascii_chart

# ── Feed sources (similar to hf-proxy/app.py; IDs may differ) ────
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
    {"id": "google-tanker", "name": "Google News — Tanker Shipping",
     "url": "https://news.google.com/rss/search?q=tanker+shipping+VLCC+freight+rates&hl=en-US&gl=US&ceid=US:en",
     "category": "maritime", "priority": 2},
    {"id": "google-supply", "name": "Google News — Oil Supply",
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
    "Brent Crude": "BZ=F",
    "WTI Crude": "CL=F",
    "Oil Volatility (OVX)": "^OVX",
}

# ── Classification (mirrors hf-proxy/app.py) ──────────────────────
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


def _matches(text, kw):
    if kw in WORD_BOUNDARY_SET:
        return bool(re.search(rf"\b{re.escape(kw)}\b", text))
    return kw in text


def classify(text):
    if not text:
        return "MIXED", 0.0
    lower = text.lower()
    eff = sum(1 for k in EFFECT_KEYWORDS if _matches(lower, k))
    evt = sum(1 for k in EVENT_KEYWORDS if _matches(lower, k))
    total = eff + evt
    if total == 0:
        return "MIXED", 0.0
    score = (eff - evt) / total
    if score > 0.15:
        return "EFFECT", score
    elif score < -0.15:
        return "EVENT", score
    return "MIXED", score


# ── Fetch functions ───────────────────────────────────────────────

def fetch_feeds(log: SequenceLog):
    """Fetch all RSS feeds with progress display. Returns (items, stats)."""
    if feedparser is None:
        log.warn("feedparser not installed — run: pip install feedparser")
        return [], {"live": 0, "failed": 0, "total": 0, "articles": 0}
    items = []
    stats = {"live": 0, "failed": 0, "total": len(FEED_SOURCES), "articles": 0}
    sources = sorted(FEED_SOURCES, key=lambda s: s["priority"])

    for i, src in enumerate(sources, 1):
        print(f"\r{progress_bar(i, len(sources), 40, 'Feeds')}", end="", flush=True)
        try:
            feed = feedparser.parse(src["url"])
            entries = feed.entries[:8]
            if entries:
                stats["live"] += 1
                for entry in entries:
                    title = getattr(entry, "title", "") or ""
                    desc = getattr(entry, "summary", "") or ""
                    desc = re.sub(r"<[^>]*>", "", desc).strip()[:300]
                    link = getattr(entry, "link", "") or ""
                    pub = getattr(entry, "published", "") or ""
                    cls, score = classify(title + " " + desc)
                    items.append({
                        "title": title, "source": src["name"],
                        "category": src["category"], "link": link,
                        "pubDate": pub, "classification": cls, "score": score,
                    })
            else:
                stats["failed"] += 1
        except Exception:
            stats["failed"] += 1

    print()  # newline after progress bar
    stats["articles"] = len(items)

    # Sort by date
    def _ts(item):
        try:
            return parsedate_to_datetime(item["pubDate"]).timestamp()
        except Exception:
            return 0
    items.sort(key=_ts, reverse=True)

    # Dedup
    seen = set()
    deduped = []
    for item in items:
        key = re.sub(r"[^a-z0-9]", "", item["title"].lower())[:60]
        if key not in seen:
            seen.add(key)
            deduped.append(item)

    log.complete(f"Feeds: {stats['live']}/{stats['total']} live, "
                 f"{len(deduped)} articles (deduped from {stats['articles']})")
    return deduped, stats


def fetch_prices(log: SequenceLog):
    """Fetch commodity prices. Returns dict of {name: {price, history[]}}."""
    if yf is None:
        log.warn("yfinance not installed — run: pip install yfinance")
        return {}
    prices = {}
    for i, (name, symbol) in enumerate(COMMODITY_SYMBOLS.items(), 1):
        print(f"\r{progress_bar(i, len(COMMODITY_SYMBOLS), 40, 'Prices')}", end="", flush=True)
        try:
            ticker = yf.Ticker(symbol)
            info = ticker.fast_info
            price = getattr(info, "last_price", None)
            if price is not None and not math.isnan(price):
                # Also grab history for charting
                hist = ticker.history(period="1mo", interval="1d")
                history = []
                labels = []
                if hist is not None and not hist.empty:
                    for dt, row in hist.iterrows():
                        close = row.get("Close")
                        if close is not None and not math.isnan(close):
                            history.append(float(close))
                            labels.append(str(dt.date()))
                prices[name] = {
                    "price": round(float(price), 2),
                    "history": history,
                    "labels": labels,
                }
        except Exception:
            pass

    print()
    # Derived
    if "Brent Crude" in prices and "WTI Crude" in prices:
        brent = prices["Brent Crude"]["price"]
        wti = prices["WTI Crude"]["price"]
        prices["Brent-WTI Spread"] = {"price": round(brent - wti, 2), "history": [], "labels": [], "derived": True}
        prices["KC Posted"] = {"price": round(wti - 13.25, 2), "history": [], "labels": [], "derived": True}

    live_count = sum(1 for p in prices.values() if not p.get("derived"))
    log.complete(
        f"Prices: {live_count} live + "
        f"{len(prices) - live_count} derived price entries prepared"
    )
    return prices


def render_price_dashboard(prices):
    """Pretty-print prices with sparklines."""
    print()
    for name, data in prices.items():
        price = data["price"]
        hist = data.get("history", [])
        spark = sparkline(hist, 25) if hist else f"{C['D']}(no history){C['X']}"
        # Color: green if price is up from history start, red if down
        color = "G"
        if hist and len(hist) >= 2:
            color = "G" if hist[-1] >= hist[0] else "R"
        print(f"  {C['W']}{name:<22}{C['X']} "
              f"{C[color]}${price:>8.2f}{C['X']}  {spark}")


def render_feed_summary(items, top_n=10):
    """Display top articles with classification badges."""
    print()
    cls_colors = {"EFFECT": "G", "EVENT": "Y", "MIXED": "D"}
    for item in items[:top_n]:
        cls = item["classification"]
        color = cls_colors.get(cls, "D")
        badge = f"{C[color]}[{cls:^6}]{C['X']}"
        title = item["title"][:65]
        source = item["source"].split("—")[-1].strip()[:15]
        print(f"  {badge} {C['W']}{title}{C['X']}")
        print(f"         {C['D']}{source}{C['X']}")


def render_price_charts(prices, height=8, width=50):
    """Render ASCII price history charts."""
    for name, data in prices.items():
        hist = data.get("history", [])
        labels = data.get("labels", [])
        if len(hist) >= 3:
            lines = ascii_chart(hist, labels=labels, height=height,
                                width=min(width, len(hist)),
                                title=f"{name} — 1 Month")
            for line in lines:
                print(line)
            print()
