// intentResponses.js

const intentResponses = {
  greet: [
    "Hello! Welcome to Rhysley 👋 How can I help you today?",
    "Hi there! Looking for masks, purifiers, or something else?",
    "Welcome to Rhysley 😊 How may I assist you?",
    "Hey! Glad to see you here. What product are you interested in?",
  ],
  goodbye: [
    "Goodbye! Thanks for visiting Rhysley.",
    "See you soon 👋 Stay safe and healthy!",
    "Take care! We’ll be here whenever you need masks or purifiers.",
    "Bye! Come back anytime to explore our products.",
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
    "Rhysley is based in India 🇮🇳 but we serve customers worldwide 🌍.",
    "Our headquarters are in India, and we ship internationally.",
    "We’re an Indian brand with a global presence 🌎.",
    "Rhysley operates from India, bringing health & safety products to the world.",
  ],
  request_human: [
    "Sure, let me connect you with a Rhysley support agent.",
    "I’ll transfer your request to one of our team members 👩‍💻.",
    "No worries, a Rhysley representative will assist you shortly.",
    "Okay, I’ll get a human agent to help you right away.",
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
