import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const user = sqliteTable("user", {
  id:            integer("id").primaryKey(),
  name:          text("name").notNull(),
  timezone:      text("timezone").notNull(),
  distanceUnit:  text("distance_unit", { enum: ["km", "mi"] }).notNull().default("km"),
  currency:      text("currency").notNull().default("EUR"),
  weekStart:     text("week_start", { enum: ["mon", "sun"] }).notNull().default("mon"),
  timeFormat:    text("time_format", { enum: ["24h", "12h"] }).notNull().default("24h"),
  lennaTone:     text("lenna_tone", { enum: ["warm", "neutral", "direct"] }).notNull().default("warm"),
  lennaAutonomy: text("lenna_autonomy", { enum: ["suggest", "draft", "act"] }).notNull().default("draft"),
  setupDone:     integer("setup_done", { mode: "boolean" }).notNull().default(false),
  createdAt:     integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const vectors = sqliteTable("vectors", {
  id:        text("id").primaryKey(),
  label:     text("label").notNull(),
  color:     text("color").notNull(),
  order:     integer("order").notNull().default(0),
  active:    integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const anchors = sqliteTable("anchors", {
  id:             text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  vectorId:       text("vector_id").notNull().references(() => vectors.id),
  description:    text("description").notNull(),
  headlineMetric: text("headline_metric"),
  targetAge:      integer("target_age"),
  createdAt:      integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const goals = sqliteTable("goals", {
  id:          text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  vectorId:    text("vector_id").notNull().references(() => vectors.id),
  anchorId:    text("anchor_id").references(() => anchors.id),
  quarter:     text("quarter").notNull(),
  description: text("description").notNull(),
  type:        text("type", { enum: ["milestone", "metric", "consistency"] }).notNull(),
  targetValue: real("target_value"),
  startValue:  real("start_value"),
  paceType:    text("pace_type", { enum: ["linear", "curve"] }).notNull().default("linear"),
  active:      integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt:   integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// Inputs are either auto-pulled from a source (Strava, GitHub, …) or a
// short manual free-text entry. The LLM populates progressDelta from rawText.
export const inputs = sqliteTable("inputs", {
  id:            text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  date:          text("date").notNull(),
  type:          text("type", { enum: ["auto", "manual"] }).notNull(),
  source:        text("source"),
  vectorId:      text("vector_id").references(() => vectors.id),
  goalId:        text("goal_id").references(() => goals.id),
  rawText:       text("raw_text"),
  progressDelta: real("progress_delta"),
  confidence:    real("confidence"),
  metadata:      text("metadata", { mode: "json" }),
  createdAt:     integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const tasks = sqliteTable("tasks", {
  id:        text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  date:      text("date").notNull(),
  title:     text("title").notNull(),
  done:      integer("done", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// One snapshot per day. vectorBreakdown is { [vectorId]: paceGap }.
export const scores = sqliteTable("scores", {
  id:              text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  date:            text("date").notNull(),
  operatingLevel:  real("operating_level").notNull(),
  vectorBreakdown: text("vector_breakdown", { mode: "json" }).notNull(),
  explanation:     text("explanation"),
  createdAt:       integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});
