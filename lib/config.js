const required = [
  "TELEGRAM_BOT_TOKEN",
  "ADMIN_ID",
  "TELEGRAM_WEBHOOK_SECRET",
  "CRON_SECRET",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY"
];

export function getConfig() {
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Environment variables yetishmayapti: ${missing.join(", ")}`);
  }

  return {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    adminId: String(process.env.ADMIN_ID),
    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET,
    cronSecret: process.env.CRON_SECRET,
    supabaseUrl: process.env.SUPABASE_URL.replace(/\/$/, ""),
    supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY
  };
}
