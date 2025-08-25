const pdfParse = require("pdf-parse");
const csvParser = require("csv-parser");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const { pool } = require("../config/database");
const openaiService = require("./openai");
const { toSql } = require("pgvector");

class DocumentProcessor {
  // Process PDF files with improved text cleaning
  async processPDF(filePath, filename) {
    try {
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdfParse(dataBuffer);

      // Clean and chunk the text with better preprocessing
      const cleanedText = this.cleanText(data.text);
      const chunks = this.chunkText(cleanedText);

      console.log(
        `PDF processed: ${filename} - ${chunks.length} chunks created`
      );

      // Save document to database
      const documentId = await this.saveDocument(filename, "pdf", cleanedText);

      // Generate embeddings and save
      await this.processChunks(chunks, documentId);

      return { success: true, chunks: chunks.length, documentId };
    } catch (error) {
      console.error("Error processing PDF:", error);
      throw error;
    }
  }

  // Process CSV files
  async processCSV(filePath, filename) {
    try {
      const results = [];

      return new Promise((resolve, reject) => {
        fs.createReadStream(filePath)
          .pipe(csvParser())
          .on("data", (data) => results.push(data))
          .on("end", async () => {
            try {
              // Convert CSV to text format
              const csvText = this.csvToText(results);
              const cleanedText = this.cleanText(csvText);
              const chunks = this.chunkText(cleanedText);

              // Save document to database
              const documentId = await this.saveDocument(
                filename,
                "csv",
                cleanedText
              );

              // Generate embeddings and save
              await this.processChunks(chunks, documentId);

              resolve({ success: true, chunks: chunks.length, documentId });
            } catch (error) {
              reject(error);
            }
          })
          .on("error", reject);
      });
    } catch (error) {
      console.error("Error processing CSV:", error);
      throw error;
    }
  }

  // Convert CSV data to text format
  csvToText(csvData) {
    if (csvData.length === 0) return "";

    const headers = Object.keys(csvData[0]);
    let text = `CSV Data with columns: ${headers.join(", ")}\n\n`;

    csvData.forEach((row, index) => {
      text += `Row ${index + 1}:\n`;
      headers.forEach((header) => {
        text += `${header}: ${row[header]}\n`;
      });
      text += "\n";
    });

    return text;
  }

  // Clean and normalize text for better processing
  cleanText(text) {
    return (
      text
        // Remove excessive whitespace and normalize
        .replace(/\s+/g, " ")
        // Remove page numbers and headers/footers
        .replace(/\b(Page|page)\s+\d+\b/g, "")
        .replace(/\b\d+\s*\/\s*\d+\b/g, "")
        // Remove common PDF artifacts
        .replace(/\b[A-Z\s]{3,}\s*\d+\s*[A-Z\s]{3,}/g, "") // Headers like "CHAPTER 1 INTRODUCTION"
        .replace(/\b\d{1,2}\s*[A-Z]{3,}\s*\d{4}\b/g, "") // Dates in headers
        // Normalize line breaks
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        // Remove excessive newlines
        .replace(/\n{3,}/g, "\n\n")
        // Remove bullet points and numbering artifacts
        .replace(/^\s*[\•\-\*]\s*/gm, "")
        .replace(/^\s*\d+\.\s*/gm, "")
        // Trim whitespace
        .trim()
    );
  }

  // Improved chunking with better semantic boundaries
  chunkText(text, chunkSize = 600, overlap = 100) {
    const chunks = [];
    let start = 0;

    while (start < text.length) {
      let end = start + chunkSize;

      // Try to break at better semantic boundaries
      if (end < text.length) {
        // Look for paragraph breaks first (double newlines)
        const nextParagraph = text.indexOf("\n\n", end);
        const nextSentence = text.indexOf(". ", end);
        const nextNewline = text.indexOf("\n", end);

        let breakPoint = text.length;

        // Prefer paragraph breaks
        if (nextParagraph !== -1 && nextParagraph <= end + 200) {
          breakPoint = nextParagraph + 2;
        }
        // Then sentence breaks
        else if (nextSentence !== -1 && nextSentence <= end + 150) {
          breakPoint = nextSentence + 2;
        }
        // Then single newlines
        else if (nextNewline !== -1 && nextNewline <= end + 100) {
          breakPoint = nextNewline + 1;
        }

        if (breakPoint < text.length) {
          end = breakPoint;
        }
      }

      const chunk = text.substring(start, end).trim();

      // Only include substantial chunks with meaningful content
      if (chunk.length > 80 && this.hasMeaningfulContent(chunk)) {
        chunks.push(chunk);
      }

      start = end - overlap;
      if (start >= text.length) break;
    }

    return chunks;
  }

