import express from "express";
import { resolve } from "node:path";
import { createGameServer } from "./app.js";

const { app, http } = createGameServer(process.env.ALLOWED_ORIGIN);
if (process.env.NODE_ENV !== "production") {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true, allowedHosts: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  app.use(express.static(resolve("dist")));
  app.get("/{*path}", (_req, res) => res.sendFile(resolve("dist/index.html")));
}
http.listen(Number(process.env.PORT) || 3000, "0.0.0.0", () =>
  console.log("Salpakan is ready on port", process.env.PORT || 3000),
);
