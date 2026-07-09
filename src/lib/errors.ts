/** Human-readable message from a Tauri invoke / query error. */
export function formatInvokeError(err: unknown): string {
  const message = String(err);
  if (
    message.includes("connection abort") ||
    message.includes("connection error") ||
    message.includes("os error 103") ||
    message.includes("broken pipe") ||
    message.includes("timed out")
  ) {
    return "Connection lost. Pull to refresh or try again in a moment.";
  }
  if (
    message.toLowerCase().includes("unauthorized") ||
    message.toLowerCase().includes("invalid session")
  ) {
    return "Session expired. Please sign in again.";
  }
  return message;
}

/** True when the error indicates an invalid/expired auth session. */
export function isAuthError(err: unknown): boolean {
  const message = String(err).toLowerCase();
  return (
    message.includes("unauthorized") ||
    message.includes("invalid session") ||
    message.includes("session expired")
  );
}
