const pending = new Map();

// Share only in-flight work. Completion or failure permits a fresh request.
export function sharePendingRequest(key, send) {
  if (!pending.has(key)) {
    const request = Promise.resolve().then(send).finally(() => pending.delete(key));
    pending.set(key, request);
  }
  return pending.get(key);
}
