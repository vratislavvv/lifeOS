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
  id:             text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  vectorId:       text("vector_id").notNull().references(() => vectors.id),
  anchorId:       text("anchor_id").references(() => anchors.id),
  quarter:        text("quarter").notNull(),
  description:    text("description").notNull(),
  type:           text("type", { enum: ["milestone", "metric", "consistency"] }).notNull(),
  // pace
  paceShape:      text("pace_shape", { enum: ["linear", "easeIn", "easeOut", "sCurve"] }).notNull().default("linear"),
  paceParam:      real("pace_param"),                      // k for easeIn/easeOut/sCurve; null = use default
  // window — seeded from quarter bounds on creation; explicit so mid-quarter goals have correct τ
  startDate:      text("start_date"),                      // YYYY-MM-DD
  endDate:        text("end_date"),                        // YYYY-MM-DD
  // scoring weight — default 1 reproduces equal-weighting across goals in a vector
  weight:         real("weight").notNull().default(1),
  // metric goals
  targetValue:    real("target_value"),
  startValue:     real("start_value"),
  // consistency goals
  cadencePerWeek: real("cadence_per_week"),                // drives scheduledPeriods in Stage 1
  active:         integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt:      integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// Each manual input may produce multiple rows (one per entry in the LLM extract response).
// kind is a tagged union: the value field meaningful for each kind is:
//   milestone_delta      → progressDelta (−1..1, store raw; clamp MAX_INPUT_DELTA at read time)
//   metric_value         → value (the observed number, e.g. €12,400)
//   consistency_occurrence → occurredCount (usually 1)
//   untagged             → durationMin only (feeds alignment denominator)
export const inputs = sqliteTable("inputs", {
  id:            text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  date:          text("date").notNull(),                   // date progress refers to (may differ from createdAt on backfill)
  type:          text("type", { enum: ["auto", "manual"] }).notNull(),
  source:        text("source"),
  vectorId:      text("vector_id").references(() => vectors.id),
  goalId:        text("goal_id").references(() => goals.id),
  rawText:       text("raw_text"),
  kind:          text("kind", { enum: ["milestone_delta", "metric_value", "consistency_occurrence", "untagged"] }),
  progressDelta: real("progress_delta"),                   // milestone_delta only; −1..1; never clamp on write
  value:         real("value"),                            // metric_value only; the observed reading
  occurredCount: real("occurred_count"),                   // consistency_occurrence only; usually 1
  durationMin:   real("duration_min"),                     // Stage 4 alignment; falls back to input count if null
  confidence:    real("confidence"),                       // 0..1; inputs below CONFIDENCE_FLOOR ignored in Stage 1
  metadata:      text("metadata", { mode: "json" }),
  createdAt:     integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const taskGroups = sqliteTable("task_groups", {
  id:        text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name:      text("name").notNull(),
  color:     text("color"),
  order:     integer("order").notNull().default(0),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

export const tasks = sqliteTable("tasks", {
  id:        text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  groupId:   text("group_id").notNull().references(() => taskGroups.id),
  goalId:    text("goal_id").references(() => goals.id),  // nullable; set when Lenna creates a task from a goal
  date:      text("date").notNull(),
  title:     text("title").notNull(),
  done:      integer("done", { mode: "boolean" }).notNull().default(false),
  important: integer("important", { mode: "boolean" }).notNull().default(false),
  urgent:    integer("urgent", { mode: "boolean" }).notNull().default(false),
  dueDate:   text("due_date"),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// One row per recalculation. calibrating state = absence of a row for that date.
// vectorBreakdown is kept alive until contributors is fully wired; stop writing it then.
export const scores = sqliteTable("scores", {
  id:               text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  date:             text("date").notNull(),
  operatingLevel:   real("operating_level").notNull(),     // smoothed EMA value = OL_today
  operatingLevelRaw: real("operating_level_raw"),          // pre-smoothing composite S from Stage 5
  alignment:        real("alignment"),                     // a from Stage 4 (aligned / total effort)
  contributors:     text("contributors", { mode: "json" }), // [{ vectorId, gap, weight, dominantGoalId, c, e }] ranked by |W_v·Γ_v|
  vectorBreakdown:  text("vector_breakdown", { mode: "json" }).notNull(), // kept until contributors is live
  explanation:      text("explanation"),                   // one LLM sentence from §3.2
  createdAt:        integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});
