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

# ── Feed sources (mirrors hf-proxy/app.py) ────────────────────────
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

# ── CRISIS CALCULATOR ENGINE (mirrors hf-proxy/app.py) ────────────
# Algorithm must match across app.py, DataService.jsx, data_fetch.py
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

EFFECT_SET = set(EFFECT_KEYWORDS)
CHAIN_EFFECT_TERMS = {chain: [t for t in terms if t in EFFECT_SET] for chain, terms in CHAIN_TERMS.items()}

PHASE_THRESHOLDS = [(5, "CRISIS"), (3, "CRITICAL"), (1, "ALERT"), (0, "CALM")]
PHASE_ORDER = {"CALM": 0, "ALERT": 1, "CRITICAL": 2, "CRISIS": 3}

COMPOUND_RULES = [
    ("INSURANCE-FLOW LOCKOUT", "Maritime Insurance Cascade", "Physical Flow Cascade", "CRITICAL", "CRITICAL"),
    ("PHYSICAL-PRICE DISLOCATION", "Physical Flow Cascade", "Price Architecture Cascade", "CRITICAL", "ALERT"),
    ("SUPPLY-PRICE SQUEEZE", "Supply Constraint Cascade", "Price Architecture Cascade", "ALERT", "CRITICAL"),
    ("GEO-INSURANCE CASCADE", "Geopolitical Escalation Cascade", "Maritime Insurance Cascade", "CRITICAL", "ALERT"),
]

DIMENSION_WEIGHTS = {
    "Maritime Insurance Cascade": 0.30,
    "Physical Flow Cascade": 0.25,
    "Price Architecture Cascade": 0.15,
    "Supply Constraint Cascade": 0.15,
    "Geopolitical Escalation Cascade": 0.15,
}

# Short display names for terminal rendering
DIMENSION_SHORT = {
    "Maritime Insurance Cascade": "INSURANCE",
    "Physical Flow Cascade": "PHYS FLOW",
    "Price Architecture Cascade": "PRICE ARC",
    "Supply Constraint Cascade": "SUPPLY",
    "Geopolitical Escalation Cascade": "GEOPOL",
}

PHASE_COLORS = {"CALM": "D", "ALERT": "Y", "CRITICAL": "M", "CRISIS": "R"}


def _matches(text, kw):
    if kw in WORD_BOUNDARY_SET:
        return bool(re.search(rf"\b{re.escape(kw)}\b", text))
    return kw in text


def _phase_for(effect_signal):
    for threshold, phase in PHASE_THRESHOLDS:
        if effect_signal >= threshold:
            return phase
    return "CALM"


