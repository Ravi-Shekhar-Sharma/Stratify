import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'motion/react';

interface Point3 {
  x: number;
  y: number;
  z: number;
}

const ROTATION_PERIOD_S = 55;
const SWEEP_PERIOD_S = 8;
const SWEEP_BAND = 0.1;
const PARALLAX_STRENGTH = 0.06;

/**
 * A generic, unbranded mid-engine performance-car silhouette — deliberately
 * built to the proportions that carry that identity, not approximated:
 * ~4:1 length-to-height (roof peak tops out at 0.455 against a 2.0-unit
 * length, i.e. z -1..1), a short front overhang into a hood that's already
 * yielding to the windscreen by z=0.46 (cabin pushed forward), a long flat
 * rear deck from the roof's trailing edge (z=0.02) all the way to the tail
 * (z=-1, nearly half the car's length — the "mid-engine" tell), a shallow
 * windscreen rake spread over z=0.46..0.20 rather than a steep step, a low
 * roofline that only holds flat for a sliver (z=0.02) before tapering into
 * the deck, and a subtle ducktail lip at the very tail (the dip at -0.97
 * then the kick back up at -1.0) instead of a wing. Values are z (front +1
 * to rear -1) / y (ground 0 to roof).
 */
const PROFILE: Array<[number, number]> = [
  [-1.0, 0.19],
  [-0.97, 0.17],
  [-0.9, 0.2],
  [-0.82, 0.23],
  [-0.66, 0.28],
  [-0.5, 0.31],
  [-0.32, 0.36],
  [-0.14, 0.42],
  [0.02, 0.46],
  [0.2, 0.455],
  [0.32, 0.4],
  [0.46, 0.3],
  [0.58, 0.2],
  [0.72, 0.15],
  [0.88, 0.1],
  [1.0, 0.07],
];

/**
 * Track width by station, not a constant half-width — this is what makes
 * the rear haunches read as haunches rather than a flat-sided box: the
 * body is widest just ahead of the rear wheel (-0.55) and tucks in through
 * a narrow waist at the cabin (0.0) before flaring again over the front
 * wheel (0.4). A single constant HALF_WIDTH (the previous version's
 * approach) cannot produce this — width has to vary by station just like
 * height does.
 */
const WIDTH_PROFILE: Array<[number, number]> = [
  [-1.0, 0.34],
  [-0.82, 0.44],
  [-0.66, 0.5],
  [-0.55, 0.53],
  [-0.4, 0.5],
  [-0.2, 0.44],
  [0.0, 0.4],
  [0.2, 0.41],
  [0.4, 0.44],
  [0.55, 0.45],
  [0.72, 0.4],
  [0.88, 0.34],
  [1.0, 0.28],
];

/**
 * The rocker sill — the bottom edge of the body, running the full length.
 * PROFILE alone is only the TOP half of the silhouette; the previous
 * version connected its two ends straight down to a flat y=0 floor, which
 * is why the body read as a handful of disconnected lines rather than one
 * closed shape. Sill height stays low and nearly flat (a real rocker
 * doesn't undulate much) — the front/rear kick is where it meets PROFILE's
 * own end points to close the loop, not a feature of the sill itself.
 */
const SILL_PROFILE: Array<[number, number]> = [
  [-1.0, 0.07],
  [-0.5, 0.05],
  [0.0, 0.045],
  [0.5, 0.05],
  [0.85, 0.06],
  [1.0, 0.05],
];

// Cross-section stations — where a real body-in-white drawing would slice
// the car to show its section. Placed at meaningful landmarks: rear, rear
// wheel/haunch peak, mid-cabin (roof peak), front wheel, front.
const SECTION_Z = [-0.9, -0.55, 0.1, 0.46, 0.85];

function interp(table: Array<[number, number]>, z: number): number {
  for (let i = 0; i < table.length - 1; i++) {
    const [z0, y0] = table[i];
    const [z1, y1] = table[i + 1];
    if (z >= z0 && z <= z1) {
      const t = (z - z0) / (z1 - z0);
      return y0 + (y1 - y0) * t;
    }
  }
  return table[table.length - 1][1];
}

