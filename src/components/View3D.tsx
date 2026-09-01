import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, RoundedBox, Sky } from '@react-three/drei';
import * as THREE from 'three';
import { useEffect, useMemo, useRef } from 'react';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { useStore } from '../store';
import { makeDate, sunDirection } from '../sun';
import { openingSpan, wallAngle, wallBoxes, wallLen, wallsBBox } from '../geometry';
import { fpOf, kelvinToHex, lampParams, metaOf } from '../furniture';
import {
  getFloorBump, getFloorRoughness, getFloorTexture,
  getWallBump, getWallRoughness, getWallTexture, repeated,
} from '../textures';
import type { Furniture, Opening, Pt, Wall } from '../types';

function WallMesh({ wall, openings }: { wall: Wall; openings: Opening[] }) {
  const L = wallLen(wall);
  const th = wall.thickness;
  const boxes = useMemo(() => {
    return wallBoxes(wall, openings).map((b) => {
      let off = b.off;
      let len = b.len;
      // продлеваем крайние сегменты на полтолщины — аккуратные углы
      if (off < 0.011) {
        off -= th / 2;
        len += th / 2;
      }
      if (b.off + b.len > L - 0.011) len += th / 2;
      return { ...b, off, len };
    });
  }, [wall, openings, L, th]);

  const glass = useMemo(
    () =>
      openings
        .filter((o) => o.wallId === wall.id && o.type === 'window')
        .map((o) => {
          const span = openingSpan(wall, o);
          return {
            id: o.id,
            x: (span.start + span.end) / 2,
            y: o.sillHeight + o.height / 2,
            w: span.end - span.start,
            h: o.height,
          };
        }),
    [wall, openings],
  );

  return (
    <group position={[wall.a.x, 0, wall.a.y]} rotation={[0, -wallAngle(wall), 0]}>
      {boxes.map((b, i) => (
        <mesh
          key={i}
          castShadow
          receiveShadow
          position={[b.off + b.len / 2, (b.y0 + b.y1) / 2, 0]}
        >
          <boxGeometry args={[b.len, b.y1 - b.y0, th]} />
          <meshStandardMaterial
            color="#f1eee7"
            map={repeated(getWallTexture(), Math.max(1, Math.round(b.len / 2)), Math.max(1, Math.round((b.y1 - b.y0) / 2)))}
            roughnessMap={repeated(getWallRoughness(), Math.max(1, Math.round(b.len / 2)), Math.max(1, Math.round((b.y1 - b.y0) / 2)))}
            bumpMap={repeated(getWallBump(), Math.max(1, Math.round(b.len)), Math.max(1, Math.round(b.y1 - b.y0)))}
            bumpScale={0.35}
            roughness={0.95}
          />
        </mesh>
      ))}

      {/* плинтус — только там, где стена доходит до пола */}
      {boxes.filter((b) => b.y0 < 0.01).map((b, i) => (
        <mesh key={"skirt" + i} castShadow receiveShadow position={[b.off + b.len / 2, 0.06, 0]}>
          <boxGeometry args={[b.len, 0.12, th + 0.03]} />
          <meshStandardMaterial color="#ddd8cc" roughness={0.55} />
        </mesh>
      ))}

      {/* оконные рамы */}
      {glass.map((g) => (
        <group key={"frame" + g.id} position={[g.x, g.y, 0]}>
          {[
            { p: [0, g.h / 2 - 0.035, 0], s: [g.w, 0.07, th + 0.02] },
            { p: [0, -g.h / 2 + 0.035, 0], s: [g.w, 0.07, th + 0.02] },
            { p: [-g.w / 2 + 0.035, 0, 0], s: [0.07, g.h, th + 0.02] },
            { p: [g.w / 2 - 0.035, 0, 0], s: [0.07, g.h, th + 0.02] },
          ].map((part, i) => (
            <mesh key={i} castShadow receiveShadow position={part.p as [number, number, number]}>
              <boxGeometry args={part.s as [number, number, number]} />
              <meshStandardMaterial color="#f7f5f0" roughness={0.45} />
            </mesh>
          ))}
        </group>
      ))}
      {glass.map((g) => (
        <mesh key={g.id} position={[g.x, g.y, 0]}>
          <boxGeometry args={[g.w, g.h, 0.05]} />
          <meshPhysicalMaterial color="#cfe6f7" transparent opacity={0.18} roughness={0.05} metalness={0} transmission={0.6} thickness={0.02} />
        </mesh>
      ))}
    </group>
  );
}

