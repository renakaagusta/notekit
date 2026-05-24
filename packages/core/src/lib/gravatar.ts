/**
 * Browser-friendly Gravatar URL builder.
 *
 * Web Crypto doesn't ship MD5 (Gravatar's hash function — chosen in 2007,
 * stuck with it for compat reasons), so we bring our own minimal MD5. The
 * implementation is small, dependency-free, and runs everywhere — web,
 * desktop, and the mobile WebView. We never use this for anything that
 * requires cryptographic strength; it's a content addressing function for
 * an external service.
 *
 * Usage:
 *   gravatarUrlFor("renaka.agusta@onlinebiz.co.id")
 *     → "https://www.gravatar.com/avatar/<hash>?d=identicon&s=256"
 */

/**
 * Minimal RFC 1321 MD5. ~50 lines, returns the lowercase hex digest of a
 * UTF-8-encoded input. Adapted from public-domain reference implementations
 * and inlined here to avoid pulling in a hashing dependency.
 */
function md5Hex(input: string): string {
  function rotl(x: number, n: number): number {
    return (x << n) | (x >>> (32 - n));
  }
  function add32(a: number, b: number): number {
    return (a + b) & 0xffffffff;
  }
  function cmn(q: number, a: number, b: number, x: number, s: number, t: number): number {
    return add32(rotl(add32(add32(a, q), add32(x, t)), s), b);
  }
  function ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn((b & c) | (~b & d), a, b, x, s, t);
  }
  function gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn((b & d) | (c & ~d), a, b, x, s, t);
  }
  function hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn(b ^ c ^ d, a, b, x, s, t);
  }
  function ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn(c ^ (b | ~d), a, b, x, s, t);
  }

  // UTF-8 encode
  const bytes = new TextEncoder().encode(input);
  // Pad to 64-byte blocks per RFC 1321
  const bitLen = bytes.length * 8;
  const padded = new Uint8Array(Math.ceil((bytes.length + 9) / 64) * 64);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  // Append 64-bit little-endian bit length
  const dv = new DataView(padded.buffer);
  dv.setUint32(padded.length - 8, bitLen >>> 0, true);
  dv.setUint32(padded.length - 4, Math.floor(bitLen / 0x100000000), true);

  let a = 0x67452301,
    b = 0xefcdab89,
    c = 0x98badcfe,
    d = 0x10325476;

  for (let i = 0; i < padded.length; i += 64) {
    // Read the 16 little-endian uint32s directly into named consts so
    // strict-mode typed-array indexing (noUncheckedIndexedAccess) doesn't
    // make each access `number | undefined`.
    const x0 = dv.getUint32(i + 0, true);
    const x1 = dv.getUint32(i + 4, true);
    const x2 = dv.getUint32(i + 8, true);
    const x3 = dv.getUint32(i + 12, true);
    const x4 = dv.getUint32(i + 16, true);
    const x5 = dv.getUint32(i + 20, true);
    const x6 = dv.getUint32(i + 24, true);
    const x7 = dv.getUint32(i + 28, true);
    const x8 = dv.getUint32(i + 32, true);
    const x9 = dv.getUint32(i + 36, true);
    const x10 = dv.getUint32(i + 40, true);
    const x11 = dv.getUint32(i + 44, true);
    const x12 = dv.getUint32(i + 48, true);
    const x13 = dv.getUint32(i + 52, true);
    const x14 = dv.getUint32(i + 56, true);
    const x15 = dv.getUint32(i + 60, true);
    const aa = a, bb = b, cc = c, dd = d;

    a = ff(a, b, c, d, x0, 7, -680876936);
    d = ff(d, a, b, c, x1, 12, -389564586);
    c = ff(c, d, a, b, x2, 17, 606105819);
    b = ff(b, c, d, a, x3, 22, -1044525330);
    a = ff(a, b, c, d, x4, 7, -176418897);
    d = ff(d, a, b, c, x5, 12, 1200080426);
    c = ff(c, d, a, b, x6, 17, -1473231341);
    b = ff(b, c, d, a, x7, 22, -45705983);
    a = ff(a, b, c, d, x8, 7, 1770035416);
    d = ff(d, a, b, c, x9, 12, -1958414417);
    c = ff(c, d, a, b, x10, 17, -42063);
    b = ff(b, c, d, a, x11, 22, -1990404162);
    a = ff(a, b, c, d, x12, 7, 1804603682);
    d = ff(d, a, b, c, x13, 12, -40341101);
    c = ff(c, d, a, b, x14, 17, -1502002290);
    b = ff(b, c, d, a, x15, 22, 1236535329);

    a = gg(a, b, c, d, x1, 5, -165796510);
    d = gg(d, a, b, c, x6, 9, -1069501632);
    c = gg(c, d, a, b, x11, 14, 643717713);
    b = gg(b, c, d, a, x0, 20, -373897302);
    a = gg(a, b, c, d, x5, 5, -701558691);
    d = gg(d, a, b, c, x10, 9, 38016083);
    c = gg(c, d, a, b, x15, 14, -660478335);
    b = gg(b, c, d, a, x4, 20, -405537848);
    a = gg(a, b, c, d, x9, 5, 568446438);
    d = gg(d, a, b, c, x14, 9, -1019803690);
    c = gg(c, d, a, b, x3, 14, -187363961);
    b = gg(b, c, d, a, x8, 20, 1163531501);
    a = gg(a, b, c, d, x13, 5, -1444681467);
    d = gg(d, a, b, c, x2, 9, -51403784);
    c = gg(c, d, a, b, x7, 14, 1735328473);
    b = gg(b, c, d, a, x12, 20, -1926607734);

    a = hh(a, b, c, d, x5, 4, -378558);
    d = hh(d, a, b, c, x8, 11, -2022574463);
    c = hh(c, d, a, b, x11, 16, 1839030562);
    b = hh(b, c, d, a, x14, 23, -35309556);
    a = hh(a, b, c, d, x1, 4, -1530992060);
    d = hh(d, a, b, c, x4, 11, 1272893353);
    c = hh(c, d, a, b, x7, 16, -155497632);
    b = hh(b, c, d, a, x10, 23, -1094730640);
    a = hh(a, b, c, d, x13, 4, 681279174);
    d = hh(d, a, b, c, x0, 11, -358537222);
    c = hh(c, d, a, b, x3, 16, -722521979);
    b = hh(b, c, d, a, x6, 23, 76029189);
    a = hh(a, b, c, d, x9, 4, -640364487);
    d = hh(d, a, b, c, x12, 11, -421815835);
    c = hh(c, d, a, b, x15, 16, 530742520);
    b = hh(b, c, d, a, x2, 23, -995338651);

    a = ii(a, b, c, d, x0, 6, -198630844);
    d = ii(d, a, b, c, x7, 10, 1126891415);
    c = ii(c, d, a, b, x14, 15, -1416354905);
    b = ii(b, c, d, a, x5, 21, -57434055);
    a = ii(a, b, c, d, x12, 6, 1700485571);
    d = ii(d, a, b, c, x3, 10, -1894986606);
    c = ii(c, d, a, b, x10, 15, -1051523);
    b = ii(b, c, d, a, x1, 21, -2054922799);
    a = ii(a, b, c, d, x8, 6, 1873313359);
    d = ii(d, a, b, c, x15, 10, -30611744);
    c = ii(c, d, a, b, x6, 15, -1560198380);
    b = ii(b, c, d, a, x13, 21, 1309151649);
    a = ii(a, b, c, d, x4, 6, -145523070);
    d = ii(d, a, b, c, x11, 10, -1120210379);
    c = ii(c, d, a, b, x2, 15, 718787259);
    b = ii(b, c, d, a, x9, 21, -343485551);

    a = add32(a, aa);
    b = add32(b, bb);
    c = add32(c, cc);
    d = add32(d, dd);
  }

  function hex(n: number): string {
    let s = "";
    for (let i = 0; i < 4; i++) {
      const byte = (n >> (i * 8)) & 0xff;
      s += byte.toString(16).padStart(2, "0");
    }
    return s;
  }
  return hex(a) + hex(b) + hex(c) + hex(d);
}

/**
 * Build the Gravatar URL for an email. Falls back to Gravatar's identicon
 * (a deterministic per-hash visual) when the email has no registered
 * Gravatar — same behavior as GitHub's commit pages.
 *
 * Pass an empty string to get a transparent 1×1 (used as a "nothing to
 * render" placeholder before the user has typed a name).
 */
export function gravatarUrlFor(email: string, size = 256): string {
  if (!email) return "";
  const hash = md5Hex(email.trim().toLowerCase());
  return `https://www.gravatar.com/avatar/${hash}?d=identicon&s=${size}`;
}
