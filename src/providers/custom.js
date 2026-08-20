const openai = require("./openai");
const config = require("../config");

function complete(options = {}) {
  return openai.complete({ ...options, apiUrl: options.apiUrl || config.apiUrl });
}

module.exports = { complete };