function FurnitureMesh({ f }: { f: Furniture }) {
  const rot = (-f.rotation * Math.PI) / 180;
  const { w, d } = fpOf(f);
  const meta = metaOf(f.type);
  const pos: [number, number, number] = [f.x, 0, f.y];

  if (f.type === 'desk' || f.type === 'meeting') {
    const lx = w / 2 - 0.06;
    const lz = d / 2 - 0.06;
    return (
      <group position={pos} rotation={[0, rot, 0]}>
        <RoundedBox castShadow receiveShadow position={[0, 0.73, 0]} args={[w, 0.045, d]} radius={0.018} smoothness={3}>
          <meshStandardMaterial color="#bb9265" roughness={0.55} metalness={0.02} />
        </RoundedBox>
        {[[-lx, -lz], [lx, -lz], [-lx, lz], [lx, lz]].map(([x, z], i) => (
          <mesh key={i} castShadow position={[x, 0.355, z]}>
            <boxGeometry args={[0.05, 0.71, 0.05]} />
            <meshStandardMaterial color="#6d6d6d" roughness={0.6} metalness={0.3} />
          </mesh>
        ))}
      </group>
    );
  }
  if (f.type === 'chair' || f.type === 'armchair') {
    const lx = w / 2 - 0.05;
    const lz = d / 2 - 0.05;
    const seatH = f.type === 'armchair' ? 0.4 : 0.45;
    return (
      <group position={pos} rotation={[0, rot, 0]}>
        <RoundedBox
          castShadow
          receiveShadow
          position={[0, seatH, 0]}
          args={[w, f.type === 'armchair' ? 0.2 : 0.07, d]}
          radius={f.type === 'armchair' ? 0.06 : 0.02}
          smoothness={3}
        >
          <meshStandardMaterial color="#5f7d59" roughness={0.85} />
        </RoundedBox>
        <mesh castShadow receiveShadow position={[0, seatH + 0.3, d / 2 - 0.05]}>
          <boxGeometry args={[w, 0.55, 0.1]} />
          <meshStandardMaterial color="#5f7d59" roughness={0.85} />
        </mesh>
        {f.type === 'armchair' &&
          [-1, 1].map((s) => (
            <mesh key={s} castShadow position={[s * (w / 2 - 0.06), seatH + 0.18, 0]}>
              <boxGeometry args={[0.12, 0.18, d * 0.85]} />
              <meshStandardMaterial color="#55704f" roughness={0.9} />
            </mesh>
          ))}
        {f.type === 'chair' &&
          [[-lx, -lz], [lx, -lz], [-lx, lz], [lx, lz]].map(([x, z], i) => (
            <mesh key={i} castShadow position={[x, 0.21, z]}>
              <boxGeometry args={[0.04, 0.42, 0.04]} />
              <meshStandardMaterial color="#4a4a4a" metalness={0.4} />
            </mesh>
          ))}
      </group>
    );
  }
  if (f.type === 'sofa') {
    return (
      <group position={pos} rotation={[0, rot, 0]}>
        <RoundedBox castShadow receiveShadow position={[0, 0.22, 0]} args={[w, 0.44, d]} radius={0.07} smoothness={3}>
          <meshStandardMaterial color="#7d5f74" roughness={0.9} />
        </RoundedBox>
        <mesh castShadow receiveShadow position={[0, 0.55, d / 2 - 0.09]}>
          <boxGeometry args={[w, 0.5, 0.18]} />
          <meshStandardMaterial color="#7d5f74" roughness={0.9} />
        </mesh>
        {[-1, 1].map((s) => (
          <mesh key={s} castShadow position={[s * (w / 2 - 0.08), 0.5, 0]}>
            <boxGeometry args={[0.16, 0.25, d]} />
            <meshStandardMaterial color="#6e5468" roughness={0.9} />
          </mesh>
        ))}
      </group>
    );
  }
  if (f.type === 'cabinet' || f.type === 'drawer' || f.type === 'reception') {
    const h = meta.h;
    return (
      <group position={pos} rotation={[0, rot, 0]}>
        <mesh castShadow receiveShadow position={[0, h / 2, 0]}>
          <boxGeometry args={[w, h, d]} />
          <meshStandardMaterial
            color={f.type === 'reception' ? '#b08f6c' : '#8f8f98'}
            roughness={0.75}
          />
        </mesh>
      </group>
    );
  }
  if (f.type === 'plant') {
    return (
      <group position={pos}>
        <mesh castShadow position={[0, 0.18, 0]}>
          <cylinderGeometry args={[w * 0.22, w * 0.28, 0.36, 12]} />
          <meshStandardMaterial color="#8a5a3a" roughness={0.9} />
        </mesh>
        <mesh castShadow position={[0, 0.75, 0]}>
          <sphereGeometry args={[w * 0.5, 12, 10]} />
          <meshStandardMaterial color="#3f6f3f" roughness={0.95} />
        </mesh>
      </group>
    );
  }
  if (f.type === 'lamp') {
    const { temp, mount } = lampParams(f);
    const color = kelvinToHex(temp);
    return (
      <group position={[f.x, 0, f.y]}>
        <mesh position={[0, mount, 0]}>
          <cylinderGeometry args={[w / 2, w / 2, 0.08, 16]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.6} />
        </mesh>
      </group>
    );
  }
  // box и всё неизвестное
  return (
    <group position={pos} rotation={[0, rot, 0]}>
      <mesh castShadow receiveShadow position={[0, meta.h / 2, 0]}>
        <boxGeometry args={[w, meta.h, d]} />
        <meshStandardMaterial color="#a3a398" roughness={0.85} />
      </mesh>
    </group>
  );
}

