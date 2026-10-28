require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || `http://localhost:${PORT}`
}));
app.use(express.json({ limit: "20kb" }));

app.get("/api/health", (req, res) => {
  res.json({ status: "Backend is running" });
});

app.use("/api/auth", require("./routes/auth"));
app.use("/api/listings", require("./routes/listings"));
app.use("/api/requests", require("./routes/requests"));
app.use("/api/messages", require("./routes/messages"));

app.use(express.static(path.join(__dirname, "../frontend")));

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});