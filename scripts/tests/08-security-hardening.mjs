// Uji otomatis — bagian dari scripts/self-test.mjs (lihat berkas itu).
// Harness (DB sementara + assert) diimpor dari ../test-harness.mjs.
//
// Fokus: pengamanan putaran berikutnya — rate limit aksi host, perbandingan
// token waktu-konstan, dan CSP berbasis nonce.
import assert from "node:assert/strict"
import { test, section } from "../test-harness.mjs"

section("8. pengamanan — rate limit host, compare, CSP")

test("secure-compare: safeEqual benar/salah/panjang beda/tipe bukan string", async () => {
  const { safeEqual } = await import("../../src/lib/secure-compare.js")
  assert.equal(safeEqual("abcdef", "abcdef"), true)
  assert.equal(safeEqual("abcdef", "abcdeg"), false)
  assert.equal(safeEqual("abc", "abcdef"), false)
  assert.equal(safeEqual("", ""), true)
  assert.equal(safeEqual(null, "abc"), false)
  assert.equal(safeEqual("abc", undefined), false)
  assert.equal(safeEqual(123, 123), false)
})

test("quiz-store: isHost memakai safeEqual & menolak token salah/kosong", async () => {
  const store = await import("../../src/lib/quiz-store.js")
  const { room } = store.createRoom({ title: "Host", questions: [{ text: "q", options: ["a", "b"], correctIndex: 0, timeSec: 10 }] })
  assert.equal(store.isHost(room, room.hostToken), true)
  assert.equal(store.isHost(room, "0".repeat(room.hostToken.length)), false)
  assert.equal(store.isHost(room, ""), false)
  assert.equal(store.isHost(room, null), false)
  // Token salah harus ditolak oleh aksi host.
  const denied = store.startQuiz(room.code, "x".repeat(32))
  assert.equal(denied.code, 403)
})

test("quiz-store: authenticatePlayer menolak token pemain yang salah", async () => {
  const store = await import("../../src/lib/quiz-store.js")
  const { room } = store.createRoom({ title: "Join", questions: [{ text: "q", options: ["a", "b"], correctIndex: 0, timeSec: 10 }] })
  const joined = store.joinRoom(room.code, "Ani")
  assert.ok(joined.player)
  assert.equal(store.authenticatePlayer(room, joined.player.id, joined.player.token), joined.player)
  assert.equal(store.authenticatePlayer(room, joined.player.id, "wrong-token"), null)
})

test("host-actions: throttleHostAction mengizinkan lalu menolak setelah batas", async () => {
  const { throttleHostAction } = await import("../../src/lib/host-actions.js")
  const { LIMITS } = await import("../../src/lib/http.js")
  // UA unik supaya bucket tidak bentrok dengan uji lain (kunci = sidik jari header).
  const ua = `rate-probe/${Math.random().toString(36).slice(2)}`
  const request = { headers: new Headers({ "user-agent": ua, "accept-language": "id" }) }

  for (let i = 0; i < LIMITS.hostAction.max; i += 1) {
    assert.equal(throttleHostAction(request), null, `panggilan ke-${i + 1} harus lolos`)
  }
  const blocked = throttleHostAction(request)
  assert.ok(blocked, "panggilan melebihi batas harus diblokir")
  assert.equal(blocked.status, 429)
  assert.ok(blocked.headers.get("retry-after"))
})

test("middleware: CSP modern memakai nonce & TANPA unsafe-inline di script-src", async () => {
  const { middleware } = await import("../../src/middleware.js")
  const request = {
    headers: new Headers({
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    }),
    nextUrl: { pathname: "/" },
    url: "http://localhost:3500/",
  }
  const response = middleware(request)
  const csp = response.headers.get("content-security-policy")
  assert.ok(csp, "CSP harus ada")
  const scriptSrc = csp.split(";").map((p) => p.trim()).find((p) => p.startsWith("script-src"))
  assert.match(scriptSrc, /'nonce-[A-Za-z0-9+/=]+'/, "script-src harus memuat nonce")
  assert.match(scriptSrc, /'strict-dynamic'/)
  assert.ok(!scriptSrc.includes("'unsafe-inline'"), "script-src tidak boleh unsafe-inline")
  assert.equal(csp.includes("frame-ancestors 'none'"), true)
})

test("middleware: style-src-elem TANPA unsafe-inline (tag <style> harus nonce)", async () => {
  const { middleware } = await import("../../src/middleware.js")
  const request = {
    headers: new Headers({
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    }),
    nextUrl: { pathname: "/" },
    url: "http://localhost:3500/",
  }
  const csp = middleware(request).headers.get("content-security-policy")
  const directive = (name) => csp.split(";").map((p) => p.trim()).find((p) => p.startsWith(name))
  const elem = directive("style-src-elem")
  assert.ok(elem, "style-src-elem harus ada")
  assert.match(elem, /'nonce-[A-Za-z0-9+/=]+'/, "style-src-elem harus memuat nonce")
  assert.ok(!elem.includes("'unsafe-inline'"), "style-src-elem tidak boleh unsafe-inline")
  const attr = directive("style-src-attr")
  assert.ok(attr && attr.includes("'unsafe-inline'"), "style-src-attr harus unsafe-inline (atribut style= app)")
})

test("middleware: nonce berbeda tiap request (tidak dapat diprediksi)", async () => {
  const { middleware } = await import("../../src/middleware.js")
  const request = {
    headers: new Headers({ "user-agent": "Mozilla/5.0 Chrome/124.0" }),
    nextUrl: { pathname: "/" },
    url: "http://localhost:3500/",
  }
  const csp1 = middleware(request).headers.get("content-security-policy")
  const csp2 = middleware(request).headers.get("content-security-policy")
  assert.notEqual(csp1, csp2, "nonce harus berbeda tiap request")
})

test("middleware: browser lama (Chrome/55) dapat jalur unsafe-inline", async () => {
  const { middleware } = await import("../../src/middleware.js")
  const request = {
    headers: new Headers({
      "user-agent": "Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/55.0 Safari/537.36",
    }),
    nextUrl: { pathname: "/" },
    url: "http://localhost:3500/",
  }
  const csp = middleware(request).headers.get("content-security-policy")
  const scriptSrc = csp.split(";").map((p) => p.trim()).find((p) => p.startsWith("script-src"))
  assert.ok(scriptSrc.includes("'unsafe-inline'"), "browser lama butuh unsafe-inline")
  assert.ok(!scriptSrc.includes("nonce-"), "jalur lama tidak memakai nonce")
})
