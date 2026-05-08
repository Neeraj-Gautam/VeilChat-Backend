import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";

import config from "./config/index.js";
import routes from "./routes/index.js";
import notFound from "./middlewares/notFound.js";
import errorHandler from "./middlewares/errorHandler.js";

const app = express();

// ── Security ──────────────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: config.cors.clientUrl,
    credentials: true,
  })
);

// ── Cookies ───────────────────────────────────────────────
app.use(cookieParser());

// ── Body Parsing ──────────────────────────────────────────
app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));

// ── Logging ───────────────────────────────────────────────
if (config.node_env === "development") {
  app.use(morgan("dev"));
} else {
  app.use(morgan("combined"));
}

// ── API Routes ────────────────────────────────────────────
app.use("/api", routes);

// ── Error Handling ────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

export default app;
