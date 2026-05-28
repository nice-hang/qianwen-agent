export function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString();
}

export function readError(cause: unknown): string {
  return cause instanceof Error ? cause.message : "Something went wrong.";
}
