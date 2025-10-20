import WebSocket from "ws";
import { TwitterApi } from "twitter-api-v2";
import { EventEmitter } from "events";

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
  btcusdt: 3.0,
  ethusdt: 3.0,
  xrpusdt: 5.0,
};

const firstPrice = {};
const alertState = {};
const percentage = {};
const lastPrice = {};

const hourEvents = new EventEmitter();
let hourTimer = null;
let currentHourTarget = null;

// Binance WebSocket endpoint
const ws = new WebSocket("wss://stream.binance.com:9443/ws");

function priceChangeListenSocket() {
  ws.on("message", async (msg) => {
    const data = JSON.parse(msg);
    if (!data.s || !data.c) return; // not a ticker event

    const symbol = data.s.toLowerCase(); // e.g. BTCUSDT -> btcusdt
    const price = parseFloat(data.c);
    const currentTime = data.E; // event time

    percentage[symbol] = firstPrice[symbol]
      ? ((price - firstPrice[symbol]) / firstPrice[symbol]) * 100
      : 0;

    // Record the first price and time for each symbol
    if (!(symbol in firstPrice)) {
      firstPrice[symbol] = price;
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

    handleThresholdExceed(symbol, price);
  });
}

function handleThresholdExceed(symbol, price) {
  if (
    Math.abs(percentage[symbol]) >= thresholds[symbol] &&
    !alertState[symbol]
  ) {
    const alert = manageMessageText(percentage[symbol], symbol, price);
    console.log(alert);

    sendTweet(alert);
    alertState[symbol] = true; // set alert state to true to avoid repeated alerts for this symbol
  }
}

function manageMessageText(symbolPercentage, symbol, price) {
  const direction = symbolPercentage > 0 ? "UP" : "DOWN";
  const alert = `${
    direction == "UP" ? "🚀" : "🔻"
  } ${symbol.toUpperCase()} moved in an hour ${symbolPercentage}% ${direction} (last: ${price.toFixed(
    2
  )} USDT)`;
  return alert;
}

async function sendTweet(message) {
  //send tweet
  try {
    await rwClient.v2.tweet(message);
    console.log("tweet has been sent.");
  } catch (err) {
    console.error("Error posting tweet:", err);
  }
}

function calcNextFullHour() {
  const now = new Date();
  const nextFullHour = new Date(now);
  nextFullHour.setHours(now.getHours() + 1, 0, 0);
  const msUntilNextHour = nextFullHour - now;

  return msUntilNextHour;
}

// Top-of-hour scheduler (recurring)
function scheduleHourTick() {
  const ms = calcNextFullHour();
  currentHourTarget = new Date(Date.now() + ms);

  clearTimeout(hourTimer);
  hourTimer = setTimeout(() => {
    // Emit top-of-hour event with time
    hourEvents.emit("hour", currentHourTarget);

    // Reset base prices at top of hour (use last seen)
    Object.keys(firstPrice).forEach((symbol) => {
      if (lastPrice[symbol] != null) {
        firstPrice[symbol] = lastPrice[symbol];
      }
      alertState[symbol] = false;
      percentage[symbol] = 0;
    });

    console.log("Base prices reset at hour:", currentHourTarget.toISOString());

    // Schedule next hour
    scheduleHourTick();
  }, ms);
}

// Use this event for your tasks:
hourEvents.on("hour", (when) => {
  priceChangeListenSocket();
  // console.log("[hour event]", when.toISOString());
});

// On open, subscribe to tickers
function websocketConnection() {
  const subscribe = () => {
    const params = {
      method: "SUBSCRIBE",
      params: ["btcusdt@ticker_1h", "ethusdt@ticker_1h", "xrpusdt@ticker_1h"],
      id: 1,
    };
    ws.send(JSON.stringify(params));
    console.log("Connected and subscribed.");
  };

  if (ws.readyState === WebSocket.OPEN) {
    subscribe();
  } else {
    ws.once("open", subscribe); // avoid duplicate subscriptions
  }
}

function firstStart() {
  const ms = calcNextFullHour();
  websocketConnection();
  scheduleHourTick();
  console.log(
    `Bot is going to start in ${new Date(Date.now() + ms).toString()}`
  );
}

firstStart();

// On error
ws.on("error", (err) => {
  console.error("WebSocket error:", err);
});

// On close
ws.on("close", () => {
  console.log("WebSocket closed.");
});
