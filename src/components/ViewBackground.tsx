import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'motion/react';

export type BackgroundVariant = 'pipeline' | 'trust' | 'plant' | 'invest';

/**
 * The full-bleed, per-tab ambient background Floor's HeroWireframe
 * established the family for: monochrome, non-interactive, always behind
 * content, frozen under prefers-reduced-motion. Never the car — each tab
 * gets a pattern that suits its own subject (signal traces for Pipeline, a
 * calibration/plotted-data field for Trust, a multi-line shop-floor plan for
 * Plant, a schedule lattice for Invest), sharing one canvas engine so the
 * four read as a family. Deliberately quieter than HeroWireframe — that is
 * the product's one flagship identity element, this is ambiance — but not
 * so faint it reads as bare black: opacity and the edge mask are tuned so
 * the pattern is genuinely visible everywhere it isn't covered by a panel,
 * corner to corner, while never approaching the contrast of real text.
 *
 * A previous pass added a hard 460px "keep clear" band at the top to stop
 * Plant/Invest's old blocky rectangles from visually colliding with the
 * hero. That fixed the collision but overcorrected into a large bare-black
 * region (most visible top-right, since Trust's old motif lived entirely in
 * that corner) — reported as its own bug. The real fix is upstream of any
 * masking: every drawer below is built to span the *entire* canvas on its
 * own (no single-corner compositions), and the individual shapes stay soft
 * (thin strokes, low alpha, rounded corners) so low-opacity ambient content
 * directly behind hero text reads as texture, not as a competing element.
 */
