const required = ["TELEGRAM_BOT_TOKEN", "TELEGRAM_WEBHOOK_SECRET", "WEBHOOK_URL"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`Yetishmayapti: ${missing.join(", ")}`);
  process.exit(1);
}

const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/setWebhook`;
const response = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    url: process.env.WEBHOOK_URL,
    secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ["message"]
  })
});

const data = await response.json();
console.log(data);
if (!data.ok) process.exit(1);
