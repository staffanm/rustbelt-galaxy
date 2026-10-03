// Generates the missing game images with the Codex CLI, one "codex exec" call for each image.
// Usage: node scripts/generate-art.mjs [--dry-run] [--force] [--only <path prefix>] [--list <file>] [--limit <n>] [--parallel <n>] [--output <folder>]
// --list generates the images that the file names, one path on each line, also when they exist. The script removes a
// path from the file when its image is done.
// The images go to art/originals/hd at full size. --output writes them to another folder, for a trial.
// Then run: python3 scripts/art-resize.py
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const dryRun = flag('--dry-run');
const force = flag('--force');
const only = value('--only');
const listFile = value('--list');
const listed = listFile ? new Set(readFileSync(listFile, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean)) : null;
const limit = Number(value('--limit') ?? Infinity);
const parallel = Math.max(1, Number(value('--parallel') ?? 1));

const prompts = JSON.parse(readFileSync('art/prompts.json', 'utf8'));
const { references, entries } = prompts;
const output = value('--output') ?? prompts.output;
const todo = entries.filter((e) => (listed ? listed.has(e.file) : (!only || e.file.startsWith(only)) && (force || !existsSync(join(output, e.file))))).slice(0, limit);
console.log(`${todo.length} of ${entries.length} images to generate into ${output}`);

function generate(e) {
  const target = join(output, e.file);
  mkdirSync(dirname(target), { recursive: true });
  const prompt =
    `Generate one image with your image generation tool and save it as a PNG file at "${target}" in this repository. ` +
    `The attached images are existing art of this game. Use them as the style reference only: match their outlines, colours and wear. Do not copy their subjects. ` +
    `Save the file exactly as the image tool produced it, at its full size. Do not resize, crop, quantize or edit it. ` +
    `Other jobs generate images at the same time. Use only the file that your own image generation call returned. Do not search a folder for the newest image. ` +
    `Do not change, create or delete any other file. Do not write code.\n\n${e.prompt}`;
  return new Promise((resolve) => {
    const child = spawn('codex', ['exec', '--skip-git-repo-check', '--sandbox', 'workspace-write', ...references.flatMap((r) => ['--image', r]), '--', prompt], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    let err = '';
    child.stderr.on('data', (d) => (err += d));
    // With --list the old image is still there, so a new image is one that changed.
    const before = existsSync(target) ? statSync(target).mtimeMs : 0;
    child.on('close', (code) => resolve({ ok: code === 0 && existsSync(target) && statSync(target).mtimeMs > before, err: err.slice(-400) }));
    child.on('error', (e2) => resolve({ ok: false, err: String(e2) }));
  });
}

let failed = 0;
let done = 0;
const start = Date.now();
const queue = [...todo];
async function worker() {
  while (queue.length) {
    const e = queue.shift();
    const target = join(output, e.file);
    if (dryRun) {
      console.log(`[${++done}/${todo.length}] ${target}`);
      continue;
    }
    const t0 = Date.now();
    console.log(`generating ${target}...`)
    const res = await generate(e);
    done++;
    const secs = Math.round((Date.now() - t0) / 1000);
    if (res.ok) {
      console.log(`[${done}/${todo.length}] ok   ${target} (${secs}s)`);
      if (listed) {
        listed.delete(e.file);
        writeFileSync(listFile, [...listed].join('\n') + (listed.size ? '\n' : ''));
      }
    }
    else {
      failed++;
      console.log(`[${done}/${todo.length}] FAIL ${target} (${secs}s)\n${res.err}`);
    }
  }
}
await Promise.all(Array.from({ length: parallel }, worker));
console.log(`finished in ${Math.round((Date.now() - start) / 60000)} minutes, ${failed} failed`);
if (failed) {
  console.error('Run the script again to retry the failed images.');
  process.exitCode = 1;
}
