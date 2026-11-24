/** Minimal structured logger matching the Flask app's logging behavior. */
export const logger = {
  info(message: string, ...args: unknown[]) {
    console.log(message, ...args);
  },
  error(message: string, ...args: unknown[]) {
    console.error(message, ...args);
  },
  exception(message: string, err: unknown) {
    console.error(message, err);
  },
};