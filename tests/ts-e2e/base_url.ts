const E2E_PORT = Number(process.env.E2E_PORT || 5010);
export const E2E_BASE_URL = process.env.E2E_BASE_URL || `http://127.0.0.1:${E2E_PORT}`;