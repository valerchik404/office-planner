import * as THREE from 'three';

/** Процедурные текстуры: рисуем на canvas, без внешних файлов. */

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')!];
}

function speckle(ctx: CanvasRenderingContext2D, size: number, count: number, alpha: number) {
  for (let i = 0; i < count; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = Math.random() * 1.8 + 0.2;
    const v = Math.random() < 0.5 ? 0 : 255;
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

let floorTex: THREE.Texture | null = null;
let floorRough: THREE.Texture | null = null;
let wallTex: THREE.Texture | null = null;
let wallRough: THREE.Texture | null = null;

/** Пол: светлая плитка 1×1 м со швами и мелким зерном. */
export function getFloorTexture(): THREE.Texture {
  if (floorTex) return floorTex;
  const S = 256;
  const [c, ctx] = makeCanvas(S);
  ctx.fillStyle = '#cfc7b4';
  ctx.fillRect(0, 0, S, S);
  // лёгкие разводы
  for (let i = 0; i < 40; i++) {
    const g = ctx.createRadialGradient(
      Math.random() * S, Math.random() * S, 2,
      Math.random() * S, Math.random() * S, 40 + Math.random() * 60,
    );
    g.addColorStop(0, 'rgba(255,255,255,0.05)');
    g.addColorStop(1, 'rgba(160,150,130,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, S, S);
  }
  speckle(ctx, S, 900, 0.05);
  // шов плитки по краю
  ctx.strokeStyle = 'rgba(120,112,96,0.55)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, S - 2, S - 2);
  floorTex = new THREE.CanvasTexture(c);
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.colorSpace = THREE.SRGBColorSpace;
  floorTex.anisotropy = 8;
  return floorTex;
}

export function getFloorRoughness(): THREE.Texture {
  if (floorRough) return floorRough;
  const S = 256;
  const [c, ctx] = makeCanvas(S);
  ctx.fillStyle = '#b0b0b0';
  ctx.fillRect(0, 0, S, S);
  speckle(ctx, S, 2500, 0.12);
  floorRough = new THREE.CanvasTexture(c);
  floorRough.wrapS = floorRough.wrapT = THREE.RepeatWrapping;
  return floorRough;
}

/** Стена: матовая штукатурка с еле заметным зерном. */
export function getWallTexture(): THREE.Texture {
  if (wallTex) return wallTex;
  const S = 256;
  const [c, ctx] = makeCanvas(S);
  ctx.fillStyle = '#eceae4';
  ctx.fillRect(0, 0, S, S);
  speckle(ctx, S, 1800, 0.035);
  wallTex = new THREE.CanvasTexture(c);
  wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping;
  wallTex.colorSpace = THREE.SRGBColorSpace;
  wallTex.anisotropy = 4;
  return wallTex;
}

export function getWallRoughness(): THREE.Texture {
  if (wallRough) return wallRough;
  const S = 256;
  const [c, ctx] = makeCanvas(S);
  ctx.fillStyle = '#d8d8d8';
  ctx.fillRect(0, 0, S, S);
  speckle(ctx, S, 3000, 0.1);
  wallRough = new THREE.CanvasTexture(c);
  wallRough.wrapS = wallRough.wrapT = THREE.RepeatWrapping;
  return wallRough;
}

/** Копия текстуры с нужным числом повторов (одна текстура — один масштаб). */
export function repeated(tex: THREE.Texture, rx: number, ry: number): THREE.Texture {
  const t = tex.clone();
  t.needsUpdate = true;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(Math.max(0.1, rx), Math.max(0.1, ry));
  return t;
}
