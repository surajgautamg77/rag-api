const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || "rag_chatbot",
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Initialize database tables
const initDatabase = async () => {
  try {
    // Enable pgvector extension
    await pool.query("CREATE EXTENSION IF NOT EXISTS vector;");

    // Create documents table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        filename VARCHAR(255) NOT NULL,
        file_type VARCHAR(10) NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create embeddings table with vector support
    await pool.query(`
      CREATE TABLE IF NOT EXISTS embeddings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
        chunk_text TEXT NOT NULL,
        embedding vector(1536),
        chunk_index INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create message_history table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS message_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        type VARCHAR(50),
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        context_documents TEXT[],
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create flows table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS flows (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        nodes JSONB NOT NULL,
        edges JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create flow_executions table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS flow_executions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id VARCHAR(255) NOT NULL,
        user_input TEXT NOT NULL,
        bot_response TEXT NOT NULL,
        node_type VARCHAR(50) NOT NULL,
        node_data JSONB NOT NULL,
        variables JSONB NOT NULL,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create index for vector similarity search
    await pool.query(`
      CREATE INDEX IF NOT EXISTS embeddings_vector_idx 
      ON embeddings 
      USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100);
    `);

    console.log("Database initialized successfully");
  } catch (error) {
    console.error("Error initializing database:", error);
    throw error;
  }
};

module.exports = { pool, initDatabase };
