import { eq, asc, desc } from "drizzle-orm";
import { db } from "../db/index.js";
import { jobs } from "../db/schema.js";

export interface JobRecord {
  id: number;
  code: string;
  status: "pending" | "running" | "completed" | "failed";
  output: string | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// In-memory fallback in case Netlify Database Postgres is temporarily unavailable
const fallbackJobs: Map<number, JobRecord> = new Map();
let fallbackIdCounter = 1;

export async function createJob(code: string): Promise<JobRecord> {
  try {
    const [inserted] = await db
      .insert(jobs)
      .values({
        code,
        status: "pending",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    if (inserted) {
      return {
        id: inserted.id,
        code: inserted.code,
        status: inserted.status as JobRecord["status"],
        output: inserted.output ?? null,
        error: inserted.error ?? null,
        createdAt: inserted.createdAt,
        updatedAt: inserted.updatedAt,
      };
    }
  } catch (err) {
    console.warn("[NEXUS Service] Database unavailable for createJob, using fallback store:", err);
  }

  // Fallback
  const newJob: JobRecord = {
    id: fallbackIdCounter++,
    code,
    status: "pending",
    output: null,
    error: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  fallbackJobs.set(newJob.id, newJob);
  return newJob;
}

export async function pollPendingJob(): Promise<JobRecord | null> {
  try {
    const [pendingJob] = await db
      .select()
      .from(jobs)
      .where(eq(jobs.status, "pending"))
      .orderBy(asc(jobs.createdAt))
      .limit(1);

    if (pendingJob) {
      const [updated] = await db
        .update(jobs)
        .set({
          status: "running",
          updatedAt: new Date(),
        })
        .where(eq(jobs.id, pendingJob.id))
        .returning();

      return {
        id: updated.id,
        code: updated.code,
        status: updated.status as JobRecord["status"],
        output: updated.output ?? null,
        error: updated.error ?? null,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      };
    }
    return null;
  } catch (err) {
    console.warn("[NEXUS Service] Database unavailable for pollPendingJob, checking fallback store:", err);
  }

  // Fallback
  for (const job of fallbackJobs.values()) {
    if (job.status === "pending") {
      job.status = "running";
      job.updatedAt = new Date();
      return job;
    }
  }
  return null;
}

export async function updateJobResult(
  id: number,
  status: "completed" | "failed",
  output?: string | null,
  error?: string | null
): Promise<JobRecord | null> {
  try {
    const [updated] = await db
      .update(jobs)
      .set({
        status,
        output: output ?? null,
        error: error ?? null,
        updatedAt: new Date(),
      })
      .where(eq(jobs.id, id))
      .returning();

    if (updated) {
      return {
        id: updated.id,
        code: updated.code,
        status: updated.status as JobRecord["status"],
        output: updated.output ?? null,
        error: updated.error ?? null,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      };
    }
  } catch (err) {
    console.warn("[NEXUS Service] Database unavailable for updateJobResult, updating fallback store:", err);
  }

  // Fallback
  const job = fallbackJobs.get(id);
  if (job) {
    job.status = status;
    job.output = output ?? null;
    job.error = error ?? null;
    job.updatedAt = new Date();
    return job;
  }
  return null;
}

export async function listJobs(limit = 30): Promise<JobRecord[]> {
  try {
    const records = await db
      .select()
      .from(jobs)
      .orderBy(desc(jobs.createdAt))
      .limit(limit);

    return records.map((r) => ({
      id: r.id,
      code: r.code,
      status: r.status as JobRecord["status"],
      output: r.output ?? null,
      error: r.error ?? null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  } catch (err) {
    console.warn("[NEXUS Service] Database unavailable for listJobs, reading fallback store:", err);
  }

  // Fallback
  const list = Array.from(fallbackJobs.values());
  list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return list.slice(0, limit);
}

export async function clearJobs(): Promise<void> {
  try {
    await db.delete(jobs);
  } catch (err) {
    console.warn("[NEXUS Service] Database unavailable for clearJobs:", err);
  }
  fallbackJobs.clear();
}