function profileYAt(z: number): number {
  return interp(PROFILE, z);
}

function sillYAt(z: number): number {
  return interp(SILL_PROFILE, z);
}

function widthAt(z: number): number {
  return interp(WIDTH_PROFILE, z);
}

/** A closed loop (any number of points) as a chain of edges at one weight. */
function pushLoop(
  push: (x: number, y: number, z: number) => number,
  edges: Edge[],
  pts: Array<[number, number, number]>,
  weight: Edge['weight'],
  closed = true,
) {
  const idx = pts.map(([x, y, z]) => push(x, y, z));
  for (let i = 0; i < idx.length - 1; i++) edges.push({ a: idx[i], b: idx[i + 1], weight });
  if (closed) edges.push({ a: idx[idx.length - 1], b: idx[0], weight });
  return idx;
}

interface Edge {
  a: number;
  b: number;
  weight: 'primary' | 'secondary' | 'construction';
}

const WHEEL_Z = { rear: -0.55, front: 0.46 };
// ~30% smaller than the previous 0.2 — the old radius made the wheels
// taller than the body itself and broke the silhouette; this is the
// single biggest reason a car wireframe stops reading as a car.
const WHEEL_R = 0.14;
const WHEEL_SEGMENTS = 48; // true circle at any rotation, no facets

