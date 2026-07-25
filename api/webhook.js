import { handleUpdate } from "../lib/bot.js";
import { getConfig } from "../lib/config.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, message: "Faqat POST" });
  }

  try {
    const { webhookSecret } = getConfig();
    const receivedSecret = req.headers["x-telegram-bot-api-secret-token"];
    if (receivedSecret !== webhookSecret) {
      return res.status(401).json({ ok: false, message: "Webhook secret noto‘g‘ri" });
    }

    await handleUpdate(req.body);
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error(error);
    return res.status(200).json({ ok: false, error: error?.message || "Noma’lum xato" });
  }
}
