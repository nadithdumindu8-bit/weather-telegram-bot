const WEATHER_URL = "https://api.open-meteo.com/v1/forecast";
const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";

const weatherDescription = (code) => ({
  0: "☀️ Clear sky", 1: "🌤️ Mainly clear", 2: "⛅ Partly cloudy", 3: "☁️ Overcast",
  45: "🌫️ Fog", 48: "🌫️ Depositing rime fog", 51: "🌦️ Light drizzle", 53: "🌦️ Moderate drizzle",
  55: "🌧️ Dense drizzle", 61: "🌦️ Slight rain", 63: "🌧️ Moderate rain", 65: "🌧️ Heavy rain",
  71: "🌨️ Slight snow", 73: "🌨️ Moderate snow", 75: "❄️ Heavy snow", 80: "🌦️ Slight rain showers",
  81: "🌧️ Moderate rain showers", 82: "⛈️ Violent rain showers", 95: "⛈️ Thunderstorm",
  96: "⛈️ Thunderstorm with slight hail", 99: "⛈️ Thunderstorm with heavy hail",
}[code] || "🌡️ Unknown conditions");

async function telegram(method, body) {
  const token = process.env.BOT_TOKEN;
  if (!token) throw new Error("BOT_TOKEN is not configured in Netlify");
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(`Telegram ${method} failed: ${JSON.stringify(result)}`);
  return result;
}

async function sendGreeting(chatId, firstName = "there") {
  return telegram("sendMessage", {
    chat_id: chatId,
    text: `🌤️ <b>Hey ${firstName}!</b> Welcome to SkyCast!\n\nI’m your simple weather assistant. ☁️\n\n📍 Send me a city like:\n<code>/weather Colombo</code>\n\nI’ll send you the current temperature, feels-like temperature, humidity, rain and wind.\n\n🌎 <b>Ready? Ask me about any city!</b>`,
    parse_mode: "HTML",
  });
}

async function getWeather(city) {
  const geoResponse = await fetch(`${GEOCODING_URL}?name=${encodeURIComponent(city)}&count=1&language=en&format=json`);
  if (!geoResponse.ok) throw new Error("Geocoding request failed");
  const geo = await geoResponse.json();
  const location = geo.results?.[0];
  if (!location) return null;

  const params = new URLSearchParams({
    latitude: location.latitude, longitude: location.longitude,
    current: "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,weather_code,wind_speed_10m",
    timezone: "auto",
  });
  const weatherResponse = await fetch(`${WEATHER_URL}?${params}`);
  if (!weatherResponse.ok) throw new Error("Weather request failed");
  const data = await weatherResponse.json();
  return { location, current: data.current, units: data.current_units };
}

async function handleMessage(message) {
  const chatId = message?.chat?.id;
  if (!chatId) return;

  const text = message.text?.trim() || "";
  const firstName = message.from?.first_name || "there";

  // Handle /start and /start with a bot deep-link parameter.
  if (/^\/start(?:@\w+)?(?:\s+.*)?$/i.test(text)) {
    await sendGreeting(chatId, firstName);
    return;
  }

  if (/^\/help(?:@\w+)?$/i.test(text)) {
    await sendGreeting(chatId, firstName);
    return;
  }

  const weatherMatch = text.match(/^\/weather(?:@\w+)?(?:\s+(.+))?$/i);
  if (!weatherMatch) return;

  const city = weatherMatch[1]?.trim();
  if (!city) {
    await telegram("sendMessage", { chat_id: chatId, text: "📍 Please provide a city. Example: /weather Colombo" });
    return;
  }

  try {
    await telegram("sendChatAction", { chat_id: chatId, action: "typing" });
    const result = await getWeather(city);
    if (!result) {
      await telegram("sendMessage", { chat_id: chatId, text: `❌ I couldn't find a location named '${city}'.` });
      return;
    }
    const { location, current, units } = result;
    const country = location.country ? `, ${location.country}` : "";
    await telegram("sendMessage", {
      chat_id: chatId,
      text: `🌤️ <b>Weather in ${location.name}${country}</b>\n\n${weatherDescription(current.weather_code)}\n🌡️ Temperature: <b>${current.temperature_2m}${units.temperature_2m}</b>\n🤔 Feels like: ${current.apparent_temperature}${units.apparent_temperature}\n💧 Humidity: ${current.relative_humidity_2m}${units.relative_humidity_2m}\n🌧️ Rain: ${current.rain}${units.rain}\n💨 Wind: ${current.wind_speed_10m} ${units.wind_speed_10m}\n\n🕐 Updated: ${current.time}`,
      parse_mode: "HTML",
    });
  } catch (error) {
    console.error(error);
    await telegram("sendMessage", { chat_id: chatId, text: "⚠️ I couldn't get the weather right now. Please try again." });
  }
}

export default async (request) => {
  // Useful for checking that Netlify has deployed the function.
  if (request.method === "GET") return new Response("SkyCast Telegram webhook is online.", { status: 200 });
  if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  try {
    const update = await request.json();
    await handleMessage(update?.message);
    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response("OK", { status: 200 });
  }
};

export const config = { path: "/telegram/webhook" };