export function ViewBackground({ variant }: { variant: BackgroundVariant }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let stopped = false;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas!.width = w * dpr;
      canvas!.height = h * dpr;
      canvas!.style.width = `${w}px`;
      canvas!.style.height = `${h}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    resize();
    window.addEventListener('resize', resize);

    const draw = DRAWERS[variant];

    function frame(tMs: number) {
      const w = canvas!.clientWidth;
      const h = canvas!.clientHeight;
      ctx!.clearRect(0, 0, w, h);
      draw(ctx!, w, h, reduceMotion ? 0 : tMs / 1000);
      if (!stopped && !reduceMotion) raf = requestAnimationFrame(frame);
    }

    // Every variant now carries continuous, gentle motion (all four
    // drawers read their `t` argument) - only one of these canvases is
    // ever mounted at a time (App.tsx swaps ViewBackground per active
    // tab), so keeping the rAF loop running for all of them costs no more
    // than the single active tab already did.
    raf = requestAnimationFrame(frame);
    if (reduceMotion) {
      frame(0);
      stopped = true;
    }

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [variant, reduceMotion]);

  // MUST be mounted by App.tsx as an early sibling of <TopNav>/<main>, never
  // nested inside a per-view component (which lives inside App's animated
  // view-transition wrapper). That wrapper is a Framer Motion element
  // animating `y`, which sets an inline `transform` on it even at rest
  // (matrix(1,0,0,1,0,y)) — and per the CSS spec, any transformed ancestor
  // becomes the containing block for `position: fixed` descendants,
  // silently turning "fixed" into page-relative positioning. Mounting here
  // (outside that transform) keeps `fixed` truly viewport-relative at any
  // scroll position, and DOM order alone (rendered before the view content)
  // puts it behind that content within the shared root stacking context —
  // no z-index tricks needed, and critically no negative z-index, which
  // would sink it below the app's own opaque page background instead of
  // just below its foreground.
  return (
    <div
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden opacity-[0.075]"
      style={{
        // An explicit "100% 100%" ellipse size is a radius equal to the
        // FULL box width/height, not a radius that reaches the edge — the
        // farthest corner of a full-viewport box only ever reaches ~70.7%
        // of that radius, short of the old 75% stop where fading began.
        // The result was a mask that never faded anything at all, on any
        // variant: not a bug specific to one tab, just never doing what its
        // own comment claimed. `farthest-corner` (the default ending-shape
        // sizing when no explicit size is given) is the correct keyword for
        // "the gradient's 100% stop lands exactly on the farthest corner" —
        // edges (closer than corners) fade partially, corners fade fully,
        // the centre and most of the viewport stay opaque. A real vignette.
        maskImage: 'radial-gradient(ellipse farthest-corner at 50% 50%, #000 0%, #000 58%, transparent 100%)',
        WebkitMaskImage: 'radial-gradient(ellipse farthest-corner at 50% 50%, #000 0%, #000 58%, transparent 100%)',
      }}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="h-full w-full" />
    </div>
  );
}

type Drawer = (ctx: CanvasRenderingContext2D, w: number, h: number, tSec: number) => void;

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pipeline — flowing signal traces: horizontal oscilloscope-style lines
 *  drifting left to right at different phases and amplitudes, spread evenly
 *  across the full canvas height, the same "signal moving through the
 *  system" idea the rebuilt Pipeline view itself renders literally, echoed
 *  here at ambient scale. */
function drawPipeline(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const rows = 9;
  for (let i = 0; i < rows; i++) {
    const y = (h / (rows + 1)) * (i + 1);
    const amp = 14 + (i % 3) * 6;
    const freq = 0.006 + (i % 4) * 0.0015;
    const speed = 0.25 + (i % 3) * 0.12;
    // Ambient layer, deliberately faster than the foreground pipeline
    // beads (PipelineView.tsx's FlowConnector, ~4s per connector) — the
    // foreground must always read as the slower, more deliberate layer a
    // viewer can actually follow, with this reading as motion behind it.
    const phase = t * speed * 170 + i * 37;
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= w; x += 6) {
      const yy = y + Math.sin((x + phase) * freq) * amp;
      if (x === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
}

/** Trust — a full-bleed calibration/plotted-data field: an axis grid
 *  spanning the whole canvas, a corner-to-corner perfect-calibration
 *  reference diagonal, and a scatter of evidence points along it, echoing
 *  the calibration chart this tab leads with. A slow, gentle drift (not a
 *  flowing scroll like Pipeline's traces) keeps it from reading as a dead
 *  frame while staying calm enough for "a chart is evidence, not a live
 *  feed" — the whole field sways, nothing individually races. */
function drawTrust(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  ctx.save();
  // Reported as "still doesn't move": the first pass's drift (12px over a
  // ~70s cycle) was real motion but too small and slow to register within
  // a normal glance, especially layered under 7.5% opacity. This is
  // ~6x the amplitude at ~4x the angular speed - a full sway now takes
  // ~16s and covers real screen distance, unambiguously visible while
  // still reading as a slow sway rather than a race.
  ctx.translate(Math.sin(t * 0.38) * 70, Math.cos(t * 0.31) * 42);
  const padX = w * 0.06;
  const padY = h * 0.08;
  const left = padX;
  const right = w - padX;
  const top = padY;
  const bottom = h - padY;
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1;
  const gridN = 9;
  for (let i = 0; i <= gridN; i++) {
    const p = i / gridN;
    const y = top + p * (bottom - top);
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
    const x = left + p * (right - left);
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.moveTo(left, bottom);
  ctx.lineTo(right, top);
  ctx.stroke();
  // a deterministic scatter tracking the diagonal across the full field —
  // evidence points, not noise
  const rand = mulberry32(7);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  for (let i = 0; i < 46; i++) {
    const p = rand();
    const jitter = (rand() - 0.5) * (bottom - top) * 0.22;
    const x = left + p * (right - left);
    const y = bottom - p * (bottom - top) + jitter;
    ctx.beginPath();
    ctx.arc(x, y, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Plant — a multi-line shop-floor plan: three assembly-spine rows at
 *  different heights, each with bay markers, spanning the full canvas top
 *  to bottom rather than one single mid-height band, echoing the plant's
 *  several shops rather than one line. Each row drifts horizontally at its
 *  own slow speed - a gentle parallax rather than a uniform scroll, so the
 *  three lines read as independent rather than one image sliding. */
function drawPlant(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const marginX = w * 0.06;
  const spineYs = [h * 0.22, h * 0.52, h * 0.82];
  const bays = 12;
  const bayW = (w - marginX * 2) / bays;
  // Same fix as Trust/Invest below: these speeds were real but too slow
  // (a few px/sec) to read as motion rather than a static frame. ~6x
  // faster now - still a deliberate drift, not a race, but genuinely
  // visible within a couple of seconds of looking at it.
  const rowSpeed = [19, -14, 11];

  spineYs.forEach((spineY, rowIdx) => {
    ctx.save();
    ctx.translate(((t * rowSpeed[rowIdx]) % bayW) - bayW, 0);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(marginX - bayW, spineY);
    ctx.lineTo(w - marginX + bayW * 2, spineY);
    ctx.stroke();
    for (let i = -1; i <= bays + 1; i++) {
      const x = marginX + i * bayW;
      ctx.beginPath();
      ctx.moveTo(x, spineY - 20);
      ctx.lineTo(x, spineY + 20);
      ctx.stroke();
    }
    // Bay markers as dots, never boxes: an earlier pass used a stroked
    // roundRect here with only a 4px corner radius against a ~34px-tall
    // shape — visually indistinguishable from a sharp-cornered rectangle,
    // which is exactly what read as a "broken card" colliding with the
    // hero headline. Trust and Pipeline never draw a single fillable,
    // cornered shape (only thin lines and circles), which is the real
    // reason they never had this problem. A dot has no boundary to soften.
    const rand = mulberry32(11 + rowIdx * 97);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    for (let i = -1; i <= bays + 1; i++) {
      if (rand() < 0.55) continue;
      const x = marginX + i * bayW + bayW * 0.5;
      const up = i % 2 === 0;
      const by = up ? spineY - 20 - 12 : spineY + 20 + 12;
      ctx.beginPath();
      ctx.arc(x, by, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  });
}

/** Invest — a schedule lattice spanning nearly the full canvas: a
 *  calendar/gantt grid of rows and columns with a deterministic set of
 *  filled cells, echoing the maintenance-window schedule this tab actually
 *  renders. A slow diagonal sway keeps it from reading as a dead frame,
 *  the same restrained "field drifts, nothing individually races" register
 *  as Trust's motif. */
function drawInvest(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  ctx.save();
  // Same fix as Trust's drift above - amplitude and speed raised well
  // past the threshold where it reads as genuine motion, not a static frame.
  ctx.translate(Math.sin(t * 0.42) * 64, Math.cos(t * 0.34) * 46);
  const marginX = w * 0.06;
  const marginY = h * 0.08;
  const cols = 6;
  const rows = 9;
  const gw = (w - marginX * 2) / cols;
  const gh = (h - marginY * 2) / rows;
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1;
  for (let c = 0; c <= cols; c++) {
    const x = marginX + c * gw;
    ctx.beginPath();
    ctx.moveTo(x, marginY);
    ctx.lineTo(x, h - marginY);
    ctx.stroke();
  }
  for (let r = 0; r <= rows; r++) {
    const y = marginY + r * gh;
    ctx.beginPath();
    ctx.moveTo(marginX, y);
    ctx.lineTo(w - marginX, y);
    ctx.stroke();
  }
  // Filled cells as dots at each cell's centre, never a filled rectangle:
  // the previous roundRect fill (4px radius against a ~gw x gh cell, well
  // over 100px on a side) was visually a sharp-cornered box — the single
  // most "broken card"-looking shape this file could draw, and the top
  // rows of this grid sit inside the hero band. A dot carries the same
  // "this cell is scheduled" meaning with no boundary to read as UI.
  const rand = mulberry32(41);
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  const dotR = Math.min(gw, gh) * 0.12;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (rand() < 0.2) {
        const cx = marginX + c * gw + gw / 2;
        const cy = marginY + r * gh + gh / 2;
        ctx.beginPath();
        ctx.arc(cx, cy, dotR, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

const DRAWERS: Record<BackgroundVariant, Drawer> = {
  pipeline: drawPipeline,
  trust: drawTrust,
  plant: drawPlant,
  invest: drawInvest,
};
