/**
 * DataService — Centralized real-time data layer for the intelligence dashboard.
 *
 * Data flow (ordered by reliability):
 *   1. HF_PROXY — Hugging Face Space backend (server-side, no CORS, real yfinance)
 *   2. CORS proxies — Client-side fallback via public proxy rotation
 *   3. Scenario data — Hardcoded baseline if all sources fail
 *
 * Every datum is tagged: { source: "live" | "cached" | "scenario", fetchedAt }
 */

// ─── HF PROXY CONFIGURATION ─────────────────────────────────
// Set this to your Hugging Face Space URL. The dashboard tries this first.
// Example: "https://YOUR-USERNAME-valor-proxy.hf.space"
const HF_PROXY_URL = (typeof import.meta !== "undefined" && import.meta.env?.VITE_HF_PROXY_URL)
  || ""; // empty = skip HF proxy, use CORS fallback only

async function fetchHFProxy(endpoint, timeoutMs = 12000) {
  if (!HF_PROXY_URL) return null;
  try {
    const resp = await fetch(`${HF_PROXY_URL}${endpoint}`, {
      signal: timeoutSignal(timeoutMs),
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

// ─── TIMEOUT HELPER (compat: Safari <16, older browsers) ─────
function timeoutSignal(ms) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  // allow GC if signal is not needed
  controller.signal.addEventListener("abort", () => clearTimeout(id), { once: true });
  return controller.signal;
}

// ─── CORS PROXY ROTATION ────────────────────────────────────
const CORS_PROXIES = [
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
];

async function fetchWithProxyRotation(url, timeoutMs = 10000) {
  for (const makeProxy of CORS_PROXIES) {
    try {
      const resp = await fetch(makeProxy(url), {
        signal: timeoutSignal(timeoutMs),
      });
      if (!resp.ok) continue;
      const text = await resp.text();
      if (!text || text.length < 20) continue;
      return text;
    } catch {
      continue;
    }
  }
  return null;
}

// ─── RSS PARSER ──────────────────────────────────────────────
function parseRSS(xmlText) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, "text/xml");
    const items = doc.querySelectorAll("item");
    return Array.from(items).map(item => {
      const title = item.querySelector("title")?.textContent?.trim() || "";
      const description = (item.querySelector("description")?.textContent || "")
        .replace(/<[^>]*>/g, "").trim();
      const link = item.querySelector("link")?.textContent?.trim() || "";
      const pubDate = item.querySelector("pubDate")?.textContent?.trim() || "";
      return { title, description, link, pubDate };
    });
  } catch {
    return [];
  }
}

// ─── CLIENT-SIDE CACHE ───────────────────────────────────────
const cache = new Map();

function getCached(key, ttlMs) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.storedAt > ttlMs) return null;
  return entry.data;
}

function setCache(key, data) {
  cache.set(key, { data, storedAt: Date.now() });
}

// ─── RSS FEED SOURCES ────────────────────────────────────────
export const FEED_SOURCES = [
  {
    id: "google-hormuz",
    name: "Google News — Hormuz",
    url: "https://news.google.com/rss/search?q=strait+of+hormuz+oil+tanker&hl=en-US&gl=US&ceid=US:en",
    category: "maritime",
    priority: 1,
  },
  {
    id: "google-iran-oil",
    name: "Google News — Iran Oil",
    url: "https://news.google.com/rss/search?q=iran+oil+sanctions+energy&hl=en-US&gl=US&ceid=US:en",
    category: "macro",
    priority: 1,
  },
  {
    id: "google-crude-oil",
    name: "Google News — Crude Oil",
    url: "https://news.google.com/rss/search?q=crude+oil+brent+wti+price&hl=en-US&gl=US&ceid=US:en",
    category: "price",
    priority: 1,
  },
  {
    id: "google-tanker-shipping",
    name: "Google News — Tanker Shipping",
    url: "https://news.google.com/rss/search?q=tanker+shipping+VLCC+freight+rates&hl=en-US&gl=US&ceid=US:en",
    category: "maritime",
    priority: 2,
  },
  {
    id: "google-oil-supply",
    name: "Google News — Oil Supply",
    url: "https://news.google.com/rss/search?q=oil+production+rig+count+EIA+SPR&hl=en-US&gl=US&ceid=US:en",
    category: "supply",
    priority: 2,
  },
  {
    id: "eia-twip",
    name: "EIA — This Week in Petroleum",
    url: "https://www.eia.gov/petroleum/weekly/includes/twip_rss.xml",
    category: "supply",
    priority: 2,
  },
  {
    id: "gcaptain",
    name: "gCaptain — Maritime News",
    url: "https://gcaptain.com/feed/",
    category: "maritime",
    priority: 2,
  },
  {
    id: "maritime-exec",
    name: "The Maritime Executive",
    url: "https://maritime-executive.com/rss",
    category: "maritime",
    priority: 3,
  },
  {
    id: "oilprice",
    name: "OilPrice.com",
    url: "https://oilprice.com/rss/main",
    category: "price",
    priority: 3,
  },
];

