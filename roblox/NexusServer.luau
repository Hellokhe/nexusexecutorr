--[[
    ===================================================================
    NEXUS ROBLOX CONTROL - SERVER EXECUTION SCRIPT
    ===================================================================
    Version: 2.0.0
    Authentication: NONE (No passwords, tokens, or API keys required)
    
    INSTRUCTIONS FOR ROBLOX STUDIO:
    1. Open your Roblox place in Roblox Studio.
    2. In the Explorer window, find "ServerScriptService".
    3. Right-click ServerScriptService -> Insert Object -> Script.
    4. Rename the Script to "NexusServer".
    5. Paste this entire file into that Script.
    
    REQUIRED ROBLOX STUDIO SETTINGS:
    1. Allow HTTP Requests:
       - In Roblox Studio ribbon: Home Tab -> Game Settings (or Model Tab)
       - Click "Security" on the left menu
       - Turn ON "Allow HTTP Requests"
       - Click "Save"
       (Note: If Game Settings is greyed out, publish your game first: File -> Publish to Roblox)
       
    2. Enable LoadString:
       - In Explorer window, click on "ServerScriptService"
       - In Properties window (View -> Properties), check the box for:
         "LoadStringEnabled" = true
       (This enables dynamic Luau execution on the server for received jobs)
    ===================================================================
--]]

local HttpService = game:GetService("HttpService")

-- Change this if you deploy under a custom domain, or keep your live Netlify site URL:
local SERVER_URL = "https://astonishing-donut-24b299.netlify.app"

-- Interval (in seconds) between polling requests (Roblox allows up to 500 HTTP requests/min)
local POLL_INTERVAL = 3

print("-----------------------------------------------------------------")
print("[NEXUS] Initializing NEXUS Roblox Control client...")
print("[NEXUS] Target Server: " .. SERVER_URL)
print("-----------------------------------------------------------------")

-- Check if loadstring is available in ServerScriptService
local function checkLoadString()
    local ok, _ = pcall(function()
        local testFunc = loadstring("return true")
        if typeof(testFunc) == "function" then
            return testFunc()
        end
        return false
    end)

    if not ok then
        warn("[NEXUS] ========================================================")
        warn("[NEXUS] CRITICAL: 'LoadStringEnabled' is NOT turned on!")
        warn("[NEXUS] In Explorer, select ServerScriptService -> in Properties")
        warn("[NEXUS] enable 'LoadStringEnabled' so Luau jobs can execute.")
        warn("[NEXUS] ========================================================")
    else
        print("[NEXUS] ✓ LoadString is enabled and ready.")
    end
end

-- Initial connectivity test
local function testConnection()
    local success, response = pcall(function()
        return HttpService:GetAsync(SERVER_URL .. "/health")
    end)

    if success then
        local decodeOk, data = pcall(function()
            return HttpService:JSONDecode(response)
        end)
        if decodeOk and data and data.status == "online" then
            print("[NEXUS] ✓ Successfully connected to NEXUS Netlify API backend.")
        else
            print("[NEXUS] Connected to backend: " .. tostring(response))
        end
    else
        warn("[NEXUS] ========================================================")
        warn("[NEXUS] Connection check failed: " .. tostring(response))
        if string.find(string.lower(tostring(response)), "http requests are not enabled") then
            warn("[NEXUS] ERROR: HTTP requests are disabled in Game Settings!")
            warn("[NEXUS] Go to Game Settings -> Security -> Turn ON 'Allow HTTP Requests'.")
        end
        warn("[NEXUS] Will continue attempting to poll every " .. POLL_INTERVAL .. " seconds...")
        warn("[NEXUS] ========================================================")
    end
end

-- Run initial sanity checks
checkLoadString()
testConnection()

-- Main Polling Loop
task.spawn(function()
    while true do
        task.wait(POLL_INTERVAL)

        -- 1. Poll for pending job
        local pollSuccess, rawResponse = pcall(function()
            return HttpService:GetAsync(SERVER_URL .. "/api/poll")
        end)

        if not pollSuccess then
            -- Silent or light warning on network interruption to avoid spamming the console
            if string.find(string.lower(tostring(rawResponse)), "http requests are not enabled") then
                warn("[NEXUS] Please enable 'Allow HTTP Requests' in Game Settings -> Security.")
                task.wait(5)
            end
            continue
        end

        -- 2. Decode response safely
        local decodeSuccess, data = pcall(function()
            return HttpService:JSONDecode(rawResponse)
        end)

        if not decodeSuccess or typeof(data) ~= "table" then
            warn("[NEXUS] Could not decode poll response: " .. tostring(rawResponse))
            continue
        end

        -- 3. Check if there is a pending job
        if not data.hasJob or not data.job then
            -- Empty queue, wait for next polling tick
            continue
        end

        local job = data.job
        local jobId = job.id
        local code = job.code

        print(string.format("[NEXUS] >>> Received Job #%s from dashboard. Executing...", tostring(jobId)))

        -- 4. Execute the Luau code
        local execSuccess = false
        local execOutput = ""
        local execError = nil

        local chunk, compileErr = loadstring(code)
        if not chunk then
            execSuccess = false
            execError = "Compile Error: " .. tostring(compileErr)
            warn(string.format("[NEXUS] Job #%s compilation failed: %s", tostring(jobId), execError))
        else
            -- Run the compiled function safely
            local runSuccess, runResult = pcall(chunk)
            if runSuccess then
                execSuccess = true
                execOutput = runResult ~= nil and tostring(runResult) or "Code executed successfully."
                print(string.format("[NEXUS] Job #%s executed successfully! Result: %s", tostring(jobId), execOutput))
            else
                execSuccess = false
                execError = "Runtime Error: " .. tostring(runResult)
                warn(string.format("[NEXUS] Job #%s runtime error: %s", tostring(jobId), execError))
            end
        end

        -- 5. Send execution results back to Netlify API
        local resultPayload = HttpService:JSONEncode({
            id = jobId,
            status = execSuccess and "completed" or "failed",
            output = execOutput,
            error = execError
        })

        local postSuccess, postResponse = pcall(function()
            return HttpService:PostAsync(
                SERVER_URL .. "/api/result",
                resultPayload,
                Enum.HttpContentType.ApplicationJson
            )
        end)

        if postSuccess then
            print(string.format("[NEXUS] Job #%s execution status reported back to dashboard.", tostring(jobId)))
        else
            warn(string.format("[NEXUS] Failed to report Job #%s result to dashboard: %s", tostring(jobId), tostring(postResponse)))
        end
    end
end)
