const express = require("express");
const responseTime = require("response-time");
const client = require("prom-client"); // Metric Collection
const { createLogger, transports } = require("winston");
const LokiTransport = require("winston-loki");

const options = {
    transports: [
        new LokiTransport({
            host: "http://127.0.0.1:3100"
        })
    ]
};

const logger = createLogger(options);
const { doSomeHeavyTask } = require("./util");

const app = express();
const PORT = process.env.PORT || 8000;

// Collect default Node.js metrics
client.collectDefaultMetrics({ register: client.register });

// Custom histogram metric
const reqResTime = new client.Histogram({
    name: "http_express_req_res_time",
    help: "Time taken to process HTTP requests in milliseconds",
    labelNames: ["method", "route", "status_code"],
    buckets: [1, 50, 100, 200, 400, 500, 800, 1000, 2000],
});

// Measure request-response time
app.use(
    responseTime((req, res, time) => {
        reqResTime
            .labels({
                method: req.method,
                route: req.route?.path || req.path,
                status_code: String(res.statusCode),
            })
            .observe(time);
    })
);

app.get("/", (req, res) => {
    logger.info("Req came on / route");

    return res.json({
        message: `Hello from Express Server`
    });
});

app.get("/slow", async (req, res) => {
    try {
        logger.info("Req came on /slow route");
        const timeTaken = await doSomeHeavyTask(); 

        return res.json({
            status: "Success",
            message: `Heavy task completed in ${timeTaken}ms`,
        });
    } catch (error) {
        logger.error(error.message)
        return res.status(500).json({
            status: "Error",
            error: "Internal Server Error",
        });
    }
});

// Expose metrics to Prometheus
app.get("/metrics", async (req, res) => {
    res.setHeader("Content-Type", client.register.contentType);
    res.send(await client.register.metrics());
});

app.listen(PORT, () => {
    console.log(`Express Server Started at http://localhost:${PORT}`);
});