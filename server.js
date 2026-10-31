require('dns').setServers(['8.8.8.8', '1.1.1.1']);
"use strict";

require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const { connectDatabase, disconnectDatabase } = require("./config/db");
const apiRoutes = require("./routes/api");
const asyncHandler = require("./middleware/asyncHandler");
const notFound = require("./middleware/notFound");
const errorHandler = require("./middleware/errorHandler");

function createApp() {
  const app = express();
  const clientOrigin = process.env.CLIENT_ORIGIN || "http://localhost:" + (process.env.PORT || "5000");
  app.disable("x-powered-by");
  app.use(cors({
    origin(origin, callback) {
      if (!origin || clientOrigin === "*" || origin === clientOrigin) return callback(null, true);
      return callback(new Error("This client origin is not allowed by CORS."));
    }
  }));
  app.use(express.json({ limit: "1mb" }));
  app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
  app.get("/api/health", (req, res) => res.json({
    success: true,
    data: { status: "ok", database: require("mongoose").connection.readyState === 1 ? "connected" : "disconnected" },
    message: "Service health checked."
  }));
  app.use("/api", apiRoutes);
  app.use("/css", express.static(path.join(__dirname, "css"), { fallthrough: false }));
  app.use("/js", express.static(path.join(__dirname, "js"), { fallthrough: false }));
  app.get("/", asyncHandler(async (req, res) => res.sendFile(path.join(__dirname, "index.html"))));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

async function startServer() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required. Copy .env.example to .env and configure MongoDB.");
  const app = createApp();
  await connectDatabase();
  const port = Number(process.env.PORT || 5000);
  const server = await new Promise((resolve, reject) => {
    const httpServer = app.listen(port, () => resolve(httpServer));
    httpServer.once("error", reject);
  });
  console.log(`Smart Healthcare PMIS is running at http://localhost:${port}`);
  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received; closing server and MongoDB connection.`);
    server.close(async (error) => {
      if (error) {
        console.error("HTTP server shutdown failed:", error.message);
        process.exitCode = 1;
      }
      try {
        await disconnectDatabase();
      } catch (disconnectError) {
        console.error("MongoDB disconnect failed:", disconnectError.message);
        process.exitCode = 1;
      }
    });
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  require("mongoose").connection.on("error", (error) => {
    console.error("MongoDB connection error:", error.message);
  });
  return server;
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error("Server startup failed:", error.message);
    process.exitCode = 1;
  });
}

module.exports = { createApp, startServer };
