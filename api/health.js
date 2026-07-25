export default function handler(_req, res) {
  res.status(200).json({ ok: true, service: "Aziz Academy Quiz Bot", version: "1.3.1" });
}
