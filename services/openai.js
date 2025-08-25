const OpenAI = require("openai");
require("dotenv").config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

class OpenAIService {
  // Generate embeddings for text chunks
  async generateEmbeddings(text) {
    try {
      const response = await openai.embeddings.create({
        model: "text-embedding-ada-002",
        input: text,
      });
      return response.data[0].embedding;
    } catch (error) {
      console.error("Error generating embeddings:", error);
      throw error;
    }
  }

  // Generate chat completion with context
  async generateResponse(question, context, chatHistory = []) {
    try {
      const systemPrompt = `You are a helpful assistant that answers questions based on the provided document context. 

IMPORTANT INSTRUCTIONS:
1. Base your answer primarily on the context provided below
2. If the context contains relevant information, use it to provide a detailed and accurate answer
3. If the context doesn't contain enough information to answer the question, clearly state this
4. Cite specific parts of the documents when possible
5. Be concise but comprehensive
6. If you're unsure about something, acknowledge the uncertainty

Context from uploaded documents:
${context}

Previous conversation for continuity:
${chatHistory
  .map((chat) => `User: ${chat.question}\nAssistant: ${chat.answer}`)
  .join("\n")}

Please provide a clear, accurate answer based on the context provided.`;

      const response = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: question },
        ],
        max_tokens: 1000,
        temperature: 0.7,
      });

      return response.choices[0].message.content;
    } catch (error) {
      console.error("Error generating response:", error);
      throw error;
    }
  }

  // Generate embeddings for multiple texts
  async generateBatchEmbeddings(texts) {
    try {
      const response = await openai.embeddings.create({
        model: "text-embedding-ada-002",
        input: texts,
      });
      return response.data.map((item) => item.embedding);
    } catch (error) {
      console.error("Error generating batch embeddings:", error);
      throw error;
    }
  }
}

module.exports = new OpenAIService();
