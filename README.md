# Weather Telegram Bot

A serverless Telegram weather bot designed to run on Netlify Functions.

## Deploy to Netlify

1. Import this GitHub repository into Netlify.
2. No build command is required.
3. Set the environment variable `BOT_TOKEN` to your Telegram bot token.
4. Deploy the site.
5. Set the Telegram webhook to:

   `https://YOUR-NETLIFY-SITE.netlify.app/telegram/webhook`

   You can set it using Telegram's Bot API `setWebhook` method with your new bot token and that URL.

## Commands

- `/start`
- `/help`
- `/weather Colombo`
- `/weather Negombo`

Weather data is provided by Open-Meteo. No weather API key is required.

## Security

Never commit `BOT_TOKEN` to Git. Configure it in Netlify's environment variables instead. If a token has been exposed publicly, revoke it with Telegram's BotFather and generate a new one.