/** Свет от светильников. Яркость подобрана эмпирически: 3000 лм ≈ офисная лампа. */
function Lamps({ lamps }: { lamps: Furniture[] }) {
  return (
    <>
      {lamps.slice(0, 12).map((f, i) => {
        const { lumens, temp, mount } = lampParams(f);
        if (lumens <= 0) return null;
        // первые лампы отбрасывают тень (свет не проходит сквозь стены),
        // остальные — только светят: тени от точечных источников дороги
        const withShadow = i < 3;
        return (
          <pointLight
            key={f.id}
            position={[f.x, mount, f.y]}
            intensity={lumens / 400}
            distance={0}
            decay={2}
            color={kelvinToHex(temp)}
            castShadow={withShadow}
            shadow-mapSize-width={512}
            shadow-mapSize-height={512}
            shadow-camera-near={0.2}
            shadow-camera-far={30}
            shadow-bias={-0.004}
          />
        );
      })}
    </>
  );
}

/** Крыша: видимо прозрачная, но для солнца глухая. Строго по стенам, без свеса —
 *  иначе козырёк срезал бы лучи, идущие в окна при высоком солнце. */
function Roof({
  center, sizeX, sizeZ, height,
}: {
  center: { x: number; z: number };
  sizeX: number;
  sizeZ: number;
  height: number;
}) {
  return (
    <mesh castShadow position={[center.x, height + 0.05, center.z]}>
      <boxGeometry args={[sizeX, 0.1, sizeZ]} />
      <meshStandardMaterial
        color="#c9d2dc"
        transparent
        opacity={0.12}
        depthWrite={false}
        roughness={0.9}
      />
    </mesh>
  );
}

function SunLight({
  position, intensity, color, radius, distance, target,
}: {
  position: [number, number, number];
  intensity: number;
  color: string;
  radius: number;   // радиус сцены, м
  distance: number; // как далеко отведён источник
  target: [number, number, number];
}) {
  const targetObj = useMemo(() => new THREE.Object3D(), []);
  useEffect(() => {
    targetObj.position.set(...target);
    targetObj.updateMatrixWorld();
  }, [targetObj, target[0], target[1], target[2]]);
  const near = Math.max(0.5, distance - radius * 1.3);
  const far = distance + radius * 1.3;
  return (
    <>
      <directionalLight
        castShadow
        position={position}
        intensity={intensity}
        color={color}
        target={targetObj}
        shadow-mapSize-width={4096}
        shadow-mapSize-height={4096}
        shadow-camera-left={-radius}
        shadow-camera-right={radius}
        shadow-camera-top={radius}
        shadow-camera-bottom={-radius}
        shadow-camera-near={near}
        shadow-camera-far={far}
        shadow-bias={-0.0002}
        shadow-normalBias={0.03}
        shadow-radius={2}
      />
      <primitive object={targetObj} />
    </>
  );
}

