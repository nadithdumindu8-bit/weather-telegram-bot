import { getStore } from "@netlify/blobs";

const FEEDS = [
  {
    name: "NOAA",
    url: "https://www.noaa.gov/rss.xml",
    keywords: ["weather", "storm", "hurricane", "tornado", "flood", "heat", "rain", "snow", "wind", "drought", "wildfire", "climate", "forecast", "severe"],
  },
  {
    name: "NOAA National Hurricane Center",
    url: "https://www.nhc.noaa.gov/index-at.xml",
    keywords: ["tropical", "cyclone", "hurricane", "storm", "depression", "warning", "watch"],
  },
  {
    name: "Met Office",
    url: "https://www.metoffice.gov.uk/rss/news-releases.xml",
    keywords: ["weather", "storm", "rain", "wind", "flood", "snow", "heat", "forecast", "climate", "warning"],
  },
];

const STORE_NAME = "skycast-news";
const SUBSCRIBERS_KEY = "subscribers";
const SEEN_KEY = "seen-news";

function stripHtml(value = "") {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeXml(value = "") {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function tag(block, name) {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
  return match ? decodeXml(match[1]).trim() : "";
}

function parseFeed(xml, source, keywords) {
  const blocks = [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].map((m) => m[1]);
  const atomBlocks = [...xml.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi)].map((m) => m[1]);
  const items = blocks.length ? blocks : atomBlocks;

  return items.map((block) => {
    const title = stripHtml(tag(block, "title"));
    const description = stripHtml(tag(block, "description") || tag(block, "summary") || tag(block, "content"));
    const linkMatch = block.match(/<link(?:\s[^>]*)?>([\s\S]*?)<\/link>/i);
    const hrefMatch = block.match(/<link[^>]+href=["']([^"']+)["'][^>]*\/?\s*>/i);
    const link = decodeXml((hrefMatch?.[1] || linkMatch?.[1] || tag(block, "guid") || "").trim());
    const date = tag(block, "pubDate") || tag(block, "published") || tag(block, "updated");
    const timestamp = Date.parse(date) || Date.now();
    const haystack = `${title} ${description}`.toLowerCase();
    const relevant = keywords.some((keyword) => haystack.includes(keyword));

    return { title, description, link, source, timestamp, relevant };
  }).filter((item) => item.title && item.link && item.relevant);
}

async function fetchFeed(feed) {
  try {
    const response = await fetch(feed.url, {
      headers: { "user-agent": "SkyCast/1.0 weather news RSS reader" },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    const xml = await response.text();
    return parseFeed(xml, feed.name, feed.keywords);
  } catch (error) {
    console.error(`RSS error (${feed.name}):`, error.message);
    return [];
  }
}

async function telegram(method, body) {
  const token = process.env.BOT_TOKEN;
  if (!token) throw new Error("BOT_TOKEN is not configured");
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(`Telegram ${method} failed: ${JSON.stringify(result)}`);
  return result;
}

function escapeHtml(value = "") {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
}

function formatNews(item) {
  const summary = item.description ? `${item.description.slice(0, 280)}${item.description.length > 280 ? "…" : ""}` : "";
  return `📰 <b>${escapeHtml(item.title)}</b>\n\n${escapeHtml(summary)}${summary ? "\n\n" : ""}🌦️ Source: <b>${escapeHtml(item.source)}</b>\n🔗 <a href="${escapeHtml(item.link)}">Read the full story</a>`;
}

export default async () => {
  const store = getStore(STORE_NAME);
  const subscribers = (await store.get(SUBSCRIBERS_KEY, { type: "json" })) || {};
  const chatIds = Object.keys(subscribers).filter((id) => subscribers[id]);
  if (!chatIds.length) return new Response("No news subscribers", { status: 200 });

  const feedResults = await Promise.all(FEEDS.map(fetchFeed));
  const allItems = feedResults.flat().sort((a, b) => b.timestamp - a.timestamp);
  const seen = (await store.get(SEEN_KEY, { type: "json" })) || {};

  const fresh = [];
  for (const item of allItems) {
    const id = item.link;
    if (seen[id]) continue;
    seen[id] = Date.now();
    fresh.push(item);
    if (fresh.length >= 10) break;
  }

  // Keep the seen cache bounded.
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  for (const [id, time] of Object.entries(seen)) {
    if (time < cutoff) delete seen[id];
  }
  await store.setJSON(SEEN_KEY, seen);

  if (!fresh.length) return new Response("No new weather news", { status: 200 });

  // Send at most 3 new stories per subscriber per run to avoid spam.
  for (const chatId of chatIds) {
    for (const item of fresh.slice(0, 3)) {
      try {
        await telegram("sendMessage", {
          chat_id: chatId,
          text: formatNews(item),
          parse_mode: "HTML",
          disable_web_page_preview: false,
        });
      } catch (error) {
        console.error(`Could not send news to ${chatId}:`, error.message);
      }
    }
  }

  return new Response(`Sent ${Math.min(fresh.length, 3)} stories to ${chatIds.length} subscribers`, { status: 200 });
};

export const config = {
  schedule: "*/15 * * * *",
};
