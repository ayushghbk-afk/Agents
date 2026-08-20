const openai = require("./openai");

const DEFAULT_URL = "https://api.groq.com/openai/v1";

function complete(options = {}) {
  return openai.complete({ ...options, apiUrl: options.apiUrl || DEFAULT_URL });
}

module.exports = { complete, DEFAULT_URL };