function buildCage(): { points: Point3[]; edges: Edge[] } {
  const points: Point3[] = [];
  const edges: Edge[] = [];
  const push = (x: number, y: number, z: number) => (points.push({ x, y, z }), points.length - 1);

  // THE closed body silhouette — the single most important line in the
  // drawing, heaviest weight, and it never breaks: nose bottom, up over
  // the bonnet, through the screen, across the roof, down the rear screen
  // onto the deck, over the tail, down to the sill, back along the sill,
  // and up to the nose bottom again, closing the loop. One continuous
  // outline per side, not a top curve and a set of disconnected verticals
  // the way the previous version drew it.
  for (const side of [-1, 1]) {
    const loopPts: Array<[number, number, number]> = [];
    // nose -> tail, over the top (PROFILE is stored tail-to-nose, so walk it backwards)
    for (let i = PROFILE.length - 1; i >= 0; i--) {
      const [z, y] = PROFILE[i];
      loopPts.push([side * widthAt(z), y, z]);
    }
    // tail -> nose, along the sill (SILL_PROFILE is already tail-to-nose)
    for (const [z, y] of SILL_PROFILE) {
      loopPts.push([side * widthAt(z), y, z]);
    }
    pushLoop(push, edges, loopPts, 'primary', true);
  }

  // front and rear faces — close the two ends across the width (bumper /
  // splitter face, diffuser face), same primary weight as the body outline.
  const noseTopL = push(-widthAt(1.0), profileYAt(1.0), 1.0);
  const noseTopR = push(widthAt(1.0), profileYAt(1.0), 1.0);
  const noseBotL = push(-widthAt(1.0), sillYAt(1.0), 1.0);
  const noseBotR = push(widthAt(1.0), sillYAt(1.0), 1.0);
  edges.push({ a: noseTopL, b: noseTopR, weight: 'primary' });
  edges.push({ a: noseBotL, b: noseBotR, weight: 'primary' });
  const tailTopL = push(-widthAt(-1.0), profileYAt(-1.0), -1.0);
  const tailTopR = push(widthAt(-1.0), profileYAt(-1.0), -1.0);
  const tailBotL = push(-widthAt(-1.0), sillYAt(-1.0), -1.0);
  const tailBotR = push(widthAt(-1.0), sillYAt(-1.0), -1.0);
  edges.push({ a: tailTopL, b: tailTopR, weight: 'primary' });
  edges.push({ a: tailBotL, b: tailBotR, weight: 'primary' });

  // cross-section ribs — secondary weight, the "this was drafted" signal
  for (const z of SECTION_Z) {
    const yTop = profileYAt(z);
    const halfW = widthAt(z);
    const nTop = 8;
    const ring: number[] = [];
    for (let i = 0; i <= nTop; i++) {
      const t = i / nTop; // 0 = left rail, 1 = right rail, arcing over the roof
      const x = -halfW + t * halfW * 2;
      const y = yTop * (0.3 + 0.7 * Math.sin(t * Math.PI));
      ring.push(push(x, y, z));
    }
    for (let i = 0; i < ring.length - 1; i++) edges.push({ a: ring[i], b: ring[i + 1], weight: 'secondary' });
    // vertical tick from floor to section
    const floorPt = push(0, 0, z);
    edges.push({ a: floorPt, b: ring[Math.floor(ring.length / 2)], weight: 'construction' });
  }

  // waist line + centerline — construction weight, blueprint convention
  const waistZ = [-1.0, 1.0].map((z) => push(-widthAt(z) * 1.02, profileYAt(z) * 0.4, z));
  edges.push({ a: waistZ[0], b: waistZ[1], weight: 'construction' });
  const centerZ = [-1.0, 1.0].map((z) => push(0, 0.02, z));
  edges.push({ a: centerZ[0], b: centerZ[1], weight: 'construction' });

  for (const side of [-1, 1]) {
    // side air intake, ahead of the rear wheel — secondary, a drafted quad,
    // not a literal vent pattern (no brand/model detail).
    const intakeZFront = -0.12;
    const intakeZRear = -0.34;
    pushLoop(
      push,
      edges,
      [
        [side * widthAt(intakeZFront), 0.2, intakeZFront],
        [side * widthAt(intakeZFront), 0.1, intakeZFront],
        [side * widthAt(intakeZRear), 0.08, intakeZRear],
        [side * widthAt(intakeZRear), 0.17, intakeZRear],
      ],
      'secondary',
    );

    // side window glass + A/B/C pillars — inset from the roofline, the
    // detail that reads as "cabin" rather than a blank flank. The loop's
    // own front and rear edges ARE the A- and C-pillars; B-pillar is
    // added as one extra strut through the middle of the glass.
    const beltFront: [number, number] = [0.34, 0.3];
    const roofFront: [number, number] = [0.2, 0.42];
    const roofMid: [number, number] = [0.02, 0.415];
    const roofAft: [number, number] = [-0.1, 0.4];
    const beltAft: [number, number] = [-0.22, 0.32];
    const beltMid: [number, number] = [0.05, 0.305];
    const windowLoop = pushLoop(
      push,
      edges,
      [
        [side * widthAt(beltFront[0]), beltFront[1], beltFront[0]],
        [side * widthAt(roofFront[0]), roofFront[1], roofFront[0]],
        [side * widthAt(roofMid[0]), roofMid[1], roofMid[0]],
        [side * widthAt(roofAft[0]), roofAft[1], roofAft[0]],
        [side * widthAt(beltAft[0]), beltAft[1], beltAft[0]],
        [side * widthAt(beltMid[0]), beltMid[1], beltMid[0]],
      ],
      'secondary',
    );
    // B-pillar: beltline-mid up to roughly the roof height above it
    const bPillarTop = push(side * widthAt(beltMid[0]), roofMid[1], beltMid[0]);
    edges.push({ a: windowLoop[5], b: bPillarTop, weight: 'secondary' });

    // shoulder / beltline crease — runs the length of the flank, just
    // below the window line, independent of the window outline itself
    const beltCreaseZ = [0.4, 0.15, -0.1, -0.4, -0.65];
    const beltCrease = beltCreaseZ.map((z) => push(side * widthAt(z) * 0.995, profileYAt(z) * 0.62, z));
    for (let i = 0; i < beltCrease.length - 1; i++) {
      edges.push({ a: beltCrease[i], b: beltCrease[i + 1], weight: 'secondary' });
    }

    // door cut line + handle
    const doorZ = -0.02;
    const doorTop = push(side * widthAt(doorZ), beltMid[1], doorZ);
    const doorBottom = push(side * widthAt(doorZ), sillYAt(doorZ), doorZ);
    edges.push({ a: doorTop, b: doorBottom, weight: 'secondary' });
    const handleA = push(side * widthAt(doorZ + 0.07), 0.2, doorZ + 0.07);
    const handleB = push(side * widthAt(doorZ - 0.06), 0.2, doorZ - 0.06);
    edges.push({ a: handleA, b: handleB, weight: 'construction' });

    // bonnet shut line (hood/fender seam) and rear deck shut line
    // (decklid/quarter seam) — simple single cross-ticks, construction
    // weight so they read as seams, not structure.
    for (const z of [0.75, -0.18]) {
      const y = profileYAt(z);
      const a = push(side * widthAt(z) * 0.2, y * 0.55, z);
      const b = push(side * widthAt(z), y, z);
      edges.push({ a, b, weight: 'construction' });
    }

    // headlight / tail light apertures — simple outline ellipses, never
    // more than an outline (no brand-identifying lens graphic)
    for (const [z, yc] of [
      [0.88, 0.13],
      [-0.9, 0.15],
    ] as const) {
      const lightPts: Array<[number, number, number]> = [];
      const n = 8;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        lightPts.push([side * widthAt(z) * 0.97, yc + 0.045 * Math.sin(a), z + 0.05 * Math.cos(a)]);
      }
      pushLoop(push, edges, lightPts, 'construction');
    }

    // door mirror — a small triangle standing proud of the body surface,
    // near the base of the A-pillar
    const mirrorZ = beltFront[0] - 0.02;
    const mirrorBase = widthAt(mirrorZ);
    const mA = push(side * mirrorBase, beltFront[1] + 0.02, mirrorZ);
    const mB = push(side * (mirrorBase + 0.07), beltFront[1] - 0.01, mirrorZ - 0.015);
    const mC = push(side * (mirrorBase + 0.07), beltFront[1] + 0.05, mirrorZ + 0.01);
    edges.push({ a: mA, b: mB, weight: 'construction' });
    edges.push({ a: mB, b: mC, weight: 'construction' });
    edges.push({ a: mC, b: mA, weight: 'construction' });
  }

  // front splitter / rear diffuser edges — short lips protruding beyond
  // the sill at each end, construction weight
  for (const z of [1.0, -1.0]) {
    const y = sillYAt(z);
    const a = push(-widthAt(z) * 1.08, y, z);
    const b = push(widthAt(z) * 1.08, y, z);
    edges.push({ a, b, weight: 'construction' });
  }

  // wheels — true circles (48 segments, no visible facets at any
  // rotation), tucked below the beltline inside a drafted arch with a
  // small even gap, plus a concentric inner rim so they read as wheels.
  for (const wz of [WHEEL_Z.rear, WHEEL_Z.front]) {
    const halfW = widthAt(wz);
    for (const side of [-1, 1]) {
      const start = points.length;
      for (let i = 0; i < WHEEL_SEGMENTS; i++) {
        const a = (i / WHEEL_SEGMENTS) * Math.PI * 2;
        push(side * halfW, WHEEL_R + WHEEL_R * Math.sin(a), wz + WHEEL_R * Math.cos(a));
        edges.push({ a: start + i, b: start + ((i + 1) % WHEEL_SEGMENTS), weight: 'primary' });
      }
      // concentric inner rim, secondary weight
      const rimR = WHEEL_R * 0.52;
      const rimStart = points.length;
      const rimN = 32;
      for (let i = 0; i < rimN; i++) {
        const a = (i / rimN) * Math.PI * 2;
        push(side * halfW, WHEEL_R + rimR * Math.sin(a), wz + rimR * Math.cos(a));
        edges.push({ a: rimStart + i, b: rimStart + ((i + 1) % rimN), weight: 'secondary' });
      }
      // spoke cross, construction
      const hub = push(side * halfW, WHEEL_R, wz);
      edges.push({ a: start, b: hub, weight: 'construction' });
      edges.push({ a: start + Math.floor(WHEEL_SEGMENTS / 2), b: hub, weight: 'construction' });
      edges.push({ a: start + Math.floor(WHEEL_SEGMENTS / 4), b: hub, weight: 'construction' });
      edges.push({ a: start + Math.floor((WHEEL_SEGMENTS * 3) / 4), b: hub, weight: 'construction' });

      // wheel arch — a drafted hump sitting on the sill, peaking just
      // above the tyre with a small, even gap; wider than the tyre
      // diameter so the tyre visibly tucks inside it rather than
      // touching its edges.
      const archHalfSpan = WHEEL_R * 1.35;
      const archPeakY = WHEEL_R * 2 + 0.028;
      const archN = 10;
      const archPts: Array<[number, number, number]> = [];
      for (let i = 0; i <= archN; i++) {
        const t = i / archN;
        const z = wz - archHalfSpan + t * archHalfSpan * 2;
        const y = sillYAt(z) + (archPeakY - sillYAt(z)) * Math.sin(t * Math.PI);
        archPts.push([side * halfW, y, z]);
      }
      pushLoop(push, edges, archPts, 'secondary', false);
    }
  }

  return { points, edges };
}

