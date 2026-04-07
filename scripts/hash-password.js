const crypto = require("crypto");

const password = process.argv[2];
if (!password) {
  console.error("Usage: npm run hash-password -- '<StrongPassword>'");
  process.exit(1);
}

const salt = crypto.randomBytes(16).toString("hex");
const N = 16384;
const r = 8;
const p = 1;
const hash = crypto
  .scryptSync(password, salt, 64, {
    N,
    r,
    p,
    maxmem: 128 * N * r + 1024 * 1024,
  })
  .toString("hex");

console.log(["scrypt", N, r, p, salt, hash].join("$"));
