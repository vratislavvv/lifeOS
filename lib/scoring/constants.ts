export const ON_PACE_SCORE      = 100;   // anchor for G = 0 (on pace = 100, never exceeds 100)
export const EMA_ALPHA          = 0.3;   // ~1 week memory
export const ALIGN_LAMBDA       = 0.15;  // max alignment penalty
export const ALIGN_WINDOW_DAYS  = 14;
export const STALE_GRACE        = 5;     // days before staleness starts
export const STALE_RATE         = 0.01;  // per day beyond grace
export const STALE_CAP          = 0.15;  // max staleness drag per vector
export const MAX_INPUT_DELTA    = 1.0;   // per-input ceiling; total is clamped to 1 by completion logic
export const CONFIDENCE_FLOOR   = 0.2;   // inputs below this are ignored
