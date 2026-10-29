
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGIN || `http://localhost:${PORT}`,
  })
);
app.use(express.json({ limit: "20kb" }));

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "Backend is running" });
});

// Load and validate route exports
function loadRouter(routePath) {
  const routeModule = require(routePath);
  const router =
    routeModule.router ||
    routeModule.default ||
    routeModule;

  if (typeof router !== "function") {
    throw new Error(
      `Invalid router in ${routePath}. Ensure the file exports an Express router.`
    );
  }

  return router;
}

// API routes
app.use("/api/auth", loadRouter("./routes/auth"));
app.use("/api/listings", loadRouter("./routes/listings"));
app.use("/api/requests", loadRouter("./routes/requests"));
app.use("/api/messages", loadRouter("./routes/messages"));

// Serve frontend
app.use(express.static(path.join(__dirname, "../frontend")));

// Handle unknown API routes
app.use("/api", (req, res) => {
  res.status(404).json({ error: "API endpoint not found" });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack || err.message || err);

  res.status(err.status || 500).json({
    error:
      process.env.NODE_ENV === "production"
        ? "Internal server error"
        : err.message || "Internal server error",
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
