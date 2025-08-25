const express = require("express");
const { pool } = require("../config/database");
const openaiService = require("../services/openai");

const router = express.Router();

// POST /api/flows/execute - Execute a flow based on user input
router.post("/execute", async (req, res) => {
  try {
    const { userInput, flowData, sessionId, currentStep = 0 } = req.body;

    if (!userInput || !flowData) {
      return res
        .status(400)
        .json({ error: "User input and flow data are required" });
    }

    const nodes = flowData.nodes || [];
    const edges = flowData.edges || [];

    // Find the current node to execute
    let currentNode = nodes[currentStep];
    if (!currentNode) {
      return res.json({
        success: true,
        response: "Flow completed",
        nextStep: null,
        variables: {},
      });
    }

    let response = "";
    let nextStep = currentStep + 1;
    let variables = {};

    // Execute based on node type
    switch (currentNode.type) {
      case "intent":
        // Detect intent from user input
        const intentKeywords = currentNode.data.intentKeywords || "";
        const confidence = currentNode.data.confidence || 0.7;

        const keywords = intentKeywords
          .split(",")
          .map((k) => k.trim().toLowerCase());
        const userInputLower = userInput.toLowerCase();

        const matchedKeywords = keywords.filter((keyword) =>
          userInputLower.includes(keyword)
        );

        const intentDetected = matchedKeywords.length > 0;

        if (intentDetected) {
          response = `Intent detected: ${matchedKeywords.join(", ")}`;
          // Continue to next step
        } else {
          response = "I didn't understand that. Could you please rephrase?";
          nextStep = currentStep; // Stay on same step
        }
        break;

      case "textInput":
        // Collect text input
        const question =
          currentNode.data.question || "Please provide your input:";
        const variableName = currentNode.data.variableName || "userInput";

        if (
          currentStep === 0 ||
          userInput.toLowerCase().includes("yes") ||
          userInput.toLowerCase().includes("no")
        ) {
          // First time or user responding to a yes/no question
          response = question;
          nextStep = currentStep; // Stay on same step to collect input
        } else {
          // User provided input, store it and move to next step
          variables[variableName] = userInput;
          response = `Thank you! I've recorded: ${userInput}`;
        }
        break;

      case "button":
        // Handle button options
        const buttonQuestion =
          currentNode.data.question || "Please select an option:";
        const buttonVariableName =
          currentNode.data.variableName || "userChoice";
        const options = currentNode.data.options || [];

        if (options.length === 0) {
          response = buttonQuestion;
          nextStep = currentStep;
        } else {
          // Check if user input matches any option
          const userChoice = options.find(
            (option) =>
              userInput.toLowerCase().includes(option.label.toLowerCase()) ||
              userInput.toLowerCase().includes(option.value.toLowerCase())
          );

          if (userChoice) {
            variables[buttonVariableName] = userChoice.value;
            response = `You selected: ${userChoice.label}`;
          } else {
            response = `${buttonQuestion}\n\nOptions:\n${options
              .map((opt) => `• ${opt.label}`)
              .join("\n")}`;
            nextStep = currentStep;
          }
        }
        break;

      case "response":
        // Send bot response
        let message = currentNode.data.message || "Thank you!";
        const responseVariables = currentNode.data.variables || "";

        // Replace variables in message
        if (responseVariables) {
          const varNames = responseVariables.split(",").map((v) => v.trim());
          varNames.forEach((varName) => {
            const placeholder = `{${varName}}`;
            if (message.includes(placeholder)) {
              message = message.replace(placeholder, userInput || "[value]");
            }
          });
        }

        response = message;
        break;

      case "condition":
        // Handle conditional logic
        const conditions = currentNode.data.conditions || [];
        let conditionMet = false;

        for (const condition of conditions) {
          const field = condition.field;
          const operator = condition.operator;
          const value = condition.value;

          // Simple condition checking (you can expand this)
          if (operator === "exists" && userInput && userInput.trim() !== "") {
            conditionMet = true;
            break;
          } else if (
            operator === "contains" &&
            userInput.toLowerCase().includes(value.toLowerCase())
          ) {
            conditionMet = true;
            break;
          } else if (
            operator === "equals" &&
            userInput.toLowerCase() === value.toLowerCase()
          ) {
            conditionMet = true;
            break;
          }
        }

        if (conditionMet) {
          response = "Condition met, proceeding...";
        } else {
          response = "Condition not met, please try again.";
          nextStep = currentStep;
        }
        break;

      default:
        response = "Unknown node type";
        break;
    }

    // Save flow execution to database
    await saveFlowExecution(
      sessionId,
      userInput,
      response,
      currentNode,
      variables
    );

    res.json({
      success: true,
      response,
      nextStep,
      variables,
      currentNode: currentNode.type,
      flowCompleted: nextStep >= nodes.length,
    });
  } catch (error) {
    console.error("Flow execution error:", error);
    res.status(500).json({
      error: "Error executing flow",
      details: error.message,
    });
  }
});

// GET /api/flows/list - Get list of saved flows
router.get("/list", async (req, res) => {
  try {
    const query = `
      SELECT id, name, created_at, updated_at
      FROM flows
      ORDER BY updated_at DESC
    `;

    const result = await pool.query(query);

    res.json({
      success: true,
      flows: result.rows,
    });
  } catch (error) {
    console.error("Error fetching flows:", error);
    res.status(500).json({
      error: "Error fetching flows",
      details: error.message,
    });
  }
});

// POST /api/flows/save - Save a flow
router.post("/save", async (req, res) => {
  try {
    const { name, nodes, edges } = req.body;

    if (!name || !nodes) {
      return res
        .status(400)
        .json({ error: "Flow name and nodes are required" });
    }

    const query = `
      INSERT INTO flows (name, nodes, edges, created_at, updated_at)
      VALUES ($1, $2, $3, NOW(), NOW())
      RETURNING id
    `;

    const result = await pool.query(query, [
      name,
      JSON.stringify(nodes),
      JSON.stringify(edges),
    ]);

    res.json({
      success: true,
      flowId: result.rows[0].id,
      message: "Flow saved successfully",
    });
  } catch (error) {
    console.error("Error saving flow:", error);
    res.status(500).json({
      error: "Error saving flow",
      details: error.message,
    });
  }
});

// Helper function to save flow execution
async function saveFlowExecution(
  sessionId,
  userInput,
  response,
  currentNode,
  variables
) {
  try {
    const query = `
      INSERT INTO flow_executions (session_id, user_input, bot_response, node_type, node_data, variables, executed_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
    `;

    await pool.query(query, [
      sessionId,
      userInput,
      response,
      currentNode.type,
      JSON.stringify(currentNode.data),
      JSON.stringify(variables),
    ]);
  } catch (error) {
    console.error("Error saving flow execution:", error);
  }
}

module.exports = router;
