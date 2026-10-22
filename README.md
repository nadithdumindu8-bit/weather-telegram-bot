# Weather Telegram Bot

A simple Python Telegram bot that returns current weather for a city.

## Features

- `/start` welcome message
- `/help` command guide
- `/weather <city>` current temperature, feels-like temperature, humidity, rainfall, wind, and conditions
- City lookup and weather data via Open-Meteo
- Async HTTP requests with `httpx`
- Telegram bot powered by `python-telegram-bot`

## Setup

1. Create a virtual environment:

```bash
python -m venv .venv
```

2. Activate it:

Windows:
```bash
.venv\Scripts\activate
```

Linux/macOS:
```bash
source .venv/bin/activate
```

3. Install dependencies:

```bash
pip install -r requirements.txt
```

4. Set your Telegram bot token as an environment variable. Do not commit the token to GitHub.

Windows PowerShell:
```powershell
$env:BOT_TOKEN="YOUR_TELEGRAM_BOT_TOKEN"
```

Linux/macOS:
```bash
export BOT_TOKEN="YOUR_TELEGRAM_BOT_TOKEN"
```

5. Run the bot:

```bash
python bot.py
```

Then open the bot in Telegram and run `/weather Colombo`.

## Security

The Telegram bot token is intentionally read from `BOT_TOKEN` rather than stored in source code. If a token has been exposed publicly, revoke/rotate it in Telegram's BotFather and update the environment variable.
