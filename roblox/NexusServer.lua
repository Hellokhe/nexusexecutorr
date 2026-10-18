--[[
    ===================================================================
    NEXUS ROBLOX CONTROL - SERVER EXECUTION SCRIPT (.lua copy)
    ===================================================================
    See roblox/NexusServer.luau for details.
--]]

local HttpService = game:GetService("HttpService")
local SERVER_URL = "https://astonishing-donut-24b299.netlify.app"
local POLL_INTERVAL = 3

print("[NEXUS] Initializing NEXUS Roblox Control client...")
print("[NEXUS] Target Server: " .. SERVER_URL)

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

local function testConnection()
    local success, response = pcall(function()
        return HttpService:GetAsync(SERVER_URL .. "/health")
    end)

    if success then
        print("[NEXUS] ✓ Successfully connected to NEXUS Netlify API backend.")
    else
        warn("[NEXUS] Connection check failed: " .. tostring(response))
        if string.find(string.lower(tostring(response)), "http requests are not enabled") then
            warn("[NEXUS] ERROR: HTTP requests are disabled in Game Settings!")
            warn("[NEXUS] Go to Game Settings -> Security -> Turn ON 'Allow HTTP Requests'.")
        end
    end
end

checkLoadString()
testConnection()

task.spawn(function()
    while true do
        task.wait(POLL_INTERVAL)

        local pollSuccess, rawResponse = pcall(function()
            return HttpService:GetAsync(SERVER_URL .. "/api/poll")
        end)

        if not pollSuccess then
            if string.find(string.lower(tostring(rawResponse)), "http requests are not enabled") then
                warn("[NEXUS] Please enable 'Allow HTTP Requests' in Game Settings -> Security.")
                task.wait(5)
            end
            continue
        end

        local decodeSuccess, data = pcall(function()
            return HttpService:JSONDecode(rawResponse)
        end)

        if not decodeSuccess or typeof(data) ~= "table" then
            warn("[NEXUS] Could not decode poll response: " .. tostring(rawResponse))
            continue
        end

        if not data.hasJob or not data.job then
            continue
        end

        local job = data.job
        local jobId = job.id
        local code = job.code

        print(string.format("[NEXUS] >>> Received Job #%s from dashboard. Executing...", tostring(jobId)))

        local execSuccess = false
        local execOutput = ""
        local execError = nil

        local chunk, compileErr = loadstring(code)
        if not chunk then
            execSuccess = false
            execError = "Compile Error: " .. tostring(compileErr)
            warn(string.format("[NEXUS] Job #%s compilation failed: %s", tostring(jobId), execError))
        else
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
