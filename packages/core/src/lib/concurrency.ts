/**
 * Map over items with a bounded number of in-flight async calls. Preserves
 * input order in the result. The first rejection propagates (like
 * `Promise.all`) — callers that want to skip failures handle that inside the
 * mapper.
 *
 * Used to fan out per-file vault reads: an E2EE vault has no plaintext index,
 * so listing means reading every ciphertext file, which is fatally slow done
 * one-at-a-time over the network.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  const workerCount = Math.max(1, Math.min(limit, items.length));
  let next = 0;
  async function worker(): Promise<void> {
    for (let index = next++; index < items.length; index = next++) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- index is bounded by items.length
      results[index] = await mapper(items[index]!, index);
    }
  }
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}
