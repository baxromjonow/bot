import { getConfig } from "../../lib/config.js";
import { sendNextQuiz } from "../../lib/sender.js";

export default async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) {
    return res.status(405).json({ ok: false, message: "Faqat GET yoki POST" });
  }

  try {
    const { cronSecret } = getConfig();
    const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, "");
    const headerSecret = req.headers["x-cron-secret"];
    const querySecret = req.query?.key;

    if (![bearer, headerSecret, querySecret].includes(cronSecret)) {
      return res.status(401).json({ ok: false, message: "Cron secret noto‘g‘ri" });
    }

    const result = await sendNextQuiz();
    return res.status(200).json(result);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, error: error?.message || "Noma’lum xato" });
  }
}
