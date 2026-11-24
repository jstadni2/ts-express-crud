import type { Request, Response } from "express";

const FLASH_KEY = "_flash_messages";

export type FlashMessage = { category: string; message: string };

/** Flash a user-facing message into the session queue. */
export function flash(req: Request, message: string, category = "message"): void {
  const session = req.session as any;
  if (!Array.isArray(session[FLASH_KEY])) session[FLASH_KEY] = [];
  session[FLASH_KEY].push({ category, message });
}

/** Pop and return the pending flash messages for the current request. */
export function takeFlashes(req: Request): FlashMessage[] {
  const session = req.session as any;
  const messages = Array.isArray(session[FLASH_KEY]) ? (session[FLASH_KEY] as FlashMessage[]) : [];
  delete session[FLASH_KEY];
  return messages;
}

/**
 * Mirror the Flask `_flash_error`: flash ValueError-style messages directly,
 * and for all other errors log and flash a generic message without exposing
 * raw exception details.
 */
export function flashError(req: Request, logger: { error: (msg: string, err: unknown) => void }, action: string, exc: unknown, res?: Response): void {
  if (exc instanceof Error && exc.name === "ValidationError") {
    flash(req, `${action}: ${exc.message}`, "error");
  } else {
    logger.error(`${action}`, exc);
    flash(req, "An unexpected error occurred. Please try again or contact support.", "error");
  }
}

/** A typed error whose message is safe to show to the user. */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/** Parse a date string (YYYY-MM-DD) or return null when empty/invalid. */
export function parseDate(value: string | undefined): string | null {
  if (!value) return null;
  return value;
}

/** Parse a decimal string or throw a ValidationError. */
export function parseDecimal(fieldName: string, value: string): string {
  if (value === undefined || value === null || value.trim() === "") {
    throw new ValidationError(`${fieldName} must be a valid number.`);
  }
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new ValidationError(`${fieldName} must be a valid number.`);
  }
  return String(parsed);
}

/** Resolve a value against the allowed set of an enum, or throw. */
export function getEnumByValue<T extends readonly string[]>(
  enumValues: T,
  value: string,
  enumName: string,
): (typeof enumValues)[number] {
  const found = enumValues.find((v) => v === value);
  if (found === undefined) {
    throw new ValidationError(`Invalid value for ${enumName}: ${value}`);
  }
  return found;
}