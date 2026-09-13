import test from "node:test";
import assert from "node:assert/strict";
import { normalizeYouTube, signToken, verifyToken, equalSecret, validateDownload } from "../lib/core.mjs";

test("watch, Shorts and shared links resolve to one canonical URL", () => {
  for (const url of ["https://youtu.be/YE7VzlLtp-4?t=1", "https://www.youtube.com/watch?v=YE7VzlLtp-4&list=test", "https://m.youtube.com/shorts/YE7VzlLtp-4", "https://youtube.com/embed/YE7VzlLtp-4"])
    assert.equal(normalizeYouTube(url), "https://www.youtube.com/watch?v=YE7VzlLtp-4");
});
test("reject non-YouTube hosts, credentials, ports and playlist-only URLs", () => {
  for (const url of ["https://youtube.com.evil.example/watch?v=YE7VzlLtp-4", "https://youtube.com@evil.example/", "https://me@youtube.com/watch?v=YE7VzlLtp-4", "http://127.0.0.1/video", "file:///etc/passwd", "https://youtube.com:8443/watch?v=YE7VzlLtp-4", "https://youtube.com/playlist?list=test", "https://youtu.be/short", undefined]) assert.throws(() => normalizeYouTube(url));
});
test("job tokens verify signatures, kind and expiry", () => {
  const secret = "x".repeat(32);
  const value = { kind: "job", exp: 2000, id: "my-job" };
  const token = signToken(value, secret);
  assert.deepEqual(verifyToken(token, secret, "job", 1000), value);
  assert.throws(() => verifyToken(token, secret, "session", 1000));
  assert.throws(() => verifyToken(token, secret, "job", 2000));
  assert.throws(() => verifyToken(token + "tampered", secret, "job", 1000));
  assert.throws(() => verifyToken(token, "y".repeat(32), "job", 1000));
  assert.throws(() => signToken(value, "short"));
});
test("constant-time comparison rejects invalid values", () => {
  assert.equal(equalSecret("correct", "correct"), true);
  assert.equal(equalSecret("wrong", "correct"), false);
  assert.equal(equalSecret(undefined, undefined), false);
});
test("format is restricted to server-discovered selections", () => {
  const qualities = [{ id: "137" }];
  const valid = { quality: "137", container: "mp4", destination: "photos" };
  assert.deepEqual(validateDownload(valid, qualities), valid);
  assert.throws(() => validateDownload({ ...valid, quality: "best" }, qualities));
  assert.throws(() => validateDownload({ ...valid, container: "mkv" }, qualities));
  assert.throws(() => validateDownload({ ...valid, destination: "arbitrary-path" }, qualities));
  assert.deepEqual(validateDownload({ ...valid, destination: "files", container: "mkv" }, qualities), { quality: "137", destination: "files", container: "mkv" });
});
