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

const base = {
  firstPrice: 0,
  lastPrice: 0,
  percentage: 0,
  alertState: false,
};

const thresholds = {
  btcusdt: 3.0,
  ethusdt: 3.0,
  xrpusdt: 5.0,
};

const symbols = Object.fromEntries(
  Object.entries(thresholds).map(([symbol, threshold]) => [
    symbol,
    { ...base, threshold },
  ])
);

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
    symbols[symbol].lastPrice = price;

    symbols[symbol].percentage = symbols[symbol].firstPrice
      ? ((price - symbols[symbol].firstPrice) / symbols[symbol].firstPrice) *
        100
      : 0;

    handleThresholdExceed(symbol, price);
  });
}

function handleThresholdExceed(symbol, price) {
  if (
    Math.abs(symbols[symbol].percentage) >= symbols[symbol].threshold &&
    !symbols[symbol].alertState
  ) {
    const alert = manageMessageText(symbols[symbol].percentage, symbol, price);
    console.log(alert);
    sendTweet(alert);
    symbols[symbol].alertState = false;
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
  nextFullHour.setHours(now.getHours() + 1, 0, 0, 0);
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
    hourEvents.emit("hour");

    console.log("Base prices reset at hour:", currentHourTarget.toISOString());

    // Schedule next hour
    scheduleHourTick();
  }, ms);
}

function resetAllValues() {
  for (const symbol in symbols) {
    symbols[symbol].alertState = false;
    symbols[symbol].firstPrice = symbols[symbol].lastPrice;
    symbols[symbol].percentage = 0;
  }
}

hourEvents.on("hour", () => {
  resetAllValues();
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
  priceChangeListenSocket();
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
