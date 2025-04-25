import { pgTable, text, serial, timestamp, integer, boolean, varchar, jsonb, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Cube Types Enum
export const cubeTypes = {
  SKEWB: "Skewb",
  THREE_BLD: "3x3 BLD",
  TWO: "2x2",
  THREE: "3x3",
  PYRAMINX: "Pyraminx",
  THREE_OH: "3x3 OH",
  CLOCK: "Clock"
} as const;

export type CubeType = typeof cubeTypes[keyof typeof cubeTypes];

// Bot Configuration Table
export const botConfig = pgTable("bot_config", {
  id: serial("id").primaryKey(),
  channelId: text("channel_id").notNull(),
  guildId: text("guild_id").notNull(),
  timeToPost: text("time_to_post").notNull().default("16:00"), // 4 PM in 24h format
  timezone: text("timezone").notNull().default("Asia/Kolkata"), // IST
  enabled: boolean("enabled").notNull().default(true),
  deleteAfterHours: integer("delete_after_hours").notNull().default(24),
});

// Challenge Threads Table
export const challengeThreads = pgTable("challenge_threads", {
  id: serial("id").primaryKey(),
  threadId: text("thread_id").notNull(),
  channelId: text("channel_id").notNull(),
  guildId: text("guild_id").notNull(),
  cubeType: text("cube_type").notNull(),
  scramble: text("scramble").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
  isDeleted: boolean("is_deleted").notNull().default(false),
});

// Schemas for inserting data
export const insertBotConfigSchema = createInsertSchema(botConfig).pick({
  channelId: true,
  guildId: true,
  timeToPost: true,
  timezone: true,
  enabled: true,
  deleteAfterHours: true,
});

export const insertChallengeThreadSchema = createInsertSchema(challengeThreads).pick({
  threadId: true,
  channelId: true,
  guildId: true,
  cubeType: true,
  scramble: true,
  expiresAt: true,
});

// Types for application use
export type BotConfig = typeof botConfig.$inferSelect;
export type InsertBotConfig = z.infer<typeof insertBotConfigSchema>;

export type ChallengeThread = typeof challengeThreads.$inferSelect;
export type InsertChallengeThread = z.infer<typeof insertChallengeThreadSchema>;

// Weekly schedule type
export const daySchedule = {
  MONDAY: cubeTypes.SKEWB,
  TUESDAY: cubeTypes.THREE_BLD,
  WEDNESDAY: cubeTypes.TWO,
  THURSDAY: cubeTypes.THREE,
  FRIDAY: cubeTypes.PYRAMINX,
  SATURDAY: cubeTypes.THREE_OH,
  SUNDAY: cubeTypes.CLOCK
} as const;

export type DayOfWeek = keyof typeof daySchedule;

// User roles enum
export const userRoles = {
  DEVELOPER: "developer",
  OWNER: "owner"
} as const;

export type UserRole = typeof userRoles[keyof typeof userRoles];

// Users Table
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 50 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().$type<UserRole>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  lastLogin: timestamp("last_login"),
});

// Authentication schemas
export const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export type User = typeof users.$inferSelect;
export type LoginCredentials = z.infer<typeof loginSchema>;

// Analytics Tables
// Command Usage Analytics
export const commandUsage = pgTable("command_usage", {
  id: serial("id").primaryKey(),
  commandName: text("command_name").notNull(),
  userId: text("user_id").notNull(),
  guildId: text("guild_id"),
  channelId: text("channel_id"),
  parameters: jsonb("parameters"), // Store command parameters for analysis
  executionTime: integer("execution_time_ms"), // Time taken to execute in milliseconds
  status: text("status").notNull(), // "success", "error", "timeout"
  error: text("error"), // Error message if any
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

// System Performance Metrics
export const systemMetrics = pgTable("system_metrics", {
  id: serial("id").primaryKey(),
  timestamp: timestamp("timestamp").notNull().defaultNow(),
  rssMemory: integer("rss_memory").notNull(), // RSS memory usage in bytes
  heapTotal: integer("heap_total").notNull(), // Total heap size in bytes
  heapUsed: integer("heap_used").notNull(), // Used heap size in bytes
  external: integer("external").notNull(), // External memory usage in bytes
  uptime: integer("uptime").notNull(), // Bot uptime in seconds
  activeThreads: integer("active_threads").notNull(), // Number of active threads
  cpuUsage: jsonb("cpu_usage"), // CPU usage metrics
  loadAverage: jsonb("load_average"), // System load average
});

// Daily Analytics Summary
export const dailyAnalytics = pgTable("daily_analytics", {
  id: serial("id").primaryKey(),
  date: date("date").notNull().unique(),
  totalCommands: integer("total_commands").notNull().default(0),
  commandBreakdown: jsonb("command_breakdown"), // Count of each command used
  scrambleUsage: jsonb("scramble_usage"), // Count of each cube type scrambled
  dailyActiveUsers: integer("daily_active_users").notNull().default(0),
  averageResponseTime: integer("average_response_time"), // Average response time in ms
  errorCount: integer("error_count").notNull().default(0),
  dailyChallengeMetrics: jsonb("daily_challenge_metrics"), // Metrics about daily challenges
});

// Scramble Performance Tracking
export const scramblePerformance = pgTable("scramble_performance", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  guildId: text("guild_id"),
  cubeType: text("cube_type").notNull(),
  scramble: text("scramble").notNull(),
  solveTime: integer("solve_time_ms"), // Time taken to solve in milliseconds
  isCustomScramble: boolean("is_custom_scramble").notNull().default(false),
  customParameters: jsonb("custom_parameters"), // For custom scrambles (moves, difficulty)
  timestamp: timestamp("timestamp").notNull().defaultNow(),
});

// Schemas for inserting analytics data
export const insertCommandUsageSchema = createInsertSchema(commandUsage).omit({
  id: true,
  timestamp: true,
});

export const insertSystemMetricsSchema = createInsertSchema(systemMetrics).omit({
  id: true,
  timestamp: true,
});

export const insertDailyAnalyticsSchema = createInsertSchema(dailyAnalytics).omit({
  id: true,
});

export const insertScramblePerformanceSchema = createInsertSchema(scramblePerformance).omit({
  id: true,
  timestamp: true,
});

// Types for application use
export type CommandUsage = typeof commandUsage.$inferSelect;
export type InsertCommandUsage = z.infer<typeof insertCommandUsageSchema>;

export type SystemMetrics = typeof systemMetrics.$inferSelect;
export type InsertSystemMetrics = z.infer<typeof insertSystemMetricsSchema>;

export type DailyAnalytics = typeof dailyAnalytics.$inferSelect;
export type InsertDailyAnalytics = z.infer<typeof insertDailyAnalyticsSchema>;

export type ScramblePerformance = typeof scramblePerformance.$inferSelect;
export type InsertScramblePerformance = z.infer<typeof insertScramblePerformanceSchema>;
