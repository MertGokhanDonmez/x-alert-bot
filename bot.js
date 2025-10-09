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
  btcusdt: 0.1,
  ethusdt: 0.5,
  xrpusdt: 8.0,
};

const lastPrices = {};

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

  if (lastPrices[symbol]) {
    const change = ((price - lastPrices[symbol]) / lastPrices[symbol]) * 100;
    if (Math.abs(change) >= thresholds[symbol]) {
      const direction = change > 0 ? "UP" : "DOWN";
      const alert = `⚠️ ${symbol.toUpperCase()} abnormal move: ${change.toFixed(
        2
      )}% ${direction} (last: ${price.toFixed(2)} USDT)`;
      console.log(alert);

      try {
        await rwClient.v2.tweet(alert);
        console.log(alert);
      } catch (err) {
        console.error("Error posting tweet:", err);
      }
    }
  }
  lastPrices[symbol] = price;
});

// On error
ws.on("error", (err) => {
  console.error("WebSocket error:", err);
});

// On close
ws.on("close", () => {
  console.log("WebSocket closed.");
});
