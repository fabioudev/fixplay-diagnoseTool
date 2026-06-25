

// Canvas stick rendering utilities, ported from dualshock-tools/js/stick-renderer.js

export const CIRCULARITY_DATA_SIZE = 48;

export interface DrawStickOpts {
  circularity_data?: number[] | null;
  enable_zoom_center?: boolean;
  highlight?: boolean;
}

function applyCenterZoom(x: number, y: number): { x: number; y: number } {
  const distance = Math.sqrt(x * x + y * y);
  if (distance === 0) return { x, y };
  const angle = Math.atan2(y, x);
  const newDistance =
    distance <= 0.05 ? (distance / 0.05) * 0.5 : 0.5 + ((distance - 0.05) / 0.95) * 0.5;
  return { x: Math.cos(angle) * newDistance, y: Math.sin(angle) * newDistance };
}

function ccToColor(cc: number): number {
  const dd = Math.sqrt(Math.pow(1.0 - cc, 2));
  if (cc <= 1.0) return 220 - 220 * Math.min(1.0, Math.max(0, dd - 0.05) / 0.1);
  return (245 + (360 - 245) * Math.min(1.0, Math.max(0, dd - 0.05) / 0.15)) % 360;
}

export function calculateCircularityError(data: number[]): number {
  const sumSquaredDeviations = data.reduce((acc, val) => (val > 0.2 ? acc + Math.pow(val - 1, 2) : acc), 0);
  const validDataCount = data.filter((val) => val > 0.2).length;
  return validDataCount > 0 ? Math.sqrt(sumSquaredDeviations / validDataCount) * 100 : 0;
}

export function drawStickDial(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  sz: number,
  stickX: number,
  stickY: number,
  opts: DrawStickOpts = {}
): void {
  const { circularity_data = null, enable_zoom_center = false, highlight = false } = opts;

  // Base circle
  ctx.lineWidth = 1;
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#000000';
  ctx.beginPath();
  ctx.arc(centerX, centerY, sz, 0, 2 * Math.PI);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Circularity visualization
  if (circularity_data && circularity_data.length > 0) {
    const MAX_N = CIRCULARITY_DATA_SIZE;
    for (let i = 0; i < MAX_N; i++) {
      const kd = circularity_data[i];
      const kd1 = circularity_data[(i + 1) % CIRCULARITY_DATA_SIZE];
      if (kd === undefined || kd1 === undefined) continue;
      const ka = (i * Math.PI * 2) / MAX_N;
      const ka1 = (((i + 1) % MAX_N) * 2 * Math.PI) / MAX_N;
      const kx = Math.cos(ka) * kd;
      const ky = Math.sin(ka) * kd;
      const kx1 = Math.cos(ka1) * kd1;
      const ky1 = Math.sin(ka1) * kd1;

      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(centerX + kx * sz, centerY + ky * sz);
      ctx.lineTo(centerX + kx1 * sz, centerY + ky1 * sz);
      ctx.lineTo(centerX, centerY);
      ctx.closePath();

      const cc = (kd + kd1) / 2;
      const hh = ccToColor(cc);
      ctx.fillStyle = `hsla(${parseInt(String(hh))}, 100%, 50%, 0.5)`;
      ctx.fill();
    }
  }

  // Circularity error text
  if (circularity_data && circularity_data.filter((n) => n > 0.3).length > 10) {
    const circularityError = calculateCircularityError(circularity_data);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 3;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '24px Arial';
    const textY = centerY + sz * 0.5;
    const text = `${circularityError.toFixed(1)} %`;
    ctx.strokeText(text, centerX, textY);
    ctx.fillText(text, centerX, textY);
  }

  // Crosshairs
  ctx.strokeStyle = '#aaaaaa';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(centerX - sz, centerY);
  ctx.lineTo(centerX + sz, centerY);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(centerX, centerY - sz);
  ctx.lineTo(centerX, centerY + sz);
  ctx.closePath();
  ctx.stroke();

  // Center zoom
  let displayX = stickX;
  let displayY = stickY;
  if (enable_zoom_center) {
    const transformed = applyCenterZoom(stickX, stickY);
    displayX = transformed.x;
    displayY = transformed.y;
    ctx.strokeStyle = '#d3d3d3';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(centerX, centerY, sz * 0.5, 0, 2 * Math.PI);
    ctx.stroke();
  }

  ctx.fillStyle = '#000000';
  ctx.strokeStyle = '#000000';

  const stickDistance = Math.sqrt(displayX * displayX + displayY * displayY);
  const boundaryRadius = 0.5;
  const useTwoSegments = enable_zoom_center && stickDistance > boundaryRadius;

  if (useTwoSegments) {
    const boundaryX = (displayX / stickDistance) * boundaryRadius;
    const boundaryY = (displayY / stickDistance) * boundaryRadius;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(centerX + boundaryX * sz, centerY + boundaryY * sz);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(centerX + boundaryX * sz, centerY + boundaryY * sz);
    ctx.lineTo(centerX + displayX * sz, centerY + displayY * sz);
    ctx.stroke();
  } else {
    ctx.lineWidth = enable_zoom_center ? 3 : 1;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(centerX + displayX * sz, centerY + displayY * sz);
    ctx.stroke();
  }

  // Stick dot
  ctx.beginPath();
  ctx.arc(centerX + displayX * sz, centerY + displayY * sz, highlight ? 4 : 3, 0, 2 * Math.PI);
  ctx.fillStyle = highlight ? '#2989f7ff' : '#030b84ff';
  ctx.fill();
}

