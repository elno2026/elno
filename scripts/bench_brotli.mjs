import { readFile } from "node:fs/promises";
import { gzipSync, brotliCompressSync, constants } from "node:zlib";

const SAMPLE_TEXT = `
Merkezi sosyal medya platformlarının kullanıcı verisi üzerindeki kontrolü,
insanların dijital kimliklerini kendi cüzdanlarıyla yönetebildiği on-chain
sosyal ağların neden gerekli olduğunu gösteriyor. Açık bir protokolde postlar,
profil bilgileri, yanıtlar ve etkileşimler herkes tarafından okunabilir olmalı.
Bu sayede kapalı ve paralı API'lara bağlı kalmadan farklı arayüzler, indexerlar
ve topluluk araçları aynı sosyal grafa bağlanabilir.
`.trim();

function bytes(input) {
  return Buffer.byteLength(input, "utf8");
}

function pct(part, whole) {
  return `${((part / whole) * 100).toFixed(1)}%`;
}

function ratio(raw, compressed) {
  return `${(raw / compressed).toFixed(2)}x`;
}

function compress(text) {
  const raw = Buffer.from(text, "utf8");
  const gzip = gzipSync(raw, { level: 9 });
  const brotliQ6 = brotliCompressSync(raw, {
    params: {
      [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT,
      [constants.BROTLI_PARAM_QUALITY]: 6
    }
  });
  const brotliQ11 = brotliCompressSync(raw, {
    params: {
      [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT,
      [constants.BROTLI_PARAM_QUALITY]: 11
    }
  });

  return [
    ["raw utf8", raw.length],
    ["gzip-9", gzip.length],
    ["brotli-q6", brotliQ6.length],
    ["brotli-q11", brotliQ11.length]
  ];
}

async function readStdinIfAny() {
  if (process.stdin.isTTY) return "";

  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8").trim();
}

async function loadTexts() {
  const files = process.argv.slice(2);
  if (files.length > 0) {
    return Promise.all(
      files.map(async (file) => ({
        name: file,
        text: await readFile(file, "utf8")
      }))
    );
  }

  const stdin = await readStdinIfAny();
  if (stdin) return [{ name: "stdin", text: stdin }];

  return [{ name: "sample", text: SAMPLE_TEXT }];
}

for (const { name, text } of await loadTexts()) {
  const rawBytes = bytes(text);
  console.log(`\n${name}`);
  console.log(`characters: ${text.length}`);
  console.log(`utf8 bytes: ${rawBytes}`);
  console.log("format       bytes   ratio   size   <=700   <=900");

  for (const [label, size] of compress(text)) {
    console.log(
      `${label.padEnd(12)} ${String(size).padStart(5)}   ${ratio(rawBytes, size).padStart(5)}   ${pct(size, rawBytes).padStart(6)}   ${size <= 700 ? "yes" : " no"}    ${size <= 900 ? "yes" : " no"}`
    );
  }
}

