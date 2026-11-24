#!/usr/bin/env node
/**
 * Shutoko / Multi-Lane Rightmost-Lane AI Spline Package (.aip) Generator
 *
 * Reads an existing Assetto Corsa v7 fast_lane.ai (read-only!), detects all
 * long highway corridors where a 3rd (rightmost) paved lane exists with no AI
 * spline on it, synthesizes smooth banked right-lane spline segments with
 * cosine S-curve entry/exit ramps, and packages them with the original
 * fast_lane.ai + AssettoServer config.yml into a standard fast_lane.aip (ZIP).
 *
 * Usage:
 *   node scripts/generate-right-lane-spline.mjs "<input fast_lane.ai>" "<output fast_lane.aip>" [trackId]
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const archiver = require('../backend/node_modules/archiver');

const DEFAULT_INPUT =
  'C:\\Program Files (x86)\\Steam\\steamapps\\common\\assettocorsa\\content\\tracks\\shuto_revival_project_beta\\shibaura_pa_traffic\\ai\\fast_lane.ai';
const DEFAULT_OUTPUT = path.resolve(process.cwd(), 'generated-splines', 'fast_lane.aip');

const inputPath = process.argv[2] || DEFAULT_INPUT;
const outputPath = process.argv[3] || DEFAULT_OUTPUT;
const trackId = process.argv[4] || 'shuto_revival_project_beta';

const TARGET_LANE_WIDTH = 3.23; // Measured median Shutoko lane spacing (meters)
const SAFE_WALL_MARGIN = 1.5;   // Minimum clearance kept to right guardrail (meters)
const HARD_WALL_MARGIN = 1.4;   // Absolute post-smoothing clamp margin (meters)
const MIN_RUN_POINTS = 500;     // ~800m minimum contiguous 3-lane highway corridor
const RAMP_POINTS = 40;         // ~63m cosine S-curve entry/exit lane change

function main() {
  if (!fs.existsSync(inputPath)) {
    console.error(`Input spline not found: ${inputPath}`);
    process.exit(1);
  }

  console.log(`Reading source spline (read-only): ${inputPath}`);
  const buf = fs.readFileSync(inputPath);
  const version = buf.readInt32LE(0);
  const N = buf.readInt32LE(4);
  if (version !== 7 || N <= 0) {
    throw new Error(`Unsupported fast_lane.ai header: version=${version}, N=${N}`);
  }

  const idealOff = 16;
  const detailCountOff = idealOff + N * 20;
  const extraN = buf.readInt32LE(detailCountOff);
  if (extraN !== N) {
    throw new Error(`Unexpected extraCount=${extraN} (expected ${N})`);
  }
  const detailOff = detailCountOff + 4;
  const afterDetails = detailOff + extraN * 72;

  console.log(`Loaded v${version} spline: ${N.toLocaleString()} points (${(buf.length / 1024 / 1024).toFixed(1)} MB)`);

  // Parse arrays
  const xs = new Float32Array(N);
  const ys = new Float32Array(N);
  const zs = new Float32Array(N);
  const wls = new Float32Array(N);
  const wrs = new Float32Array(N);
  const nxs = new Float32Array(N);
  const nys = new Float32Array(N);
  const nzs = new Float32Array(N);
  const txs = new Float32Array(N);
  const tys = new Float32Array(N);
  const tzs = new Float32Array(N);
  const rxs = new Float32Array(N);
  const rys = new Float32Array(N);
  const rzs = new Float32Array(N);

  const cellSize = 15;
  const grid = new Map();

  for (let i = 0; i < N; i++) {
    const io = idealOff + i * 20;
    const x = buf.readFloatLE(io);
    const y = buf.readFloatLE(io + 4);
    const z = buf.readFloatLE(io + 8);
    xs[i] = x;
    ys[i] = y;
    zs[i] = z;

    const doff = detailOff + i * 72;
    wls[i] = buf.readFloatLE(doff + 5 * 4);
    wrs[i] = buf.readFloatLE(doff + 6 * 4);
    const nx = buf.readFloatLE(doff + 9 * 4);
    const ny = buf.readFloatLE(doff + 10 * 4);
    const nz = buf.readFloatLE(doff + 11 * 4);
    const tx = buf.readFloatLE(doff + 13 * 4);
    const ty = buf.readFloatLE(doff + 14 * 4);
    const tz = buf.readFloatLE(doff + 15 * 4);
    nxs[i] = nx;
    nys[i] = ny;
    nzs[i] = nz;
    txs[i] = tx;
    tys[i] = ty;
    tzs[i] = tz;

    // Banked road-plane right unit vector: normalize(cross(T, N))
    let rx = ty * nz - tz * ny;
    let ry = tz * nx - tx * nz;
    let rz = tx * ny - ty * nx;
    const rl = Math.hypot(rx, ry, rz) || 1;
    rxs[i] = rx / rl;
    rys[i] = ry / rl;
    rzs[i] = rz / rl;

    if (i % 2 === 0) {
      const key = `${Math.floor(x / cellSize)},${Math.floor(z / cellSize)}`;
      let arr = grid.get(key);
      if (!arr) {
        arr = [];
        grid.set(key, arr);
      }
      arr.push(i);
    }
  }

  // Classify every point for empty right-lane eligibility
  const canHaveRight = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const wr = wrs[i];
    if (wr < 3.65) continue;

    const x = xs[i];
    const y = ys[i];
    const z = zs[i];
    const tx = txs[i];
    const tz = tzs[i];
    const tl = Math.hypot(tx, tz) || 1;
    const htx = tx / tl;
    const htz = tz / tl;
    const hrx = -htz;
    const hrz = htx;

    const shift = Math.min(TARGET_LANE_WIDTH, Math.max(2.3, wr - SAFE_WALL_MARGIN));
    const sx = x + rxs[i] * shift;
    const sz = z + rzs[i] * shift;

    const cx = Math.floor(x / cellSize);
    const cz = Math.floor(z / cellSize);
    let hasRight = false;
    let blocked = false;

    for (let dx = -1; dx <= 1 && !hasRight && !blocked; dx++) {
      for (let dz = -1; dz <= 1 && !hasRight && !blocked; dz++) {
        const arr = grid.get(`${cx + dx},${cz + dz}`);
        if (!arr) continue;
        for (const j of arr) {
          if (Math.abs(j - i) < 25 || Math.abs(j - i) > N - 25) continue;
          if (Math.abs(ys[j] - y) > 2.5) continue;

          // Candidate shifted point must stay >= 2.2m away from all other existing splines
          const dist2 = (xs[j] - sx) ** 2 + (zs[j] - sz) ** 2;
          if (dist2 < 2.2 * 2.2) {
            blocked = true;
            break;
          }

          // Check if an existing parallel same-direction lane already occupies the right side
          const jtl = Math.hypot(txs[j], tzs[j]) || 1;
          const dot = htx * (txs[j] / jtl) + htz * (tzs[j] / jtl);
          if (dot > 0.82) {
            const vx = xs[j] - x;
            const vz = zs[j] - z;
            if (Math.abs(vx * htx + vz * htz) < 4.5) {
              const lat = vx * hrx + vz * hrz;
              if (lat > 1.5 && lat < 5.8) {
                hasRight = true;
                break;
              }
            }
          }
        }
      }
    }

    if (!hasRight && !blocked) {
      canHaveRight[i] = wr >= 4.15 ? 2 : 1;
    }
  }

  // Extract contiguous runs with hysteresis
  const rawRuns = [];
  let start = -1;
  for (let i = 0; i < N; i++) {
    if (canHaveRight[i] >= 1 && start === -1) {
      start = i;
    } else if (canHaveRight[i] === 0 && start !== -1) {
      rawRuns.push([start, i - 1]);
      start = -1;
    }
  }
  if (start !== -1) rawRuns.push([start, N - 1]);

  const runs = [];
  for (let [s, e] of rawRuns) {
    while (s < e && canHaveRight[s] < 2) s++;
    while (e > s && canHaveRight[e] < 2) e--;
    const len = e - s + 1;
    if (len < MIN_RUN_POINTS) continue;
    if (s <= 5 || e >= N - 5) continue;

    let strong = 0;
    for (let i = s; i <= e; i++) {
      if (canHaveRight[i] === 2) strong++;
    }
    if (strong / len < 0.6) continue;
    runs.push({ s, e, len });
  }

  if (runs.length === 0) {
    throw new Error('No eligible empty right-lane corridors detected.');
  }

  // Build optimized untouched main fast_lane.ai (ideal + details + int32(0) gridFlag)
  const mainOptimized = Buffer.allocUnsafe(afterDetails + 4);
  buf.copy(mainOptimized, 0, 0, afterDetails);
  mainOptimized.writeInt32LE(0, afterDetails);

  // Build each right-lane spline segment
  const generatedSplines = [];

  for (let rIdx = 0; rIdx < runs.length; rIdx++) {
    const { s, e } = runs[rIdx];
    const name = `right_lane_${String(rIdx + 1).padStart(2, '0')}.ai`;
    const M = e - s - 1; // points correspond to source indices (s + 1) .. (e - 1)

    // 1. Compute target lateral shift with cosine entry/exit ramps
    const rawShift = new Float64Array(M);
    for (let m = 0; m < M; m++) {
      const srcIdx = s + 1 + m;
      const baseShift = Math.min(TARGET_LANE_WIDTH, Math.max(2.2, wrs[srcIdx] - SAFE_WALL_MARGIN));
      const entryT = Math.min(1, m / RAMP_POINTS);
      const exitT = Math.min(1, (M - 1 - m) / RAMP_POINTS);
      const entryFactor = 0.5 * (1 - Math.cos(Math.PI * entryT));
      const exitFactor = 0.5 * (1 - Math.cos(Math.PI * exitT));
      rawShift[m] = baseShift * Math.min(entryFactor, exitFactor);
    }

    // 2. Gentle 15-point moving average smoothing (keeps endpoints pinned to 0)
    const smoothShift = new Float64Array(M);
    const halfWin = 7;
    for (let m = 0; m < M; m++) {
      if (m === 0 || m === M - 1) {
        smoothShift[m] = 0;
        continue;
      }
      const lo = Math.max(0, m - halfWin);
      const hi = Math.min(M - 1, m + halfWin);
      let sum = 0;
      for (let k = lo; k <= hi; k++) sum += rawShift[k];
      let val = sum / (hi - lo + 1);
      // Hard wall safety clamp
      const srcIdx = s + 1 + m;
      const maxSafe = Math.max(0, wrs[srcIdx] - HARD_WALL_MARGIN);
      if (val > maxSafe) val = maxSafe;
      smoothShift[m] = val;
    }

    // 3. Compute shifted 3D coordinates along banked road surface
    const px = new Float32Array(M);
    const py = new Float32Array(M);
    const pz = new Float32Array(M);
    let minWallRight = Infinity;
    let maxShift = 0;
    let maxLateralConflict = 0;

    for (let m = 0; m < M; m++) {
      const srcIdx = s + 1 + m;
      const sh = smoothShift[m];
      if (sh > maxShift) maxShift = sh;
      px[m] = xs[srcIdx] + rxs[srcIdx] * sh;
      py[m] = ys[srcIdx] + rys[srcIdx] * sh;
      pz[m] = zs[srcIdx] + rzs[srcIdx] * sh;
      const newWr = wrs[srcIdx] - sh;
      if (newWr < minWallRight) minWallRight = newWr;
    }

    // 4. Write binary v7 .ai buffer
    const outSize = 16 + M * 20 + 4 + M * 72 + 4;
    const out = Buffer.alloc(outSize);
    out.writeInt32LE(7, 0);
    out.writeInt32LE(M, 4);
    out.writeInt32LE(0, 8);
    out.writeInt32LE(0, 12);

    let cumDist = 0;
    for (let m = 0; m < M; m++) {
      if (m > 0) {
        cumDist += Math.hypot(px[m] - px[m - 1], py[m] - py[m - 1], pz[m] - pz[m - 1]);
      }
      const o = 16 + m * 20;
      out.writeFloatLE(px[m], o);
      out.writeFloatLE(py[m], o + 4);
      out.writeFloatLE(pz[m], o + 8);
      out.writeFloatLE(cumDist, o + 12);
      out.writeInt32LE(m, o + 16);
    }

    const outDetailCountOff = 16 + M * 20;
    out.writeInt32LE(M, outDetailCountOff);
    const outDetailOff = outDetailCountOff + 4;

    for (let m = 0; m < M; m++) {
      const srcIdx = s + 1 + m;
      const srcDoff = detailOff + srcIdx * 72;
      const dstDoff = outDetailOff + m * 72;
      buf.copy(out, dstDoff, srcDoff, srcDoff + 72);

      const sh = smoothShift[m];
      const newWl = wls[srcIdx] + sh;
      const newWr = Math.max(1.25, wrs[srcIdx] - sh);

      // Next point for exact tangent & step length
      const nx = m < M - 1 ? px[m + 1] : xs[e];
      const ny = m < M - 1 ? py[m + 1] : ys[e];
      const nz = m < M - 1 ? pz[m + 1] : zs[e];
      const ddx = nx - px[m];
      const ddy = ny - py[m];
      const ddz = nz - pz[m];
      const step = Math.hypot(ddx, ddy, ddz) || 1;

      out.writeFloatLE(newWl, dstDoff + 5 * 4);
      out.writeFloatLE(newWr, dstDoff + 6 * 4);
      out.writeFloatLE(step, dstDoff + 12 * 4);
      out.writeFloatLE(ddx / step, dstDoff + 13 * 4);
      out.writeFloatLE(ddy / step, dstDoff + 14 * 4);
      out.writeFloatLE(ddz / step, dstDoff + 15 * 4);
      out.writeFloatLE(ddy / step, dstDoff + 17 * 4);
    }

    // Trailing hasGrid = 0
    out.writeInt32LE(0, outDetailOff + M * 72);

    // Continuity checks against main fast_lane.ai
    const entryGap = Math.hypot(px[0] - xs[s], py[0] - ys[s], pz[0] - zs[s]);
    const exitGap = Math.hypot(xs[e] - px[M - 1], ys[e] - py[M - 1], zs[e] - pz[M - 1]);

    // Check cruising-section clearance against all non-local splines
    let minOtherDist = Infinity;
    for (let m = RAMP_POINTS; m < M - RAMP_POINTS; m += 3) {
      const srcIdx = s + 1 + m;
      const cx = Math.floor(px[m] / cellSize);
      const cz = Math.floor(pz[m] / cellSize);
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          const arr = grid.get(`${cx + dx},${cz + dz}`);
          if (!arr) continue;
          for (const j of arr) {
            if (Math.abs(j - srcIdx) < 25) continue;
            if (Math.abs(ys[j] - py[m]) > 2.5) continue;
            const d = Math.hypot(xs[j] - px[m], zs[j] - pz[m]);
            if (d < minOtherDist) minOtherDist = d;
            if (d < 2.0) maxLateralConflict++;
          }
        }
      }
    }

    generatedSplines.push({
      name,
      startOnMain: s,
      endOnMain: e,
      points: M,
      lengthKm: +(cumDist / 1000).toFixed(2),
      maxShift: +maxShift.toFixed(2),
      minWallRight: +minWallRight.toFixed(2),
      entryGap: +entryGap.toFixed(2),
      exitGap: +exitGap.toFixed(2),
      minOtherSplineDist: minOtherDist === Infinity ? null : +minOtherDist.toFixed(2),
      conflictsLt2m: maxLateralConflict,
      buffer: out,
    });
  }

  // Build AssettoServer config.yml
  const yamlLines = [
    `Track: ${trackId}`,
    `Author: AC-Panel Right-Lane Generator`,
    `Version: 1`,
    ``,
    `Splines:`,
    `  - Name: fast_lane.ai`,
    `    Junctions:`,
  ];

  for (const sp of generatedSplines) {
    yamlLines.push(
      `      - Name: ${sp.name.replace('.ai', '')} entry`,
      `        Start: ${sp.startOnMain}`,
      `        End: ${sp.name}@0`,
      `        Probability: 0.45`,
      `        IndicateWhenTaken: Right`,
      `        IndicateDistancePre: 75`,
      `        IndicateDistancePost: 50`
    );
  }

  for (const sp of generatedSplines) {
    yamlLines.push(
      ``,
      `  - Name: ${sp.name}`,
      `    ConnectEnd: fast_lane.ai@${sp.endOnMain}`,
      `    IndicateEnd: Left`,
      `    IndicateEndDistancePre: 100`,
      `    IndicateEndDistancePost: 25`
    );
  }

  const configYml = yamlLines.join('\n') + '\n';

  // Package into fast_lane.aip (standard ZIP archive)
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const outStream = fs.createWriteStream(outputPath);
  const archive = archiver('zip', { zlib: { level: 6 } });

  outStream.on('close', () => {
    const sizeMb = (archive.pointer() / 1024 / 1024).toFixed(2);
    console.log('\n=== Generated Right-Lane AI Package ===');
    console.log(`Output: ${outputPath} (${sizeMb} MB)`);
    console.table(
      generatedSplines.map(({ buffer: _b, ...meta }) => meta)
    );
    const totalKm = generatedSplines.reduce((acc, s) => acc + s.lengthKm, 0);
    console.log(`Total added rightmost-lane highway length: ${totalKm.toFixed(2)} km across ${generatedSplines.length} corridors.`);
  });

  archive.on('error', (err) => {
    throw err;
  });

  archive.pipe(outStream);
  archive.append(configYml, { name: 'config.yml' });
  archive.append(mainOptimized, { name: 'fast_lane.ai' });
  for (const sp of generatedSplines) {
    archive.append(sp.buffer, { name: sp.name });
  }
  archive.finalize();
}

main();