/** Небесный свет, попадающий в комнату через окна (не прямое солнце). */
function WindowSkyLights({
  windows, intensity, color,
}: {
  windows: { id: string; pos: [number, number, number]; look: [number, number, number]; w: number; h: number }[];
  intensity: number;
  color: string;
}) {
  if (intensity <= 0.01) return null;
  return (
    <>
      {windows.map((wl) => (
        <WindowSkyLight key={wl.id} {...wl} intensity={intensity} color={color} />
      ))}
    </>
  );
}

function WindowSkyLight({
  pos, look, w, h, intensity, color,
}: {
  pos: [number, number, number];
  look: [number, number, number];
  w: number;
  h: number;
  intensity: number;
  color: string;
}) {
  const ref = useRef<THREE.RectAreaLight>(null);
  useEffect(() => {
    ref.current?.lookAt(look[0], look[1], look[2]);
  }, [look[0], look[1], look[2], pos[0], pos[1], pos[2]]);
  return (
    <rectAreaLight
      ref={ref}
      position={pos}
      width={Math.max(0.2, w)}
      height={Math.max(0.2, h)}
      intensity={intensity}
      color={color}
    />
  );
}

/** Мягкое окружение из three (RoomEnvironment) — материалы перестают быть плоскими. */
function Env() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    RectAreaLightUniformsLib.init();
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.22;
    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  return null;
}

