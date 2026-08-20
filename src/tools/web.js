const config = require("../config");
const { clip } = require("./filesystem");

async function fetchUrl(url) {
  if (!config.allowNetwork) throw new Error("Network disabled; set ALLOW_NETWORK=true");
  if (typeof url !== "string" || !/^https?:\/\//i.test(url)) throw new Error("Only http(s) URLs are allowed");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.requestTimeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: "follow" });
    const text = await response.text();
    return { status: response.status, url: response.url, body: clip(text, Math.min(config.maxToolOutput, 12000)) };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { fetchUrl };
