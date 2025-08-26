const express = require("express");
const documentProcessor = require("../services/documentProcessor");
const openaiService = require("../services/openai");
const { pool } = require("../config/database");
const axios = require("axios");
const router = express.Router();
const { getResponseForIntent } = require("./../services/intentResponses");

// POST /api/chat/query - Ask a question and get contextual response
router.post("/query", async (req, res) => {
  try {
    const { question } = req.body;

    if (!question || question.trim().length === 0) {
      return res.status(400).json({ error: "Question is required" });
    }

    let data = { message: question };

    let config = {
      method: "post",
      maxBodyLength: Infinity,
      url: "http://localhost:9945/spacy-nlu/my-bot/chat",
      headers: { "Content-Type": "application/json" },
      data: data,
    };

    // ✅ use async/await instead of then/catch
    const resp = await axios.request(config);
    console.log("Spacy NLU:", resp.data);

    if (resp.data.intent) {
      const response = getResponseForIntent(resp.data.intent);

      console.log({ question, response });
      const chathist = await saveChatHistory(
        question,
        response,
        ["nlu training data set"],
        "answered"
      );
      console.log({ chathist });
      return res.json({
        success: true,
        question: question,
        answer: response,
        context: "",
        sources: [], // Remove duplicates
        // chatHistory: [],
        type: "answered",
      });
    }

    // Get the last 3 chat interactions for context
    // const chatHistory = await getRecentChatHistory(3);

    // Search for relevant document chunks with improved context building
    const similarChunks = await documentProcessor.searchSimilarChunks(
      question,
      3
    );
    console.log({ similarChunks });

    // Build context from relevant chunks with better formatting
    let context = "";
    const contextDocuments = [];

    if (similarChunks.length > 0) {
      // Sort chunks by document and chunk index for better context flow
      const sortedChunks = similarChunks.sort((a, b) => {
        if (a.filename !== b.filename) {
          return a.filename.localeCompare(b.filename);
        }
        return a.chunk_index - b.chunk_index;
      });

      // Group chunks by document
      const chunksByDocument = {};
      sortedChunks.forEach((chunk) => {
        if (!chunksByDocument[chunk.filename]) {
          chunksByDocument[chunk.filename] = [];
        }
        chunksByDocument[chunk.filename].push(chunk);
      });

      // Build context with document sections
      const contextSections = [];
      Object.entries(chunksByDocument).forEach(([filename, chunks]) => {
        contextDocuments.push(filename);
        const documentContext = chunks
          .map((chunk) => chunk.chunk_text)
          .join("\n\n");
        contextSections.push(`From ${filename}:\n${documentContext}`);
      });

      context = contextSections.join("\n\n---\n\n");
    } else {
      context = "No relevant documents found in the knowledge base.";
    }

    // Generate response using OpenAI
    const answer = await openaiService.generateResponse(
      question,
      context
      // chatHistory
    );

    // Determine the type based on context and response
    let type = "answered";
    if (
      contextDocuments.length === 0 ||
      context === "No relevant documents found in the knowledge base."
    ) {
      type = "unanswered";
    } else if (
      answer.toLowerCase().includes("i don't know") ||
      answer.toLowerCase().includes("i cannot") ||
      answer.toLowerCase().includes("i'm not sure") ||
      answer.toLowerCase().includes("i don't have enough information")
    ) {
      type = "human_intervention";
    }

    // Save the chat interaction
    await saveChatHistory(question, answer, contextDocuments, type);

    console.log({ question, answer, contextDocuments, type });

    res.json({
      success: true,
      question: question,
      answer: answer,
      context: context,
      sources: [...new Set(contextDocuments)], // Remove duplicates
      // chatHistory: chatHistory,
      type: type,
    });
  } catch (error) {
    console.error("Chat query error:", error);
    res.status(500).json({
      error: "Error processing question",
      details: error.message,
    });
  }
});

// GET /api/chat/history - Get chat history
router.get("/history", async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;

    const query = `
      SELECT id, type, question, answer, context_documents, created_at
      FROM message_history
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `;

    const result = await pool.query(query, [parseInt(limit), parseInt(offset)]);

    res.json({
      success: true,
      chatHistory: result.rows,
      total: result.rows.length,
    });
  } catch (error) {
    console.error("Error fetching chat history:", error);
    res.status(500).json({
      error: "Error fetching chat history",
      details: error.message,
    });
  }
});

// DELETE /api/chat/history/:id - Delete a specific chat entry
router.delete("/history/:id", async (req, res) => {
  try {
    const chatId = req.params.id;

    const query = "DELETE FROM message_history WHERE id = $1 RETURNING id";
    const result = await pool.query(query, [chatId]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Chat entry not found" });
    }

    res.json({
      success: true,
      message: "Chat entry deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting chat entry:", error);
    res.status(500).json({
      error: "Error deleting chat entry",
      details: error.message,
    });
  }
});

// DELETE /api/chat/history - Clear all chat history
router.delete("/history", async (req, res) => {
  try {
    await pool.query("DELETE FROM message_history");

    res.json({
      success: true,
      message: "All chat history cleared successfully",
    });
  } catch (error) {
    console.error("Error clearing chat history:", error);
    res.status(500).json({
      error: "Error clearing chat history",
      details: error.message,
    });
  }
});

// PUT /api/chat/history/:id/respond - Add human response to a chat entry
router.put("/history/:id/respond", async (req, res) => {
  try {
    const chatId = req.params.id;
    const { humanResponse } = req.body;

    if (!humanResponse) {
      return res.status(400).json({ error: "Human response is required" });
    }

    const query = `
      UPDATE message_history 
      SET answer = $1, type = 'human_responded'
      WHERE id = $2 AND type = 'human_intervention'
      RETURNING id
    `;

    const result = await pool.query(query, [humanResponse, chatId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Chat entry not found or not eligible for human response",
      });
    }

    res.json({
      success: true,
      message: "Human response added successfully",
    });
  } catch (error) {
    console.error("Error adding human response:", error);
    res.status(500).json({
      error: "Error adding human response",
      details: error.message,
    });
  }
});

// Helper function to get recent chat history
async function getRecentChatHistory(limit = 3) {
  try {
    const query = `
      SELECT question, answer
      FROM message_history
      ORDER BY created_at DESC
      LIMIT $1
    `;

    const result = await pool.query(query, [limit]);
    return result.rows.reverse(); // Return in chronological order
  } catch (error) {
    console.error("Error getting recent chat history:", error);
    return [];
  }
}

// Helper function to save chat history
async function saveChatHistory(
  question,
  answer,
  contextDocuments,
  type = null
) {
  try {
    const query = `
      INSERT INTO message_history (question, answer, context_documents, type)
      VALUES ($1, $2, $3, $4)
    `;

    await pool.query(query, [question, answer, contextDocuments, type]);
  } catch (error) {
    console.error("Error saving chat history:", error);
  }
}

module.exports = router;
