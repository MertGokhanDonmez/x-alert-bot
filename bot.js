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
  btcusdt: 0.01,
  ethusdt: 0.01,
  xrpusdt: 5.0,
};

const firstPrice = {};
let firstTimestamp = null;
const alertState = {};
const percentage = {};

// Binance WebSocket endpoint
const ws = new WebSocket("wss://stream.binance.com:9443/ws");

// On open, subscribe to tickers
ws.on("open", () => {
  const params = {
    method: "SUBSCRIBE",
    params: ["btcusdt@ticker_1h", "ethusdt@ticker_1h", "xrpusdt@ticker_1h"],
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
  const currentTime = data.E; // event time
  const timeRange = 60 * 60 * 1000;

  // Record the first price and time for each symbol
  if (!(symbol in firstPrice)) {
    firstPrice[symbol] = price;
    firstTimestamp = currentTime;
    alertState[symbol] = false;
    console.log(
      "Started tracking",
      symbol,
      "at:",
      new Date(currentTime).toString(),
      "Price:",
      price
    );
    return;
  }

  // if an hour has passed, reset the base price and time for this symbol
  if (currentTime % timeRange === 0) {
    percentage[symbol] = firstPrice[symbol]
      ? ((price - firstPrice[symbol]) / firstPrice[symbol]) * 100
      : 0;
    firstPrice[symbol] = price;
    firstTimestamp = currentTime;
    alertState[symbol] = false;
  }

  if (
    Math.abs(percentage[symbol]) >= thresholds[symbol] &&
    !alertState[symbol]
  ) {
    const direction = percentage[symbol] > 0 ? "UP" : "DOWN";
    const alert = `${
      direction == "UP" ? "🚀" : "🔻"
    } ${symbol.toUpperCase()} moved in an hour ${
      percentage[symbol]
    }% ${direction} (last: ${price.toFixed(2)} USDT)`;

    console.log(alert);

    // send tweet
    // try {
    //   await rwClient.v2.tweet(alert);
    //   console.log(alert);
    // } catch (err) {
    //   console.error("Error posting tweet:", err);
    // }
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