// ─── SEMANTIC CLASSIFICATION ─────────────────────────────────
// Keywords that require word-boundary matching (short words that cause false positives
// when matched as substrings: "if" in "life", "may" in "dismay", "says" in "essays")
const WORD_BOUNDARY_SET = new Set(["if", "may", "says", "ais", "spr", "duc", "bbl"]);

// Build a regex for word-boundary keywords: matches only as whole words
function matchesKeyword(lower, keyword) {
  if (WORD_BOUNDARY_SET.has(keyword)) {
    const re = new RegExp(`\\b${keyword}\\b`, "i");
    return re.test(lower);
  }
  return lower.includes(keyword);
}

// No duplicate "transit" — deduplicated
const EFFECT_KEYWORDS = [
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
];

const EVENT_KEYWORDS = [
  "announced", "predicted", "analysts say", "expected", "could", "might",
  "sources say", "reportedly", "sentiment", "fears", "hopes", "rally",
  "tumble", "surge", "plunge", "breaking", "rumor", "speculation",
  "believes", "opinion", "according to", "may", "possibly", "likely",
  "forecast", "projected", "risk of", "warns", "caution", "concerned",
  "worried", "optimistic", "pessimistic", "bullish", "bearish", "mood",
  "says", "thinks", "suggests", "imagine", "if",
];

const CHAIN_TERMS = {
  "Maritime Insurance Cascade": ["insurance", "p&i", "coverage", "withdrawn", "reinsurance", "premium", "hull", "war risk", "club", "lloyd"],
  "Physical Flow Cascade": ["transit", "ais", "tanker", "vessel", "stranded", "vlcc", "freight", "pipeline", "tonnage", "loading", "cargo", "draft", "hormuz", "strait", "shipping", "blockade"],
  "Price Architecture Cascade": ["brent", "wti", "spread", "backwardation", "curve", "netback", "breakeven", "ovx", "futures", "contango", "oil price", "crude price", "barrel"],
  "Supply Constraint Cascade": ["rig count", "duc", "production", "bpd", "capacity", "frac", "drilling", "completions", "shut-in", "spr", "reserve", "opec", "output"],
};

export function classifyText(text) {
  if (!text) return { classification: "MIXED", score: 0, effectHits: [], eventHits: [], chainMap: [], confidence: 0 };

  const lower = text.toLowerCase();
  const effectHits = EFFECT_KEYWORDS.filter(k => matchesKeyword(lower, k));
  const eventHits = EVENT_KEYWORDS.filter(k => matchesKeyword(lower, k));
  const totalHits = effectHits.length + eventHits.length;
  const score = totalHits > 0 ? (effectHits.length - eventHits.length) / totalHits : 0;

  const chainMap = [];
  for (const [chain, terms] of Object.entries(CHAIN_TERMS)) {
    if (terms.some(t => matchesKeyword(lower, t))) chainMap.push(chain);
  }

  return {
    classification: score > 0.15 ? "EFFECT" : score < -0.15 ? "EVENT" : "MIXED",
    score,
    effectHits,
    eventHits,
    chainMap,
    // Confidence: scale by 8 hits for 100%, not 4 (less saturation)
    confidence: totalHits > 0 ? Math.min(100, Math.round((totalHits / 8) * 100)) : 0,
  };
}

