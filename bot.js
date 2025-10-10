import WebSocket from "ws";
import { TwitterApi } from "twitter-api-v2";

// X API credentials
const client = new TwitterApi({
  appKey: "NRDXoXeKtRYqzSY054kx3DKPm",
  appSecret: "6ozyLLNZNVKMpqb8Oao1jqG7yAiNRFXHRzoighNA4Ll3yKi3rE",
  accessToken: "1976073444010725376-nG3UdJHTQqFFyaDtHEKIIOj2GSPgVC",
  accessSecret: "5Eufc0UXHcY4S1PMG1o7CrZ0VgHOxpXZ1j1bHnLDixGXI",
});

const rwClient = client.readWrite;

// abnormal thresholds (%)
const thresholds = {
  btcusdt: 1.0,
  ethusdt: 1.0,
  xrpusdt: 2.0,
};

const firstPrice = {};
let firstTimestamp = null;
const alertState = {};

// Binance WebSocket endpoint
const ws = new WebSocket("wss://stream.binance.com:9443/ws");

// On open, subscribe to tickers
ws.on("open", () => {
  const params = {
    method: "SUBSCRIBE",
    params: ["btcusdt@ticker", "ethusdt@ticker", "xrpusdt@ticker"],
    id: 1,
  };
  ws.send(JSON.stringify(params));
  console.log("Connected and subscribed.");
});

// On message, process price updates
ws.on("message", async (msg) => {
  const data = JSON.parse(msg);
  if (!data.s || !data.c) return; // not a ticker event

  const symbol = data.s.toLowerCase(); // e.g. BTCUSDT -> btcusdt
  const price = parseFloat(data.c);
  const time = data.E; // event time

  // Record the first price and time for each symbol
  if (!(symbol in firstPrice)) {
    firstPrice[symbol] = price;
    firstTimestamp = time;
    alertState[symbol] = false;
    console.log(
      "Started tracking",
      symbol,
      "at:",
      new Date(time),
      "Price:",
      price
    );
    return;
  }

  // if a minute has passed, reset the base price and time for this symbol
  if (time - firstTimestamp >= 60 * 1000) {
    firstPrice[symbol] = price;
    firstTimestamp = time;
    alertState[symbol] = false;
  }

  // change percentage
  const diff = ((price - firstPrice[symbol]) / firstPrice[symbol]) * 100;

  if (!alertState[symbol] && Math.abs(diff) >= thresholds[symbol]) {
    const direction = diff > 0 ? "UP" : "DOWN";
    const alert = `${
      direction == "UP" ? "🚀" : "🔻"
    } ${symbol.toUpperCase()} abnormal move: ${diff.toFixed(
      2
    )}% ${direction} (last: ${price.toFixed(2)} USDT)`;
    console.log(alert);

    try {
      await rwClient.v2.tweet(alert);
      console.log(alert);
    } catch (err) {
      console.error("Error posting tweet:", err);
    }
    alertState[symbol] = true; // set alert state to true to avoid repeated alerts for this symbol
  }
});

// On error
ws.on("error", (err) => {
  console.error("WebSocket error:", err);
});

// On close
ws.on("close", () => {
  console.log("WebSocket closed.");
});
