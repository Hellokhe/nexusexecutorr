import type { Config } from "@netlify/functions";
import {
  createJob,
  pollPendingJob,
  updateJobResult,
  listJobs,
  clearJobs,
} from "../../lib/jobsService.js";

// Standard JSON CORS response helper
function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
    },
  });
}

export default async (req: Request) => {
  // Always handle OPTIONS preflight
  if (req.method === "OPTIONS") {
    return jsonResponse({ success: true }, 204);
  }

  const url = new URL(req.url);
  let pathname = url.pathname;

  // Normalize path if accessed via /.netlify/functions
  if (pathname.startsWith("/.netlify/functions/api")) {
    pathname = pathname.replace("/.netlify/functions/api", "") || "/";
    if (!pathname.startsWith("/")) pathname = "/" + pathname;
    pathname = "/api" + (pathname === "/" ? "" : pathname);
  } else if (pathname.startsWith("/.netlify/functions/")) {
    const fnName = pathname.replace("/.netlify/functions/", "");
    pathname = "/api/" + fnName;
  }

  try {
    // Health / Status endpoint
    if (pathname === "/health" || pathname === "/api/status" || pathname === "/api/health") {
      return jsonResponse({
        status: "online",
        system: "NEXUS Roblox Control",
        timestamp: new Date().toISOString(),
      });
    }

    // Submit code endpoint: POST or PUT /api/jobs or /api/code
    if (
      (pathname === "/api/jobs" || pathname === "/api/code") &&
      (req.method === "POST" || req.method === "PUT")
    ) {
      let body: any = {};
      try {
        body = await req.json();
      } catch {
        return jsonResponse(
          { error: "Invalid JSON body. Expected { \"code\": \"...\" }" },
          400
        );
      }

      const code = typeof body?.code === "string" ? body.code.trim() : "";
      if (!code) {
        return jsonResponse(
          { error: "Expected 'code' string in request body." },
          400
        );
      }

      if (Buffer.byteLength(code, "utf8") > 65536) {
        return jsonResponse({ error: "Code exceeds maximum size of 64KB." }, 413);
      }

      const job = await createJob(code);

      return jsonResponse(
        {
          success: true,
          message: "Job queued successfully for Roblox execution.",
          version: job.id,
          job,
        },
        201
      );
    }

    // Poll endpoint: GET or POST /api/poll or /api/jobs/pending
    if (
      pathname === "/api/poll" ||
      pathname === "/api/jobs/pending" ||
      (pathname === "/api/code" && url.searchParams.get("poll") === "1")
    ) {
      const job = await pollPendingJob();

      if (job) {
        return jsonResponse({
          hasJob: true,
          job: {
            id: job.id,
            code: job.code,
            status: job.status,
            createdAt: job.createdAt,
          },
        });
      }

      // Empty queue - return valid JSON so Roblox can decode without errors
      return jsonResponse({
        hasJob: false,
        job: null,
        message: "No pending jobs in queue.",
      });
    }

    // Record execution result: POST /api/result or /api/jobs/result
    if (
      (pathname === "/api/result" || pathname === "/api/jobs/result") &&
      req.method === "POST"
    ) {
      let body: any = {};
      try {
        body = await req.json();
      } catch {
        return jsonResponse(
          { error: "Invalid JSON body. Expected { \"id\": ..., \"status\": ... }" },
          400
        );
      }

      const rawId = body?.id ?? body?.jobId;
      const id = typeof rawId === "number" ? rawId : parseInt(String(rawId), 10);

      if (isNaN(id)) {
        return jsonResponse({ error: "Valid numeric job 'id' is required." }, 400);
      }

      const status =
        body?.status === "failed" || body?.success === false
          ? "failed"
          : "completed";
      const output = typeof body?.output === "string" ? body.output : null;
      const error =
        typeof body?.error === "string"
          ? body.error
          : body?.error
          ? String(body.error)
          : null;

      const updated = await updateJobResult(id, status, output, error);

      if (!updated) {
        return jsonResponse(
          { error: `Job with ID ${id} not found.` },
          404
        );
      }

      return jsonResponse({
        success: true,
        message: `Job ${id} result recorded successfully.`,
        job: updated,
      });
    }

    // List jobs / History: GET /api/jobs
    if (pathname === "/api/jobs" && req.method === "GET") {
      const limitParam = parseInt(url.searchParams.get("limit") || "30", 10);
      const limit = isNaN(limitParam) ? 30 : Math.min(Math.max(limitParam, 1), 100);
      const jobs = await listJobs(limit);
      return jsonResponse({
        success: true,
        count: jobs.length,
        jobs,
      });
    }

    // Clear jobs: DELETE /api/jobs or POST /api/jobs/clear
    if (
      (pathname === "/api/jobs" && req.method === "DELETE") ||
      (pathname === "/api/jobs/clear" && req.method === "POST")
    ) {
      await clearJobs();
      return jsonResponse({
        success: true,
        message: "All jobs cleared successfully.",
      });
    }

    // Read current / latest code: GET /api/code
    if (pathname === "/api/code" && req.method === "GET") {
      const jobs = await listJobs(1);
      const latest = jobs[0];
      return jsonResponse({
        success: true,
        version: latest?.id ?? 1,
        code: latest?.code ?? "print(\"Hello from NEXUS!\")",
        job: latest ?? null,
      });
    }

    // Fallback for unknown /api path
    return jsonResponse(
      {
        error: "Endpoint not found",
        path: pathname,
        availableEndpoints: [
          "POST /api/jobs (submit Luau code)",
          "GET /api/poll (Roblox polls for pending jobs)",
          "POST /api/result (Roblox posts execution result)",
          "GET /api/jobs (view job history)",
          "POST /api/jobs/clear (clear job history)",
          "GET /api/status (health check)",
        ],
      },
      404
    );
  } catch (error: any) {
    console.error("[NEXUS API Error]", error);
    return jsonResponse(
      {
        error: "Internal server error",
        message: error?.message || String(error),
      },
      500
    );
  }
};

export const config: Config = {
  path: ["/api/*", "/health"],
};
