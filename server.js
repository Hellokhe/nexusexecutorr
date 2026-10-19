const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// In-memory job queue for local Express testing
let jobs = [];
let nextId = 1;

app.use(express.json({ limit: "64kb" }));

// Enable CORS and JSON headers for all responses
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

// Serve frontend
app.get(["/", "/index.html"], (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Health / Status
app.get(["/health", "/api/status", "/api/health"], (req, res) => {
  res.json({
    status: "online",
    system: "NEXUS Roblox Control",
    timestamp: new Date().toISOString()
  });
});

// Submit code handler
function handleCreateJob(req, res) {
  const code = req.body?.code;
  if (typeof code !== "string" || !code.trim()) {
    return res.status(400).json({ error: "Expected 'code' string in request body." });
  }

  const job = {
    id: nextId++,
    code: code.trim(),
    status: "pending",
    output: null,
    error: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  jobs.unshift(job);

  res.status(201).json({
    success: true,
    message: "Job queued successfully for Roblox execution.",
    version: job.id,
    job
  });
}

app.post("/api/jobs", handleCreateJob);
app.put("/api/jobs", handleCreateJob);
app.post("/api/code", handleCreateJob);
app.put("/api/code", handleCreateJob);

function getPendingJobPayload() {
  const pending = [...jobs].reverse().find(j => j.status === "pending");

  if (pending) {
    pending.status = "running";
    pending.updatedAt = new Date().toISOString();
    return {
      hasJob: true,
      job: {
        id: pending.id,
        code: pending.code,
        status: pending.status,
        createdAt: pending.createdAt
      }
    };
  }

  return {
    hasJob: false,
    job: null,
    message: "No pending jobs in queue."
  };
}

// Poll pending job for Roblox: GET /api/poll or /api/jobs/pending
app.get(["/api/poll", "/api/jobs/pending"], (req, res) => {
  res.json(getPendingJobPayload());
});

app.post(["/api/poll", "/api/jobs/pending"], (req, res) => {
  res.json(getPendingJobPayload());
});

// Record execution result: POST /api/result or /api/jobs/result
app.post(["/api/result", "/api/jobs/result"], (req, res) => {
  const rawId = req.body?.id ?? req.body?.jobId;
  const id = typeof rawId === "number" ? rawId : parseInt(String(rawId), 10);

  if (isNaN(id)) {
    return res.status(400).json({ error: "Valid numeric job 'id' is required." });
  }

  const job = jobs.find(j => j.id === id);
  if (!job) {
    return res.status(404).json({ error: `Job with ID ${id} not found.` });
  }

  job.status = req.body?.status === "failed" || req.body?.success === false ? "failed" : "completed";
  job.output = typeof req.body?.output === "string" ? req.body.output : null;
  job.error = typeof req.body?.error === "string" ? req.body.error : (req.body?.error ? String(req.body.error) : null);
  job.updatedAt = new Date().toISOString();

  res.json({
    success: true,
    message: `Job ${id} result recorded successfully.`,
    job
  });
});

// List jobs: GET /api/jobs
app.get("/api/jobs", (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 30;
  res.json({
    success: true,
    count: jobs.length,
    jobs: jobs.slice(0, limit)
  });
});

// Clear jobs: DELETE /api/jobs or POST /api/jobs/clear
app.post("/api/jobs/clear", (req, res) => {
  jobs = [];
  res.json({ success: true, message: "All jobs cleared successfully." });
});

app.delete("/api/jobs", (req, res) => {
  jobs = [];
  res.json({ success: true, message: "All jobs cleared successfully." });
});

// Read current / latest code: GET /api/code
app.get("/api/code", (req, res) => {
  if (req.query.poll === "1") {
    return res.json(getPendingJobPayload());
  }

  const latest = jobs[0];
  res.json({
    success: true,
    version: latest ? latest.id : 1,
    code: latest ? latest.code : "print(\"Hello from NEXUS!\")",
    job: latest || null
  });
});

// 404 JSON Fallback
app.use((req, res) => {
  res.status(404).json({
    error: "Endpoint not found",
    path: req.path
  });
});

// Global error handler returning JSON
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({
    error: "Internal server error",
    message: err.message
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`NEXUS Roblox Control server running on port ${PORT}`);
});