def classify(text):
    """Classify text and compute crisis dimensions. Returns dict."""
    empty_dims = {name: {"effectSignal": 0, "eventNoise": 0, "mismatchScore": 0, "phase": "CALM", "effectTerms": []}
                  for name in CHAIN_TERMS}
    if not text:
        return {"classification": "MIXED", "score": 0.0, "crisisDimensions": empty_dims, "crisisIndex": 0, "compoundFlags": []}

    lower = text.lower()
    eff_hits = [k for k in EFFECT_KEYWORDS if _matches(lower, k)]
    evt_hits = [k for k in EVENT_KEYWORDS if _matches(lower, k)]
    total = len(eff_hits) + len(evt_hits)
    score = (len(eff_hits) - len(evt_hits)) / total if total > 0 else 0

    if score > 0.15:
        cls = "EFFECT"
    elif score < -0.15:
        cls = "EVENT"
    else:
        cls = "MIXED"

    # Crisis dimensions
    dimensions = {}
    for chain_name, chain_eff_terms in CHAIN_EFFECT_TERMS.items():
        eff_terms = [t for t in chain_eff_terms if _matches(lower, t)]
        eff_sig = len(eff_terms)
        chain_active = any(_matches(lower, t) for t in CHAIN_TERMS[chain_name])
        evt_noise = len(evt_hits) if chain_active else 0
        denom = max(evt_noise + eff_sig, 1)
        dimensions[chain_name] = {
            "effectSignal": eff_sig,
            "eventNoise": evt_noise,
            "mismatchScore": round((evt_noise - eff_sig) / denom, 3),
            "phase": _phase_for(eff_sig),
            "effectTerms": eff_terms,
        }

    # Compound flags
    flags = []
    for flag_name, chain_a, chain_b, min_a, min_b in COMPOUND_RULES:
        pa = PHASE_ORDER.get(dimensions.get(chain_a, {}).get("phase", "CALM"), 0)
        pb = PHASE_ORDER.get(dimensions.get(chain_b, {}).get("phase", "CALM"), 0)
        if pa >= PHASE_ORDER[min_a] and pb >= PHASE_ORDER[min_b]:
            flags.append(flag_name)

    # Crisis index
    raw = 0.0
    neg_mm = []
    for chain_name, weight in DIMENSION_WEIGHTS.items():
        dim = dimensions.get(chain_name, {})
        sig = min(dim.get("effectSignal", 0) / 8.0, 1.0)
        raw += sig * weight
        mm = dim.get("mismatchScore", 0)
        if mm < 0:
            neg_mm.append(mm)
    avg_neg = abs(sum(neg_mm) / len(neg_mm)) if neg_mm else 0
    crisis_index = min(100, round(raw * (1.0 + avg_neg * 0.5) * (1.0 + 0.15 * len(flags)) * 100))

    return {
        "classification": cls, "score": round(score, 3),
        "crisisDimensions": dimensions, "crisisIndex": crisis_index, "compoundFlags": flags,
    }


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
                    analysis = classify(title + " " + desc)
                    items.append({
                        "title": title, "source": src["name"],
                        "category": src["category"], "link": link,
                        "pubDate": pub, **analysis,
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
        prices["Brent-WTI Spread"] = {"price": round(brent - wti, 2), "history": [], "labels": []}
        prices["KC Posted"] = {"price": round(wti - 13.25, 2), "history": [], "labels": []}

    log.complete(f"Prices: {len([p for p in prices.values() if p.get('price')])} "
                 f"commodities fetched")
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
    """Display top articles with classification and crisis dimension badges."""
    print()
    cls_colors = {"EFFECT": "G", "EVENT": "Y", "MIXED": "D"}
    for item in items[:top_n]:
        cls = item.get("classification", "MIXED")
        color = cls_colors.get(cls, "D")
        badge = f"{C[color]}[{cls:^6}]{C['X']}"
        # Show dominant crisis dimension phase if any
        dims = item.get("crisisDimensions", {})
        active_dims = [(n, d) for n, d in dims.items() if d.get("phase", "CALM") != "CALM"]
        dim_badge = ""
        if active_dims:
            top_dim = max(active_dims, key=lambda x: PHASE_ORDER.get(x[1].get("phase", "CALM"), 0))
            phase = top_dim[1]["phase"]
            pc = PHASE_COLORS.get(phase, "D")
            short = DIMENSION_SHORT.get(top_dim[0], top_dim[0][:8])
            dim_badge = f" {C[pc]}[{short}:{phase}]{C['X']}"
        title = item["title"][:60]
        source = item["source"].split("—")[-1].strip()[:15]
        print(f"  {badge}{dim_badge} {C['W']}{title}{C['X']}")
        print(f"         {C['D']}{source}{C['X']}")


def render_crisis_dashboard(items):
    """Terminal crisis dashboard — per-dimension gauges, aggregate index, compound flags."""
    from launcher.display import bar_gauge, hline, box_top, box_row, box_bot

    if not items:
        print(f"  {C['D']}No items for crisis analysis{C['X']}")
        return

    # Aggregate dimensions across all items
    agg = {}
    for chain_name in CHAIN_TERMS:
        total_eff = sum(item.get("crisisDimensions", {}).get(chain_name, {}).get("effectSignal", 0) for item in items)
        total_noise = sum(item.get("crisisDimensions", {}).get(chain_name, {}).get("eventNoise", 0) for item in items)
        denom = max(total_eff + total_noise, 1)
        mismatch = round((total_noise - total_eff) / denom, 3)
        phase = _phase_for(total_eff)
        agg[chain_name] = {"effectSignal": total_eff, "eventNoise": total_noise, "mismatchScore": mismatch, "phase": phase}

    # Compound flags
    flags = []
    for flag_name, chain_a, chain_b, min_a, min_b in COMPOUND_RULES:
        pa = PHASE_ORDER.get(agg.get(chain_a, {}).get("phase", "CALM"), 0)
        pb = PHASE_ORDER.get(agg.get(chain_b, {}).get("phase", "CALM"), 0)
        if pa >= PHASE_ORDER[min_a] and pb >= PHASE_ORDER[min_b]:
            flags.append(flag_name)

    # Crisis index
    raw = 0.0
    neg_mm = []
    for chain_name, weight in DIMENSION_WEIGHTS.items():
        dim = agg.get(chain_name, {})
        sig = min(dim.get("effectSignal", 0) / 8.0, 1.0)
        raw += sig * weight
        mm = dim.get("mismatchScore", 0)
        if mm < 0:
            neg_mm.append(mm)
    avg_neg = abs(sum(neg_mm) / len(neg_mm)) if neg_mm else 0
    crisis_index = min(100, round(raw * (1.0 + avg_neg * 0.5) * (1.0 + 0.15 * len(flags)) * 100))

    # Display
    print()
    box_top("CRISIS CALCULATOR")
    box_bot()
    print()

    # Aggregate index
    idx_color = "G" if crisis_index < 25 else ("Y" if crisis_index < 50 else ("M" if crisis_index < 75 else "R"))
    print(f"  {C['BOLD']}{C['W']}CRISIS INDEX{C['X']}  "
          f"{C[idx_color]}{C['BOLD']}{crisis_index}{C['X']}{C['D']}/100{C['X']}")
    print(bar_gauge(crisis_index, 100, 40, "", idx_color))
    print()

    # Per-dimension
    for chain_name in CHAIN_TERMS:
        dim = agg[chain_name]
        short = DIMENSION_SHORT.get(chain_name, chain_name[:10])
        phase = dim["phase"]
        pc = PHASE_COLORS.get(phase, "D")
        mm = dim["mismatchScore"]
        mm_color = "G" if mm < 0 else ("R" if mm > 0 else "D")
        mm_arrow = "◀ REALITY" if mm < -0.1 else ("NARRATIVE ▶" if mm > 0.1 else "≈ BALANCED")
        print(f"  {C['W']}{short:<12}{C['X']} "
              f"{C[pc]}[{phase:^8}]{C['X']} "
              f"eff={dim['effectSignal']:>2} evt={dim['eventNoise']:>2} "
              f"mismatch={C[mm_color]}{mm:+.3f}{C['X']} {C['D']}{mm_arrow}{C['X']}")

    # Compound flags
    if flags:
        print()
        for flag in flags:
            print(f"  {C['R']}{C['BOLD']}⚠ {flag}{C['X']}")

    print()


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
