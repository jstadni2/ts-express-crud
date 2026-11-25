import type { Request } from "express";
import { logger } from "./logger.js";

export const FLASH_SESSION_KEY = "_flashes";

export interface FlashMessage {
  category: string;
  message: string;
}

/** Flash a user-facing message stored in the session until the next render. */
export function flash(req: Request, category: string, message: string): void {
  if (!req.session) return;
  const list = (req.session[FLASH_SESSION_KEY] ??= []) as FlashMessage[];
  list.push({ category, message });
}

/**
 * Remove and return pending flash messages. Mirrors Jinja's
 * `get_flashed_messages()`: messages flashed during the current request (e.g.
 * the 403 handler) are visible to the page rendered in that same response.
 */
export function takeFlashes(req: Request): FlashMessage[] {
  if (!req.session) return [];
  const list = (req.session[FLASH_SESSION_KEY] ?? []) as FlashMessage[];
  delete req.session[FLASH_SESSION_KEY];
  return list;
}

/**
 * Intentional, user-facing validation error. Mirrors Python's `ValueError`:
 * the message is safe to show to the user via a flash message.
 */
export class ValidationError extends Error {}

/** HTTP error mapped to a status code, mirroring Werkzeug's `HTTPException`. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message?: string,
  ) {
    super(message ?? `HTTP ${status}`);
  }
}

/**
 * Flash a user-facing error message; log unexpected exceptions server-side.
 * Port of `_flash_error(action, exc)` from `src/app.py`.
 */
export function flashError(req: Request, action: string, exc: unknown): void {
  if (exc instanceof ValidationError) {
    flash(req, "error", `${action}: ${exc.message}`);
  } else {
    logger.exception(action, exc);
    flash(req, "error", "An unexpected error occurred. Please try again or contact support.");
  }
}

// ---------------------------------------------------------------------------
// Form field parsing (port of `request.form[...]` / `request.form.get(...)`)
// ---------------------------------------------------------------------------

function parseIntStrict(field: string, value: string): number {
  if (!/^[+-]?\d+$/.test(value.trim())) {
    throw new ValidationError(`invalid literal for int() with base 10: '${value}'`);
  }
  return Number.parseInt(value.trim(), 10);
}

/** Required form field; missing keys are a 400 like Flask's `request.form[key]`. */
export function formString(req: Request, key: string): string {
  const value = req.body?.[key];
  if (typeof value !== "string") {
    throw new HttpError(400, `Missing form field: ${key}`);
  }
  return value;
}

/** Optional form field with a default, like `request.form.get(key, default)`. */
export function formStringOr(req: Request, key: string, fallback = ""): string {
  const value = req.body?.[key];
  return typeof value === "string" ? value : fallback;
}

/** Optional integer form field: empty/missing becomes null, invalid raises. */
export function formIntOrNull(req: Request, key: string): number | null {
  const value = req.body?.[key];
  if (value === undefined || value === "") return null;
  return parseIntStrict(key, String(value));
}

/** Required integer form field; a missing key is a 400 like Flask. */
export function formRequiredInt(req: Request, key: string): number {
  const value = req.body?.[key];
  if (value === undefined || value === "") {
    throw new HttpError(400, `Missing form field: ${key}`);
  }
  return parseIntStrict(key, String(value));
}

/** All submitted values for a repeated field, like `request.form.getlist(key)`. */
export function formIntList(req: Request, key: string): number[] {
  const raw = req.body?.[key];
  if (raw === undefined) return [];
  const values = Array.isArray(raw) ? raw : [raw];
  return values.map((value) => parseIntStrict(key, String(value)));
}

// ---------------------------------------------------------------------------
// Value parsing (port of `_parse_date`, `_parse_decimal`, `_get_enum_by_value`)
// ---------------------------------------------------------------------------

/** Parse an ISO "YYYY-MM-DD" date; empty becomes null, invalid raises. */
export function parseDateField(value: string): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new ValidationError(`time data '${value}' does not match format '%Y-%m-%d'`);
  }
  return value;
}

/** Parse a decimal string (kept as-is for Postgres numeric columns). */
export function parseDecimalField(fieldName: string, value: string): string {
  const trimmed = value.trim();
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(trimmed)) {
    throw new ValidationError(`${fieldName} must be a valid number.`);
  }
  return trimmed;
}

/**
 * Look up an enum value by its human-facing value. Mirrors
 * `_get_enum_by_value`: unknown values raise a user-facing ValueError.
 */
export function getEnumByValue<T extends Record<string, string>>(
  enumObject: T,
  enumName: string,
  value: string,
): string {
  for (const enumValue of Object.values(enumObject)) {
    if (enumValue === value) return enumValue;
  }
  throw new ValidationError(`Invalid value for ${enumName}: ${value}`);
}
