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

const thresholds = {
  btcusdt: 3.0,
  ethusdt: 3.0,
  xrpusdt: 5.0,
};

// Create a fresh symbol object to avoid shared references
function createSymbolData(threshold) {
  return {
    day: {
      base: {
        firstPrice: 0,
        lastPrice: 0,
        percentage: 0,
        alertState: false,
      },
    },
    hour: {
      base: {
        firstPrice: 0,
        lastPrice: 0,
        percentage: 0,
        alertState: false,
      },
    },
    threshold,
  };
}

const symbols = Object.fromEntries(
  Object.entries(thresholds).map(([symbol, threshold]) => [
    symbol,
    createSymbolData(threshold),
  ]),
);

const hourEvents = new EventEmitter();
const dayEvents = new EventEmitter();
let hourTimer = null;
let currentHourTarget = null;
let dayTimer = null;
let currentDayTarget = null;

// Binance WebSocket endpoint
const ws = new WebSocket("wss://stream.binance.com:9443/ws");

function calculatePercentage(time, symbol, price) {
  if (time === "hour") {
    symbols[symbol].hour.base.lastPrice = price;

    symbols[symbol].hour.base.percentage = symbols[symbol].hour.base.firstPrice
      ? ((price - symbols[symbol].hour.base.firstPrice) /
          symbols[symbol].hour.base.firstPrice) *
        100
      : 0;
  } else if (time === "day") {
    symbols[symbol].day.base.lastPrice = price;

    symbols[symbol].day.base.percentage = symbols[symbol].day.base.firstPrice
      ? ((price - symbols[symbol].day.base.firstPrice) /
          symbols[symbol].day.base.firstPrice) *
        100
      : 0;
  }
}

function priceChangeListenSocket() {
  ws.on("message", async (msg) => {
    const data = JSON.parse(msg);
    if (!data.s || !data.c) return;

    const symbol = data.s.toLowerCase();
    const price = parseFloat(data.c);

    calculatePercentage("day", symbol, price);
    calculatePercentage("hour", symbol, price);

    handleThresholdExceed(symbol, price);
  });
}

function handleThresholdExceed(symbol, price) {
  if (
    Math.abs(symbols[symbol].hour.base.percentage) >=
      symbols[symbol].threshold &&
    !symbols[symbol].hour.base.alertState
  ) {
    const alert = manageHourlyMessageText(
      symbols[symbol].hour.base.percentage,
      symbol,
      price,
    );
    console.log(alert);
    sendTweet(alert);
    symbols[symbol].hour.base.alertState = true;
  }
  if (
    Math.abs(symbols[symbol].day.base.percentage) >=
      symbols[symbol].threshold &&
    !symbols[symbol].day.base.alertState
  ) {
    const alert = manageDailyMessageText(
      symbols[symbol].day.base.percentage,
      symbol,
      price,
    );
    console.log(alert);
    sendTweet(alert);
    symbols[symbol].day.base.alertState = true;
  }
}

function manageHourlyMessageText(symbolPercentage, symbol, price) {
  const direction = symbolPercentage > 0 ? "UP" : "DOWN";
  const alert = `${
    direction == "UP" ? "🚀" : "🔻"
  } ${symbol.toUpperCase()} moved in an hour ${symbolPercentage}% ${direction} (last: ${price.toFixed(
    2,
  )} USDT)`;
  return alert;
}

function manageDailyMessageText(symbolPercentage, symbol, price) {
  const direction = symbolPercentage > 0 ? "UP" : "DOWN";
  const alert = `${
    direction == "UP" ? "🚀" : "🔻"
  } ${symbol.toUpperCase()} moved in a day ${symbolPercentage}% ${direction} (last: ${price.toFixed(
    2,
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
  nextFullHour.setMinutes(now.getMinutes() + 1, 0, 0);
  // nextFullHour.setHours(now.getHours() + 1, 0, 0, 0);
  const msUntilNextHour = nextFullHour - now;

  return msUntilNextHour;
}

function calcNextDay() {
  const now = new Date();
  const nextDay = new Date(now);
  nextDay.setDate(now.getDate() + 1, 0, 0, 0, 0);
  const msUntilNextDay = nextDay - now;

  return msUntilNextDay;
}

function scheduleHourTick() {
  const ms = calcNextFullHour();
  currentHourTarget = new Date(Date.now() + ms);

  clearTimeout(hourTimer);
  hourTimer = setTimeout(() => {
    hourEvents.emit("hour");

    console.log("Base prices reset at hour:", currentHourTarget.toISOString());
    console.log(symbols);

    scheduleHourTick();
  }, ms);
}

function scheduleDayTick() {
  const ms = calcNextDay();
  currentDayTarget = new Date(Date.now() + ms);

  clearTimeout(dayTimer);
  dayTimer = setTimeout(() => {
    dayEvents.emit("day");

    console.log("Daily alert will send:", currentDayTarget.toISOString());

    scheduleHourTick();
  }, ms);
}

function resetAllDailyValues() {
  for (const symbol in symbols) {
    symbols[symbol].hour.base.alertState = false;
    symbols[symbol].hour.base.firstPrice = symbols[symbol].hour.base.lastPrice;
    symbols[symbol].hour.base.percentage = 0;
  }
}

function resetAllHourlyValues() {
  for (const symbol in symbols) {
    console.log("reset daily:", symbol);
    symbols[symbol].day.base.alertState = false;
    symbols[symbol].day.base.firstPrice = symbols[symbol].day.base.lastPrice;
    symbols[symbol].day.base.percentage = 0;
  }
}

hourEvents.on("hour", () => {
  resetAllHourlyValues();
  // console.log("[hour event]", when.toISOString());
});

dayEvents.on("day", () => {
  resetAllValues();
  resetAllDailyValues();
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
  scheduleDayTick();
  console.log(
    `Bot is going to start in ${new Date(Date.now() + ms).toString()}`,
  );
}

firstStart();

// On error
ws.on("error", (err) => {
  console.error("WebSocket error:", err);
});

function reconnect(delay = 1000, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      firstStart();
    } catch (error) {
      if (attempt === retries - 1) throw err;
      const wait = delay * 2 ** attempt;
      console.log(`Retrying in ${wait}ms...`);
    }
  }
}

// On close
ws.on("close", () => {
  reconnect();
  console.log("WebSocket closed.");
});
