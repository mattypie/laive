import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";

import { decodeAlsBuffer, diffSummaries, summarizeAlsXml } from "../src/index.js";

const baseFixture = new URL("./fixtures/simple-set.xml", import.meta.url);
const updatedFixture = new URL("./fixtures/updated-set.xml", import.meta.url);

test("decodeAlsBuffer handles plain XML", async () => {
  const xml = await readFile(baseFixture);
  const decoded = decodeAlsBuffer(xml);

  assert.match(decoded, /<LiveSet>/);
});

test("decodeAlsBuffer handles gzipped ALS data", async () => {
  const xml = await readFile(baseFixture);
  const decoded = decodeAlsBuffer(gzipSync(xml));

  assert.match(decoded, /<LiveSet>/);
});

test("summarizeAlsXml returns a compact set summary", async () => {
  const xml = await readFile(baseFixture, "utf8");
  const summary = summarizeAlsXml(xml);

  assert.equal(summary.tempo, 120);
  assert.deepEqual(summary.trackCounts, {
    audio: 1,
    midi: 1,
    return: 1
  });
  assert.deepEqual(summary.scenes, ["Intro", "Verse"]);
  assert.equal(summary.clipCount, 2);
});

test("diffSummaries reports core project changes", async () => {
  const previousXml = await readFile(baseFixture, "utf8");
  const nextXml = await readFile(updatedFixture, "utf8");

  const previousSummary = summarizeAlsXml(previousXml);
  const nextSummary = summarizeAlsXml(nextXml);
  const diff = diffSummaries(previousSummary, nextSummary);

  assert.deepEqual(
    diff.map((item) => item.type),
    ["tempo.changed", "trackCount.changed", "scene.added", "clipCount.changed"]
  );
});
