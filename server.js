const express = require("express");
const cors = require("cors");
require("dotenv").config();

const { initDatabase } = require("./config/database");
const uploadRoutes = require("./routes/upload");
const chatRoutes = require("./routes/chat");
const flowRoutes = require("./routes/flows");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Routes
app.use("/api/upload", uploadRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/flows", flowRoutes);

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    message: "RAG Chatbot API is running",
  });
});

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    message: "RAG Chatbot API",
    version: "1.0.0",
    endpoints: {
      upload: "/api/upload",
      chat: "/api/chat",
      health: "/health",
    },
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error("Unhandled error:", error);
  res.status(500).json({
    error: "Internal server error",
    message: error.message,
  });
});

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    error: "Endpoint not found",
    message: `The endpoint ${req.originalUrl} does not exist`,
  });
});

// Initialize database and start server
async function startServer() {
  try {
    await initDatabase();

    app.listen(PORT, () => {
      console.log(`🚀 RAG Chatbot API server running on port ${PORT}`);
      console.log(`📚 Health check: http://localhost:${PORT}/health`);
      console.log(`📤 Upload endpoint: http://localhost:${PORT}/api/upload`);
      console.log(`💬 Chat endpoint: http://localhost:${PORT}/api/chat`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();
