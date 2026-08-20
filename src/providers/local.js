const openai = require("./openai");

const DEFAULT_URL = "http://127.0.0.1:11434/v1";

function complete(options = {}) {
  return openai.complete({ ...options, apiUrl: options.apiUrl || DEFAULT_URL });
}

module.exports = { complete, DEFAULT_URL };
