# NEXUS Roblox Control Dashboard

A complete, beginner-friendly, authentication-free system connecting a Netlify-hosted web dashboard to your Roblox experience server. Submit Luau code directly through your web browser and execute it on your live Roblox server in real time.

---

## 📁 Project Folder Structure

```text
/
├── index.html                           # NEXUS Web Control Dashboard (HTML, CSS, JS)
├── netlify.toml                         # Netlify configuration & API route redirects
├── package.json                         # Node.js dependencies
├── server.js                            # Local development server (Express)
├── readme.md                            # Complete setup & deployment documentation
├── .gitignore                           # Git ignore rules
│
├── db/
│   ├── index.ts                         # Netlify Database Drizzle client
│   └── schema.ts                        # Jobs table schema definition
│
├── lib/
│   └── jobsService.ts                   # Resilient database & queue service layer
│
├── netlify/
│   ├── database/
│   │   └── migrations/
│   │       └── 20261018215601_create_jobs_table/
│   │           └── migration.sql        # Netlify Database PostgreSQL migration
│   │
│   └── functions/
│       └── api.mts                      # Main serverless API router handling /api/* & /health
│
└── roblox/
    ├── NexusServer.luau                 # Roblox Studio Luau Server Script
    └── NexusServer.lua                  # Duplicate copy with .lua extension
```

---

## 🚀 How Errors Were Resolved

### 1. `Unexpected token 'M', "Method not allowed." is not valid JSON`
- **Root Cause:** In the previous deployment, API requests were sent to static files without Netlify serverless functions configured. Netlify returned HTTP 405 with plain text `"Method not allowed."`. When the browser attempted `response.json()`, JSON parsing crashed on the letter `'M'`.
- **Solution:** Converted backend routes to native **Netlify Functions** (`netlify/functions/api.mts`) and configured redirects in `netlify.toml`. All endpoints now return structured JSON with status codes, valid headers (`Content-Type: application/json`), and support all HTTP verbs (`GET`, `POST`, `PUT`, `OPTIONS`).

### 2. `[NEXUS] Could not decode poll response`
- **Root Cause:** Roblox's `HttpService:JSONDecode()` was receiving non-JSON responses (either 404/405 plain text from Netlify, or empty queues returning plain text).
- **Solution:** Every API endpoint—including empty queue states (`{ "hasJob": false, "job": null }`)—guarantees valid, decodable JSON.

---

## 🎮 Roblox Studio Setup Guide

Follow these simple steps in Roblox Studio to connect your game:

### Step 1: Enable HTTP Requests
1. Open your game in **Roblox Studio**.
2. If your game is not published yet, click **File** &rarr; **Publish to Roblox**.
3. In the top toolbar, go to the **Home** tab and click **Game Settings**.
4. In the left menu, select **Security**.
5. Toggle **Allow HTTP Requests** to **ON**.
6. Click **Save**.

### Step 2: Enable `LoadString`
1. Open the **Explorer** and **Properties** windows (from the **View** tab in Roblox Studio).
2. In the **Explorer** window, click on **ServerScriptService**.
3. In the **Properties** window, locate the checkbox named **`LoadStringEnabled`**.
4. Check the box so **`LoadStringEnabled`** is set to **true** (checked).
   *(This allows your Roblox server to safely run the Luau code sent from your dashboard).*

### Step 3: Insert the Roblox Script
1. In the **Explorer** window, right-click **ServerScriptService**.
2. Select **Insert Object** &rarr; **Script** (regular server Script, NOT a LocalScript).
3. Rename the Script to **`NexusServer`**.
4. Paste the following complete script into the file:

```luau
--[[
    NEXUS ROBLOX CONTROL - SERVER SCRIPT
    Place this script inside ServerScriptService.
--]]

local HttpService = game:GetService("HttpService")
local SERVER_URL = "https://astonishing-donut-24b299.netlify.app"
local POLL_INTERVAL = 3

print("[NEXUS] Initializing NEXUS Roblox Control...")
print("[NEXUS] Connected to: " .. SERVER_URL)

task.spawn(function()
    while true do
        task.wait(POLL_INTERVAL)

        -- 1. Poll for pending job
        local pollSuccess, rawResponse = pcall(function()
            return HttpService:GetAsync(SERVER_URL .. "/api/poll")
        end)

        if not pollSuccess then
            continue
        end

        -- 2. Decode response
        local decodeSuccess, data = pcall(function()
            return HttpService:JSONDecode(rawResponse)
        end)

        if not decodeSuccess or typeof(data) ~= "table" then
            continue
        end

        -- 3. Check for job
        if not data.hasJob or not data.job then
            continue
        end

        local job = data.job
        print(string.format("[NEXUS] Executing Job #%s...", tostring(job.id)))

        -- 4. Execute Luau code
        local execSuccess, execOutput, execError = false, "", nil
        local chunk, compileErr = loadstring(job.code)

        if not chunk then
            execSuccess = false
            execError = "Compile Error: " .. tostring(compileErr)
        else
            local runSuccess, runResult = pcall(chunk)
            if runSuccess then
                execSuccess = true
                execOutput = runResult ~= nil and tostring(runResult) or "Executed successfully."
            else
                execSuccess = false
                execError = "Runtime Error: " .. tostring(runResult)
            end
        end

        -- 5. Send results back to dashboard
        local payload = HttpService:JSONEncode({
            id = job.id,
            status = execSuccess and "completed" or "failed",
            output = execOutput,
            error = execError
        })

        pcall(function()
            HttpService:PostAsync(
                SERVER_URL .. "/api/result",
                payload,
                Enum.HttpContentType.ApplicationJson
            )
        end)
    end
end)
```

5. Click **Play** (or **Run**) in Roblox Studio to test. You will see `[NEXUS] Initializing NEXUS Roblox Control...` in your Output window.

---

## 🌐 Deployment Instructions

GitHub Pages only publishes the static dashboard; it does not run the API or Netlify Functions. The dashboard sends API requests to `API_BASE_URL` near the top of the inline script in `index.html`. To use the dashboard, deploy this project to Netlify (including its function and database setup), confirm `/health` returns JSON with `"status": "online"`, and set `API_BASE_URL` to that site's origin. The Roblox script's `SERVER_URL` in `roblox/NexusServer.luau` must use the same origin.

The GitHub Pages workflow does not deploy the Netlify backend. A Netlify deployment must be configured separately; if you use GitHub Pages for the dashboard, its requests are sent cross-origin and require the API's CORS headers.

---

## 📡 API Reference

All endpoints return `Content-Type: application/json` and include full CORS headers.

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `POST /api/jobs` | `POST` / `PUT` | Queue a new Luau job: `{"code": "print('hello')"}` |
| `GET /api/poll` | `GET` | Roblox polls for next pending job. Returns `{ "hasJob": true, "job": {...} }` or `{ "hasJob": false, "job": null }` |
| `POST /api/result` | `POST` | Roblox reports execution result: `{"id": 1, "status": "completed", "output": "..."}` |
| `GET /api/jobs` | `GET` | Returns list of recent jobs for the web dashboard |
| `POST /api/jobs/clear`| `POST`/`DELETE` | Clears all jobs from queue history |
| `GET /health` | `GET` | System health status check |
| `GET /api/code` | `GET` | Legacy compatibility endpoint returning latest Luau code |
