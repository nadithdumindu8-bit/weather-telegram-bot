import { schedule } from "@netlify/functions";

const FEEDS = [
  { name: "NOAA Weather", url: "https://www.noaa.gov/rss.xml" },
  { name: "NWS Weather", url: "https://www.weather.gov/rss" },
  { name: "Met Office", url: "https://weather.metoffice.gov.uk/guides/rss" },
];

const STORE = "skycast-news";
const MAX_ITEMS = 5;

function extractItems(xml, source) {
  return [...xml.matchAll(/<item[\s\S]*?<\/item>/gi)].map((match) => {
    const item = match[0];
    const text = (tag) => {
      const m = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
      return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, "").trim() : "";
    };
    return { title: text("title"), link: text("link"), description: text("description"), source };
  }).filter((x) => x.title && x.link);
}

async function fetchFeed(feed) {
  const response = await fetch(feed.url, { headers: { "user-agent": "SkyCast/1.0 RSS reader" } });
  if (!response.ok) throw new Error(`${feed.name}: HTTP ${response.status}`);
  return extractItems(await response.text(), feed.name);
}

export default schedule("*/15 * * * *", async () => {
  const { getStore } = await import("@netlify/blobs");
  const store = getStore(STORE);
  const subscribers = (await store.get("subscribers", { type: "json" })) || {};
  const activeChats = Object.entries(subscribers).filter(([, enabled]) => enabled).map(([chatId]) => chatId);
  if (!activeChats.length) return;

  const batches = await Promise.allSettled(FEEDS.map(fetchFeed));
  const items = batches.flatMap((r) => r.status === "fulfilled" ? r.value : []);
  const seen = new Set((await store.get("sent", { type: "json" })) || []);
  const fresh = items.filter((item) => !seen.has(item.link)).slice(0, MAX_ITEMS);
  if (!fresh.length) return;

  const token = Netlify.env.get("BOT_TOKEN");
  if (!token) throw new Error("BOT_TOKEN is not configured");

  for (const chatId of activeChats) {
    for (const item of fresh) {
      const text = `🌦️ <b>SkyCast Weather News</b>\n\n📰 <b>${escapeHtml(item.title)}</b>\n${escapeHtml(item.source)}\n\n${escapeHtml(item.description.slice(0, 350))}\n\n🔗 <a href="${item.link}">Read the full story</a>`;
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: false }),
      });
    }
  }

  const nextSeen = [...seen, ...fresh.map((x) => x.link)].slice(-100);
  await store.setJSON("sent", nextSeen);
});

function escapeHtml(value) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
}