const CAGE = buildCage();
const WEIGHT_ALPHA: Record<Edge['weight'], number> = { primary: 0.85, secondary: 0.5, construction: 0.3 };
const WEIGHT_WIDTH: Record<Edge['weight'], number> = { primary: 1.4, secondary: 1, construction: 0.75 };

/**
 * Stratify's signature identity element — the equivalent of Mars slowly
 * revolving behind spacex.com. A body-in-white blueprint of the car the
 * line assembles — a generic mid-engine performance-car silhouette,
 * deliberately unbranded: no badge, grille pattern, or manufacturer-
 * specific detail anywhere in the geometry, only the proportion and stance
 * (low, wide, cab-forward, long rear deck) that reads as that class of car
 * from the silhouette alone. Primary contour lines, cross-section ribs at
 * meaningful stations, and construction/reference lines (a waist line, a
 * centerline, wheel spokes) — the visual grammar of a technical drawing,
 * not abstract geometry. A literal scan line sweeps down it, briefly
 * brightening the segment it crosses; a slow three-quarter rotation and a
 * scroll-linked parallax offset give it depth. The meaning: the rotating
 * car is the product the line assembles; the sweep is Stratify perceiving
 * the whole vehicle, including the stations no sensor can see. Hand-rolled
 * canvas —
 * this shape does not need a scene graph.
 */
