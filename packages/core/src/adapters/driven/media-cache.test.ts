import { describe, it, expect } from "vitest";
import { MediaCache, MemoryMediaStore } from "./media-cache";

/** Minimal Blob stand-in for the node test environment. */
function blob(size: number): Blob {
  return { size, type: "application/octet-stream" } as unknown as Blob;
}

function fakeFetch(
  bodies: Record<string, { size?: number; opaque?: boolean; status?: number }>,
): { fn: typeof fetch; calls: () => number } {
  let calls = 0;
  const fn = (async (input: string) => {
    calls++;
    const spec = bodies[input];
    if (!spec) throw new Error("network error");
    return {
      ok: (spec.status ?? 200) < 400,
      type: spec.opaque ? "opaque" : "basic",
      blob: async () => blob(spec.size ?? 10),
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { fn, calls: () => calls };
}

describe("MediaCache", () => {
  it("fetches on miss, then serves from store on hit", async () => {
    const store = new MemoryMediaStore();
    const { fn, calls } = fakeFetch({ "u://a": { size: 5 } });
    const cache = new MediaCache({ store, fetchImpl: fn });

    const first = await cache.getBlob("u://a");
    const second = await cache.getBlob("u://a");

    expect(first?.size).toBe(5);
    expect(second?.size).toBe(5);
    expect(calls()).toBe(1); // second served from cache
  });

  it("returns null and does not store opaque cross-origin responses", async () => {
    const store = new MemoryMediaStore();
    const { fn } = fakeFetch({ "u://x": { opaque: true } });
    const cache = new MediaCache({ store, fetchImpl: fn });

    expect(await cache.getBlob("u://x")).toBeNull();
    expect(await store.entries()).toHaveLength(0);
  });

  it("returns null on network error", async () => {
    const cache = new MediaCache({
      store: new MemoryMediaStore(),
      fetchImpl: fakeFetch({}).fn,
    });
    expect(await cache.getBlob("u://missing")).toBeNull();
  });

  it("coalesces concurrent fetches of the same url", async () => {
    const store = new MemoryMediaStore();
    const { fn, calls } = fakeFetch({ "u://a": { size: 3 } });
    const cache = new MediaCache({ store, fetchImpl: fn });

    const [a, b] = await Promise.all([
      cache.getBlob("u://a"),
      cache.getBlob("u://a"),
    ]);
    expect(a?.size).toBe(3);
    expect(b?.size).toBe(3);
    expect(calls()).toBe(1);
  });

  it("evicts least-recently-accessed entries past the byte budget", async () => {
    let t = 0;
    const clock = () => ++t;
    const store = new MemoryMediaStore(clock);
    const { fn } = fakeFetch({
      "u://a": { size: 60 },
      "u://b": { size: 60 },
      "u://c": { size: 60 },
    });
    const cache = new MediaCache({
      store,
      fetchImpl: fn,
      maxBytes: 150,
      now: clock,
    });

    await cache.getBlob("u://a"); // atime older
    await cache.getBlob("u://b");
    await cache.getBlob("u://a"); // touch a → b is now LRU
    await cache.getBlob("u://c"); // total 180 > 150 → evict oldest (b)

    const keys = (await store.entries()).map((e) => e.key).sort();
    expect(keys).toEqual(["u://a", "u://c"]);
  });
});