function Scene() {
  const walls = useStore((s) => s.walls);
  const openings = useStore((s) => s.openings);
  const furniture = useStore((s) => s.furniture);
  const location = useStore((s) => s.location);
  const sunState = useStore((s) => s.sun);
  const showRoof = useStore((s) => s.showRoof);

  const bbox = wallsBBox(walls);
  const center = bbox
    ? { x: (bbox.minX + bbox.maxX) / 2, z: (bbox.minY + bbox.maxY) / 2 }
    : { x: 0, z: 0 };
  const extentX = bbox ? bbox.maxX - bbox.minX : 10;
  const extentZ = bbox ? bbox.maxY - bbox.minY : 10;
  // радиус описанной сферы сцены — от него зависят границы камеры теней
  const sceneR = Math.hypot(extentX, extentZ) / 2 + 4;
  const lightDist = sceneR * 2.5;
  const ceilH = walls.reduce((m, w) => Math.max(m, w.height), 0) || 3;
  const lamps = useMemo(() => furniture.filter((f) => f.type === 'lamp'), [furniture]);

  const sun = useMemo(() => {
    const date = makeDate(sunState.dateISO, sunState.minutes, location.lat, location.lng);
    return sunDirection(date, location.lat, location.lng, location.northAngle);
  }, [sunState, location]);

  const day = sun.altitude > 0;
  const sinAlt = Math.sin(Math.max(0, sun.altitude));
  const dirIntensity = day ? Math.min(1.7, 2.6 * sinAlt + 0.15) : 0;
  const ambient = day ? 0.2 + 0.16 * Math.min(1, sinAlt * 2.5) : 0.09;
  const skyThroughWindows = day ? 0.9 + 2.2 * sinAlt : 0.08;

  // источник отводим строго по направлению на солнце: подрезать высоту нельзя,
  // иначе направление света перестаёт совпадать с реальным
  const lightPos: [number, number, number] = [
    center.x + sun.dir[0] * lightDist,
    sun.dir[1] * lightDist,
    center.z + sun.dir[2] * lightDist,
  ];

  // проёмы как источники рассеянного света с неба
  const windowLights = useMemo(() => {
    const out: { id: string; pos: [number, number, number]; look: [number, number, number]; w: number; h: number }[] = [];
    for (const o of openings) {
      // светит только окно: внутренний проём в перегородке улицы не видит
      if (o.type !== 'window') continue;
      const w = walls.find((x) => x.id === o.wallId);
      if (!w) continue;
      const L = wallLen(w);
      if (L < 0.05) continue;
      const dx = (w.b.x - w.a.x) / L;
      const dy = (w.b.y - w.a.y) / L;
      const span = openingSpan(w, o);
      const t = (span.start + span.end) / 2;
      const width = Math.max(0.2, span.end - span.start);
      const y0 = o.type === 'window' ? o.sillHeight : 0;
      const height = Math.max(0.2, Math.min(o.height, w.height - y0));
      const px = w.a.x + dx * t;
      const pz = w.a.y + dy * t;
      let nx = -dy;
      let nz = dx;
      if ((center.x - px) * nx + (center.z - pz) * nz < 0) { nx = -nx; nz = -nz; }
      out.push({
        id: o.id,
        // источник отодвинут внутрь: вплотную к стене он выжигает откосы
        pos: [px + nx * 0.4, y0 + height / 2, pz + nz * 0.4],
        look: [px + nx * 4, y0 + height / 2, pz + nz * 4],
        w: width,
        h: height,
      });
    }
    // площадные источники дороги в отрисовке — оставляем самые крупные проёмы
    return out.sort((a, b) => b.w * b.h - a.w * a.h).slice(0, 8);
  }, [openings, walls, center.x, center.z]);

  const floorMap = useMemo(
    () => repeated(getFloorTexture(), Math.max(1, Math.round(extentX)), Math.max(1, Math.round(extentZ))),
    [extentX, extentZ],
  );
  const floorRoughMap = useMemo(
    () => repeated(getFloorRoughness(), Math.max(1, Math.round(extentX)), Math.max(1, Math.round(extentZ))),
    [extentX, extentZ],
  );
  const floorBumpMap = useMemo(
    () => repeated(getFloorBump(), Math.max(1, Math.round(extentX)), Math.max(1, Math.round(extentZ))),
    [extentX, extentZ],
  );

  const northArrow = useMemo(() => {
    const a = (location.northAngle * Math.PI) / 180;
    const dir = new THREE.Vector3(Math.sin(a), 0, -Math.cos(a));
    const origin = new THREE.Vector3(
      bbox ? bbox.minX - 1.5 : -6,
      0.06,
      bbox ? bbox.maxY + 1.5 : 6,
    );
    return { dir, origin };
  }, [location.northAngle, bbox?.minX, bbox?.maxY]);

  return (
    <>
      {day ? (
        <Sky
          distance={450000}
          sunPosition={[sun.dir[0] * 100, sun.dir[1] * 100, sun.dir[2] * 100]}
          turbidity={6}
          rayleigh={sinAlt < 0.15 ? 3 : 1}
        />
      ) : (
        <color attach="background" args={['#0b1020']} />
      )}

      <Env />
      <ambientLight intensity={ambient} />
      <hemisphereLight intensity={day ? 0.22 : 0.06} color="#cfe4ff" groundColor="#8a7a5f" />
      <WindowSkyLights
        windows={windowLights}
        intensity={skyThroughWindows}
        color={day ? "#dbe9ff" : "#93a6c4"}
      />
      {day && (
        <SunLight
          position={lightPos}
          intensity={dirIntensity}
          color={sinAlt < 0.2 ? '#ffc48a' : '#fff4e0'}
          radius={sceneR}
          distance={lightDist}
          target={[center.x, 0, center.z]}
        />
      )}

      {/* земля */}
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[center.x, -0.11, center.z]}>
        <planeGeometry args={[500, 500]} />
        <meshStandardMaterial color={day ? '#93a07f' : '#242a22'} roughness={1} />
      </mesh>
      {/* плита пола */}
      {bbox && (
        <mesh receiveShadow position={[center.x, -0.05, center.z]}>
          <boxGeometry args={[extentX + 0.2, 0.1, extentZ + 0.2]} />
          <meshStandardMaterial
            color="#e4ddcd"
            map={floorMap}
            roughnessMap={floorRoughMap}
            bumpMap={floorBumpMap}
            bumpScale={0.5}
            roughness={0.62}
            metalness={0.02}
          />
        </mesh>
      )}

      {walls.map((w) => (
        <WallMesh key={w.id} wall={w} openings={openings} />
      ))}
      {furniture.map((f) => (
        <FurnitureMesh key={f.id} f={f} />
      ))}
      <Lamps lamps={lamps} />
      {bbox && showRoof && (
        <Roof
          center={center}
          sizeX={Math.max(0.5, extentX)}
          sizeZ={Math.max(0.5, extentZ)}
          height={ceilH}
        />
      )}

      <arrowHelper args={[northArrow.dir, northArrow.origin, 2.2, '#d23333', 0.55, 0.3]} />

      <OrbitControls target={[center.x, 1, center.z]} maxPolarAngle={Math.PI / 2 - 0.02} />
    </>
  );
}

export default function View3D() {
  return (
    <div className="view3d">
      <Canvas
        shadows="soft"
        dpr={[1, 2]}
        gl={{ antialias: true, toneMappingExposure: 1.05 }}
        camera={{ position: [16, 12, 18], fov: 50 }}
      >
        <Scene />
      </Canvas>
    </div>
  );
}
