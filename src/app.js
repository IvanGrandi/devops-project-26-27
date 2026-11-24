const express = require("express");
const client = require("prom-client");

const app = express();

client.collectDefaultMetrics();

const httpRequests = new client.Counter({
  name: "http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "route", "status"],
});

const httpDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "Request latency in seconds",
  labelNames: ["method", "route"],
  buckets: [0.05, 0.1, 0.3, 0.5, 1, 2],
});

app.use((req, res, next) => {
  const end = httpDuration.startTimer({ method: req.method, route: req.path });
  res.on("finish", () => {
    httpRequests.inc({
      method: req.method,
      route: req.path,
      status: res.statusCode,
    });
    end();
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level: res.statusCode >= 500 ? "error" : "info",
        method: req.method,
        path: req.path,
        status: res.statusCode,
      }),
    );
  });
  next();
});

app.get("/health", (req, res) => {
  res.status(200).send("OK");
});

app.get("/metrics", async (req, res) => {
  res.set("Content-Type", client.register.contentType);
  res.end(await client.register.metrics());
});

app.get("/slow", (req, res) => {
  const delay = Math.random() * 2000;
  setTimeout(() => {
    res.status(200).send(`Slow response after ${Math.round(delay)} ms`);
  }, delay);
});

app.get("/error", (req, res) => {
  if (Math.random() < 0.3) {
    res.status(500).send("Internal Server Error");
  } else {
    res.status(200).send("OK");
  }
});

app.get("/", (req, res) => {
  res.status(200).send("Hello from myapp");
});

module.exports = app;