export function HeroWireframe() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let stopped = false;
    let scrollY = window.scrollY;
    const onScroll = () => {
      scrollY = window.scrollY;
    };
    window.addEventListener('scroll', onScroll, { passive: true });

    function resize() {
      const parent = canvas!.parentElement;
      if (!parent) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = parent.getBoundingClientRect();
      canvas!.width = rect.width * dpr;
      canvas!.height = rect.height * dpr;
      canvas!.style.width = `${rect.width}px`;
      canvas!.style.height = `${rect.height}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);

    function draw(tMs: number) {
      const w = canvas!.clientWidth;
      const h = canvas!.clientHeight;
      ctx!.clearRect(0, 0, w, h);

      const tSec = tMs / 1000;
      // This rig's rotation is around the car's vertical axis with the
      // camera fixed on Z, so angle 0 reads nearly front/rear-on (width
      // dominates) and the silhouette only opens up into a readable profile
      // as the angle approaches a true side view (90deg). The previous
      // shape's rounder proportions tolerated a shallow ~32deg freeze frame;
      // this one's low wedge and long rear deck do not read at that angle —
      // verified by rendering the exact same projection standalone at
      // several angles — so reduced-motion now freezes at 75deg: close
      // enough to a true side view to read the wedge/haunches/ducktail
      // instantly, with just enough rotation left to still look dimensional
      // rather than a flat elevation drawing.
      const angle = reduceMotion ? (75 * Math.PI) / 180 : (tSec / ROTATION_PERIOD_S) * Math.PI * 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const scale = Math.min(w, h * 0.72) * 0.46;
      const cx = w * 0.68;
      const parallax = reduceMotion ? 0 : Math.min(60, scrollY * PARALLAX_STRENGTH);
      const cy = h * 0.56 - parallax;
      const camZ = 2.7;

      const sweepPhase = reduceMotion ? -1 : (tSec % SWEEP_PERIOD_S) / SWEEP_PERIOD_S;

      const projected = CAGE.points.map((p) => {
        const rx = p.x * cos + p.z * sin;
        const rz = -p.x * sin + p.z * cos;
        const persp = camZ / (camZ - rz);
        return { x: cx + rx * scale * persp, y: cy - p.y * scale * persp * 1.08, z: rz };
      });

      const bandTop = cy - scale;
      const bandH = scale * 2;

      for (const { a, b, weight } of CAGE.edges) {
        const pa = projected[a];
        const pb = projected[b];
        let alpha = WEIGHT_ALPHA[weight];
        let stroke = 'rgba(255,255,255,';
        if (sweepPhase >= 0) {
          const midY = (pa.y + pb.y) / 2;
          const normY = (midY - bandTop) / bandH;
          const dist = Math.abs(normY - sweepPhase);
          if (dist < SWEEP_BAND) {
            const boost = 1 - dist / SWEEP_BAND;
            alpha = Math.min(1, alpha + boost * 0.5);
            const cyanMix = boost;
            stroke = `rgba(${Math.round(255 - (255 - 34) * cyanMix)},${Math.round(255 - (255 - 211) * cyanMix)},${Math.round(255 - (255 - 238) * cyanMix)},`;
          }
        }
        ctx!.strokeStyle = `${stroke}${alpha})`;
        ctx!.lineWidth = WEIGHT_WIDTH[weight];
        ctx!.beginPath();
        ctx!.moveTo(pa.x, pa.y);
        ctx!.lineTo(pb.x, pb.y);
        ctx!.stroke();
      }

      // the literal scan line itself, plus a soft glow band
      if (sweepPhase >= 0) {
        const scanY = bandTop + sweepPhase * bandH;
        const grad = ctx!.createLinearGradient(cx - scale * 1.3, 0, cx + scale * 1.3, 0);
        grad.addColorStop(0, 'rgba(34,211,238,0)');
        grad.addColorStop(0.5, 'rgba(34,211,238,0.9)');
        grad.addColorStop(1, 'rgba(34,211,238,0)');
        ctx!.strokeStyle = grad;
        ctx!.lineWidth = 1.5;
        ctx!.beginPath();
        ctx!.moveTo(cx - scale * 1.3, scanY);
        ctx!.lineTo(cx + scale * 1.3, scanY);
        ctx!.stroke();
      }

      // corner registration marks — a cheap, unmistakable "this is a
      // technical drawing" signal, blueprint convention
      const bx0 = cx - scale * 1.15;
      const bx1 = cx + scale * 1.15;
      const by0 = cy - scale * 0.95;
      const by1 = cy + scale * 0.55;
      const tick = 14;
      ctx!.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx!.lineWidth = 1;
      for (const [cxs, cys, dx, dy] of [
        [bx0, by0, 1, 0],
        [bx0, by0, 0, 1],
        [bx1, by0, -1, 0],
        [bx1, by0, 0, 1],
        [bx0, by1, 1, 0],
        [bx0, by1, 0, -1],
        [bx1, by1, -1, 0],
        [bx1, by1, 0, -1],
      ] as const) {
        ctx!.beginPath();
        ctx!.moveTo(cxs, cys);
        ctx!.lineTo(cxs + dx * tick, cys + dy * tick);
        ctx!.stroke();
      }

      if (!stopped && !reduceMotion) raf = requestAnimationFrame(draw);
    }

    raf = requestAnimationFrame(draw);
    if (reduceMotion) {
      draw(0);
      stopped = true;
    }

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('scroll', onScroll);
    };
  }, [reduceMotion]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-[0.17]" aria-hidden="true">
      <canvas ref={canvasRef} className="h-full w-full" />
    </div>
  );
}
