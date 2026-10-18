import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const jobs = pgTable("jobs", {
  id: serial("id").primaryKey(),
  code: text("code").notNull(),
  status: text("status").notNull().default("pending"),
  output: text("output"),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
