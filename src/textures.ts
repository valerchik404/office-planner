import * as THREE from 'three';

/** Процедурные текстуры: рисуем на canvas, без внешних файлов.
 *  Все текстуры и их «повторы» кэшируются — клонировать на каждый кадр нельзя. */

const SIZE = 512;

function makeCanvas(size = SIZE): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')!];
}

function speckle(ctx: CanvasRenderingContext2D, size: number, count: number, alpha: number) {
  for (let i = 0; i < count; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = Math.random() * 2 + 0.3;
    const v = Math.random() < 0.5 ? 0 : 255;
    ctx.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function tex(c: HTMLCanvasElement, srgb: boolean): THREE.Texture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const cache = new Map<string, THREE.Texture>();

function build(key: string, make: () => THREE.Texture): THREE.Texture {
  const hit = cache.get(key);
  if (hit) return hit;
  const t = make();
  cache.set(key, t);
  return t;
}

/** Пол: плитка 60×60 см со швами, лёгкой разнотонностью и зерном. */
export function getFloorTexture(): THREE.Texture {
  return build('floor', () => {
    const [c, ctx] = makeCanvas();
    const tiles = 2; // 2×2 плитки на повтор → шов каждые полметра при repeat=1/м
    const step = SIZE / tiles;
    for (let ty = 0; ty < tiles; ty++) {
      for (let tx = 0; tx < tiles; tx++) {
        // каждая плитка чуть отличается по тону
        const shade = 202 + Math.round((Math.random() - 0.5) * 10);
        ctx.fillStyle = `rgb(${shade}, ${shade - 6}, ${shade - 20})`;
        ctx.fillRect(tx * step, ty * step, step, step);
        // мягкие разводы внутри плитки
        for (let i = 0; i < 6; i++) {
          const g = ctx.createRadialGradient(
            tx * step + Math.random() * step, ty * step + Math.random() * step, 2,
            tx * step + Math.random() * step, ty * step + Math.random() * step, step * 0.6,
          );
          g.addColorStop(0, 'rgba(255,255,255,0.06)');
          g.addColorStop(1, 'rgba(150,140,120,0)');
          ctx.fillStyle = g;
          ctx.fillRect(tx * step, ty * step, step, step);
        }
      }
    }
    speckle(ctx, SIZE, 2200, 0.04);
    // швы
    ctx.strokeStyle = 'rgba(120,112,96,0.75)';
    ctx.lineWidth = 3;
    for (let i = 0; i <= tiles; i++) {
      ctx.beginPath();
      ctx.moveTo(i * step, 0); ctx.lineTo(i * step, SIZE);
      ctx.moveTo(0, i * step); ctx.lineTo(SIZE, i * step);
      ctx.stroke();
    }
    return tex(c, true);
  });
}

/** Шероховатость пола: швы матовые, плитка более гладкая. */
export function getFloorRoughness(): THREE.Texture {
  return build('floorRough', () => {
    const [c, ctx] = makeCanvas();
    ctx.fillStyle = '#8c8c8c';
    ctx.fillRect(0, 0, SIZE, SIZE);
    speckle(ctx, SIZE, 3000, 0.1);
    const step = SIZE / 2;
    ctx.strokeStyle = '#e6e6e6';
    ctx.lineWidth = 3;
    for (let i = 0; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(i * step, 0); ctx.lineTo(i * step, SIZE);
      ctx.moveTo(0, i * step); ctx.lineTo(SIZE, i * step);
      ctx.stroke();
    }
    return tex(c, false);
  });
}

/** Рельеф пола: швы чуть утоплены. */
export function getFloorBump(): THREE.Texture {
  return build('floorBump', () => {
    const [c, ctx] = makeCanvas();
    ctx.fillStyle = '#b4b4b4';
    ctx.fillRect(0, 0, SIZE, SIZE);
    const step = SIZE / 2;
    ctx.strokeStyle = '#303030';
    ctx.lineWidth = 4;
    for (let i = 0; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(i * step, 0); ctx.lineTo(i * step, SIZE);
      ctx.moveTo(0, i * step); ctx.lineTo(SIZE, i * step);
      ctx.stroke();
    }
    return tex(c, false);
  });
}

/** Стена: матовая штукатурка с очень мелким зерном. */
export function getWallTexture(): THREE.Texture {
  return build('wall', () => {
    const [c, ctx] = makeCanvas();
    ctx.fillStyle = '#eeebe4';
    ctx.fillRect(0, 0, SIZE, SIZE);
    // едва заметные пятна валика
    for (let i = 0; i < 60; i++) {
      const g = ctx.createRadialGradient(
        Math.random() * SIZE, Math.random() * SIZE, 4,
        Math.random() * SIZE, Math.random() * SIZE, 60 + Math.random() * 90,
      );
      g.addColorStop(0, 'rgba(255,255,255,0.05)');
      g.addColorStop(1, 'rgba(190,185,175,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, SIZE, SIZE);
    }
    speckle(ctx, SIZE, 2600, 0.025);
    return tex(c, true);
  });
}

export function getWallRoughness(): THREE.Texture {
  return build('wallRough', () => {
    const [c, ctx] = makeCanvas();
    ctx.fillStyle = '#d2d2d2';
    ctx.fillRect(0, 0, SIZE, SIZE);
    speckle(ctx, SIZE, 4000, 0.09);
    return tex(c, false);
  });
}

/** Рельеф штукатурки — даёт стене «шагрень» на скользящем свету. */
export function getWallBump(): THREE.Texture {
  return build('wallBump', () => {
    const [c, ctx] = makeCanvas();
    ctx.fillStyle = '#808080';
    ctx.fillRect(0, 0, SIZE, SIZE);
    speckle(ctx, SIZE, 9000, 0.16);
    return tex(c, false);
  });
}

/** Текстура с нужным числом повторов. Результат кэшируется:
 *  клонировать текстуру на каждом рендере — утечка видеопамяти. */
export function repeated(base: THREE.Texture, rx: number, ry: number): THREE.Texture {
  const x = Math.max(0.1, Math.round(rx * 10) / 10);
  const y = Math.max(0.1, Math.round(ry * 10) / 10);
  const key = `${base.uuid}:${x}:${y}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const t = base.clone();
  t.needsUpdate = true;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(x, y);
  cache.set(key, t);
  return t;
}