  // Check if chunk has meaningful content
  hasMeaningfulContent(chunk) {
    // Remove common PDF artifacts
    const cleanChunk = chunk
      .replace(/\b(Page|page)\s+\d+\b/g, "")
      .replace(/\b\d+\s*\/\s*\d+\b/g, "")
      .replace(/[^\w\s\.\,\!\?\;\:\-\(\)]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // Check if it has enough words and isn't just numbers/symbols
    const words = cleanChunk.split(/\s+/).filter((word) => word.length > 1);
    const meaningfulWords = words.filter((word) => /[a-zA-Z]/.test(word));

    return (
      meaningfulWords.length >= 8 && meaningfulWords.length / words.length > 0.3
    );
  }

  // Save document to database
  async saveDocument(filename, fileType, content) {
    const query = `
      INSERT INTO documents (filename, file_type, content)
      VALUES ($1, $2, $3)
      RETURNING id
    `;

    const result = await pool.query(query, [filename, fileType, content]);
    return result.rows[0].id;
  }

  // Process chunks and generate embeddings
  async processChunks(chunks, documentId) {
    try {
      const embeddings = await openaiService.generateBatchEmbeddings(chunks);

      for (let i = 0; i < chunks.length; i++) {
        await pool.query(
          `INSERT INTO embeddings (document_id, chunk_text, embedding, chunk_index)
           VALUES ($1, $2, $3, $4)`,
          [
            documentId,
            chunks[i],
            toSql(embeddings[i]), // ensures proper pgvector format
            i,
          ]
        );
      }

      console.log(
        `Processed ${chunks.length} chunks for document ${documentId}`
      );
    } catch (error) {
      console.error("Error processing chunks:", error);
      throw error;
    }
  }

  // Improved search with better filtering and more context
  async searchSimilarChunks(query, limit = 10) {
    try {
      console.log({ query });

      // Generate embedding for the search query
      const queryEmbedding = await openaiService.generateEmbeddings(query);

      // Use pgvector's <=> operator for cosine distance with similarity threshold
      const searchQuery = `
        SELECT e.chunk_text,
               e.document_id,
               d.filename,
               e.embedding <=> $1 AS distance,
               e.chunk_index
        FROM embeddings e
        JOIN documents d ON e.document_id = d.id
        WHERE e.embedding <=> $1 < 0.85
        ORDER BY e.embedding <=> $1
        LIMIT $2
      `;

      const result = await pool.query(searchQuery, [
        toSql(queryEmbedding), // format as vector
        limit,
      ]);

      // If no results with threshold, get top results without threshold
      if (result.rows.length === 0) {
        const fallbackQuery = `
          SELECT e.chunk_text,
                 e.document_id,
                 d.filename,
                 e.embedding <=> $1 AS distance,
                 e.chunk_index
          FROM embeddings e
          JOIN documents d ON e.document_id = d.id
          ORDER BY e.embedding <=> $1
          LIMIT $2
        `;

        const fallbackResult = await pool.query(fallbackQuery, [
          toSql(queryEmbedding),
          limit,
        ]);

        return fallbackResult.rows;
      }

      // Filter out very low quality matches
      const filteredResults = result.rows.filter((row) => row.distance < 0.9);

      return filteredResults.length > 0 ? filteredResults : result.rows;
    } catch (error) {
      console.error("Error searching similar chunks:", error);
      throw error;
    }
  }
}

module.exports = new DocumentProcessor();