// ─── FETCH ALL FEEDS ─────────────────────────────────────────
export async function fetchAllFeeds() {
  const CACHE_KEY = "allFeeds";
  const TTL = 3 * 60 * 1000; // 3 minutes

  const cached = getCached(CACHE_KEY, TTL);
  if (cached) return { ...cached, source: "cached" };

  // Strategy 1: HF proxy (server-side, no CORS issues)
  const hfData = await fetchHFProxy("/api/feeds");
  if (hfData && hfData.items && hfData.items.length > 0) {
    const payload = { ...hfData, source: "live" };
    setCache(CACHE_KEY, payload);
    return payload;
  }

  // Strategy 2: Client-side CORS proxy rotation
  const allItems = [];
  const sourceStatus = {};

  // Sort by priority — fetch high-priority first
  const sorted = [...FEED_SOURCES].sort((a, b) => a.priority - b.priority);

  // Fetch feeds concurrently in batches
  const results = await Promise.allSettled(
    sorted.map(async (src) => {
      try {
        const text = await fetchWithProxyRotation(src.url, 12000);
        if (!text) throw new Error("No response from any proxy");
        const items = parseRSS(text);
        if (items.length === 0) throw new Error("Empty feed");
        sourceStatus[src.id] = { ok: true, count: items.length };
        return items.slice(0, 8).map(item => ({
          ...item,
          source: src.name,
          sourceId: src.id,
          category: src.category,
          ...classifyText(item.title + " " + item.description),
        }));
      } catch (err) {
        sourceStatus[src.id] = { ok: false, error: err.message };
        return [];
      }
    })
  );

  for (const result of results) {
    if (result.status === "fulfilled") allItems.push(...result.value);
  }

  // Sort by date descending — guard against NaN from unparseable dates
  const safeTime = (d) => { const t = d ? new Date(d).getTime() : 0; return isNaN(t) ? 0 : t; };
  allItems.sort((a, b) => safeTime(b.pubDate) - safeTime(a.pubDate));

  // Deduplicate by title similarity
  const seen = new Set();
  const deduped = allItems.filter(item => {
    const key = item.title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const payload = {
    items: deduped,
    sourceStatus,
    fetchedAt: new Date().toISOString(),
    liveCount: Object.values(sourceStatus).filter(s => s.ok).length,
    totalSources: FEED_SOURCES.length,
    source: deduped.length > 0 ? "live" : "unavailable",
  };

  if (deduped.length > 0) setCache(CACHE_KEY, payload);
  return payload;
}

// ─── COMMODITY PRICE FETCHING ────────────────────────────────
// Multi-strategy: tries several public APIs in order.
// Strategy 1: Yahoo Finance v8 (may require auth — try first, fast fail)
// Strategy 2: Google Finance page scraping via CORS proxy
// Strategy 3: Extract from news feed headlines (regex price extraction)

// Strategy 1: Yahoo Finance v8 chart endpoint
async function tryYahoo(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
  const text = await fetchWithProxyRotation(url, 8000);
  if (!text) return null;
  try {
    const json = JSON.parse(text);
    const result = json?.chart?.result;
    if (!result || !result[0]?.meta) return null;
    const meta = result[0].meta;
    if (meta.regularMarketPrice == null) return null;
    return { price: meta.regularMarketPrice, fetchedAt: new Date().toISOString() };
  } catch { return null; }
}

// Strategy 2: Scrape Google Finance for a quote
async function tryGoogleFinance(query) {
  const url = `https://www.google.com/finance/quote/${query}`;
  const html = await fetchWithProxyRotation(url, 8000);
  if (!html) return null;
  try {
    // Google Finance embeds the price in a data-last-price attribute or specific class
    const match = html.match(/data-last-price="([\d.]+)"/) ||
                  html.match(/class="YMlKec fxKbKc"[^>]*>([\d,.]+)</) ||
                  html.match(/class="IsqQVc NprOob"[^>]*>([\d,.]+)</);
    if (!match) return null;
    const price = parseFloat(match[1].replace(/,/g, ""));
    if (isNaN(price) || price <= 0) return null;
    return { price, fetchedAt: new Date().toISOString() };
  } catch { return null; }
}

// Strategy 3: Try MarketWatch
async function tryMarketWatch(path) {
  const url = `https://www.marketwatch.com/investing/${path}`;
  const html = await fetchWithProxyRotation(url, 8000);
  if (!html) return null;
  try {
    const match = html.match(/class="intraday__price"[^>]*>[\s\S]*?<bg-quote[^>]*>([\d,.]+)</) ||
                  html.match(/class="value"[^>]*>\$?([\d,.]+)</) ||
                  html.match(/"price":\s*"?([\d.]+)"?/);
    if (!match) return null;
    const price = parseFloat(match[1].replace(/,/g, ""));
    if (isNaN(price) || price <= 0) return null;
    return { price, fetchedAt: new Date().toISOString() };
  } catch { return null; }
}

// Each commodity: try multiple strategies in order
const PRICE_STRATEGIES = {
  brent: [
    () => tryYahoo("BZ=F"),
    () => tryGoogleFinance("BZ=F:NYMEX"),
    () => tryMarketWatch("future/brn00"),
  ],
  wti: [
    () => tryYahoo("CL=F"),
    () => tryGoogleFinance("CL=F:NYMEX"),
    () => tryMarketWatch("future/crude%20oil%20-%20electronic"),
  ],
  ovx: [
    () => tryYahoo("%5EOVX"),
    () => tryGoogleFinance(".OVX:INDEXCBOE"),
  ],
};

async function fetchPriceWithFallback(strategies) {
  for (const strategy of strategies) {
    try {
      const result = await strategy();
      if (result && result.price > 0) return result;
    } catch { continue; }
  }
  return null;
}

export async function fetchCommodityPrices() {
  const CACHE_KEY = "commodityPrices";
  const TTL = 2 * 60 * 1000; // 2 minutes

  const cached = getCached(CACHE_KEY, TTL);
  if (cached) return { ...cached, source: "cached" };

  // Strategy 1: HF proxy (server-side yfinance — most reliable)
  const hfData = await fetchHFProxy("/api/prices");
  if (hfData && hfData.prices && Object.keys(hfData.prices).length > 0) {
    const payload = { ...hfData, source: "live" };
    setCache(CACHE_KEY, payload);
    return payload;
  }

  // Strategy 2: Client-side scraping via CORS proxies
  const prices = {};

  await Promise.all(
    Object.entries(PRICE_STRATEGIES).map(async ([id, strategies]) => {
      const result = await fetchPriceWithFallback(strategies);
      if (result) {
        prices[id] = { ...result, source: "live" };
      }
    })
  );

  // Compute derived values if we have the underlying data
  if (prices.brent && prices.wti) {
    prices.spread = {
      price: +(prices.brent.price - prices.wti.price).toFixed(2),
      source: "derived",
      fetchedAt: new Date().toISOString(),
    };
    // Kansas Common ≈ WTI - $13-14 differential
    prices.kcposted = {
      price: +(prices.wti.price - 13.25).toFixed(2),
      source: "derived",
      fetchedAt: new Date().toISOString(),
    };
  }

  const payload = {
    prices,
    fetchedAt: new Date().toISOString(),
    liveCount: Object.values(prices).filter(p => p.source === "live").length,
    source: Object.keys(prices).length > 0 ? "live" : "unavailable",
  };

  if (Object.keys(prices).length > 0) setCache(CACHE_KEY, payload);
  return payload;
}
