import express from "express";
import path from "node:path";
import fs from "node:fs";
import { ZodError } from "zod";
import { attachUser } from "./auth";
import { core } from "./routes/core";
import { trace } from "./routes/trace";
import { trials } from "./routes/trials";
import { get } from "./db";
import { seedIfEmpty } from "./seed";

const app = express();
app.set("trust proxy", true);
app.disable("x-powered-by");
app.use(express.json({ limit: "2mb" }));
app.use(attachUser);
app.use((_, res, next) => { res.setHeader("X-Content-Type-Options", "nosniff"); res.setHeader("Referrer-Policy", "same-origin"); next(); });

app.use("/api", core, trace, trials);
app.use("/uploads", express.static(path.resolve(process.env.PACKWISE_UPLOAD_DIR ?? "uploads"), { fallthrough: false }));

// GS1 Digital Link-style resolver (concept only; no compliance claim): /01/{gtin}/10/{batch}
app.get("/01/:gtin/10/:batch", (req, res) => {
  const b = get("SELECT public_token FROM batches WHERE batch_code = ? AND (gtin = ? OR gtin IS NULL)", req.params.batch, req.params.gtin);
  if (!b) return res.status(404).send("Unknown product/batch");
  res.redirect(302, `/t/${b.public_token}`);
});

app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));

const dist = path.resolve("dist");
if (process.env.NODE_ENV === "production" && fs.existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: "1h" }));
  app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof ZodError) return res.status(400).json({ error: "Invalid input", details: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`) });
  if (err?.type === "entity.too.large") return res.status(413).json({ error: "Request too large" });
  if (err?.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "File too large" });
  console.error(err);
  res.status(500).json({ error: "Something went wrong on the server" });
});

seedIfEmpty();
const port = Number(process.env.API_PORT ?? (process.env.NODE_ENV === "production" ? process.env.PORT : undefined) ?? 8787);
app.listen(port, () => console.log(`PackWise API on http://localhost:${port}`));
