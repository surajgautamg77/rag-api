// intentResponses.js

const intentResponses = {
  greet: [
    "Hello! Welcome to Rhysley 👋 How can I help you today?",
    "Welcome to Rhysley 😊 How may I assist you?",
    "Hey! Welcome to Rhysley 😊. What product are you interested in?",
  ],
  goodbye: [
    "Goodbye! Thanks for visiting Rhysley.",
    "See you soon 👋 Stay safe and healthy!",
  ],
  affirm: [
    "Great! 👍 Let’s get that sorted for you.",
    "Perfect! I’ll guide you further.",
    "Awesome choice 😊",
    "Okay, noted. Let’s move ahead.",
  ],
  deny: [
    "No problem, let’s explore other options.",
    "Alright, maybe you’d like to check another product.",
    "Got it! I won’t proceed with that one.",
    "Sure, let’s try a different approach.",
  ],
  location: [
    "Rhysley Pvt. Ltd : Manufacturing Unit Plot No.161, Sector-68, IMT, Faridabad, Haryana - 1210 04, India",
  ],
  request_human: [
    "Sure, let me connect you with a Rhysley support agent.",
    "No worries, a Rhysley representative will assist you shortly.",
  ],
};

function getResponseForIntent(intent) {
  const responses = intentResponses[intent] || [
    "I'm not sure how to respond to that.",
  ];
  return responses[Math.floor(Math.random() * responses.length)];
}

module.exports = {
  intentResponses,
  getResponseForIntent,
};
