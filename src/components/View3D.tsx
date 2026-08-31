import { Canvas } from '@react-three/fiber';
import { OrbitControls, Sky } from '@react-three/drei';
import * as THREE from 'three';
import { useEffect, useMemo } from 'react';
import { useStore } from '../store';
import { makeDate, sunDirection } from '../sun';
import { openingSpan, wallAngle, wallBoxes, wallLen, wallsBBox } from '../geometry';
import type { Furniture, Opening, Wall } from '../types';

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
          <meshStandardMaterial color="#dedad2" roughness={0.9} />
        </mesh>
      ))}
      {glass.map((g) => (
        <mesh key={g.id} position={[g.x, g.y, 0]}>
          <boxGeometry args={[g.w, g.h, 0.05]} />
          <meshStandardMaterial color="#a8d4f0" transparent opacity={0.25} roughness={0.1} metalness={0.1} />
        </mesh>
      ))}
    </group>
  );
}

function FurnitureMesh({ f }: { f: Furniture }) {
  const rot = (-f.rotation * Math.PI) / 180;
  if (f.type === 'desk') {
    return (
      <group position={[f.x, 0, f.y]} rotation={[0, rot, 0]}>
        <mesh castShadow receiveShadow position={[0, 0.73, 0]}>
          <boxGeometry args={[1.4, 0.04, 0.7]} />
          <meshStandardMaterial color="#b98d5f" roughness={0.7} />
        </mesh>
        {[[-0.65, -0.3], [0.65, -0.3], [-0.65, 0.3], [0.65, 0.3]].map(([lx, lz], i) => (
          <mesh key={i} castShadow position={[lx, 0.355, lz]}>
            <boxGeometry args={[0.05, 0.71, 0.05]} />
            <meshStandardMaterial color="#6d6d6d" roughness={0.6} metalness={0.3} />
          </mesh>
        ))}
      </group>
    );
  }
  return (
    <group position={[f.x, 0, f.y]} rotation={[0, rot, 0]}>
      <mesh castShadow position={[0, 0.45, 0]}>
        <boxGeometry args={[0.45, 0.06, 0.45]} />
        <meshStandardMaterial color="#5f7d59" roughness={0.8} />
      </mesh>
      <mesh castShadow position={[0, 0.72, 0.2]}>
        <boxGeometry args={[0.45, 0.55, 0.05]} />
        <meshStandardMaterial color="#5f7d59" roughness={0.8} />
      </mesh>
      {[[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]].map(([lx, lz], i) => (
        <mesh key={i} castShadow position={[lx, 0.21, lz]}>
          <boxGeometry args={[0.04, 0.42, 0.04]} />
          <meshStandardMaterial color="#4a4a4a" metalness={0.4} />
        </mesh>
      ))}
    </group>
  );
}

function SunLight({
  position, intensity, color, radius, target,
}: {
  position: [number, number, number];
  intensity: number;
  color: string;
  radius: number;
  target: [number, number, number];
}) {
  const targetObj = useMemo(() => new THREE.Object3D(), []);
  useEffect(() => {
    targetObj.position.set(...target);
    targetObj.updateMatrixWorld();
  }, [targetObj, target[0], target[1], target[2]]);
  return (
    <>
      <directionalLight
        castShadow
        position={position}
        intensity={intensity}
        color={color}
        target={targetObj}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-radius * 1.6}
        shadow-camera-right={radius * 1.6}
        shadow-camera-top={radius * 1.6}
        shadow-camera-bottom={-radius * 1.6}
        shadow-camera-near={1}
        shadow-camera-far={120}
        shadow-bias={-0.0004}
      />
      <primitive object={targetObj} />
    </>
  );
}

function Scene() {
  const walls = useStore((s) => s.walls);
  const openings = useStore((s) => s.openings);
  const furniture = useStore((s) => s.furniture);
  const location = useStore((s) => s.location);
  const sunState = useStore((s) => s.sun);

  const bbox = wallsBBox(walls);
  const center = bbox
    ? { x: (bbox.minX + bbox.maxX) / 2, z: (bbox.minY + bbox.maxY) / 2 }
    : { x: 0, z: 0 };
  const extentX = bbox ? bbox.maxX - bbox.minX : 10;
  const extentZ = bbox ? bbox.maxY - bbox.minY : 10;
  const radius = Math.max(extentX, extentZ) / 2 + 6;

  const sun = useMemo(() => {
    const date = makeDate(sunState.dateISO, sunState.minutes);
    return sunDirection(date, location.lat, location.lng, location.northAngle);
  }, [sunState, location]);

  const day = sun.altitude > 0;
  const sinAlt = Math.sin(Math.max(0, sun.altitude));
  const dirIntensity = day ? Math.min(1.7, 2.6 * sinAlt + 0.15) : 0;
  const ambient = day ? 0.35 + 0.3 * Math.min(1, sinAlt * 2.5) : 0.14;

  const lightPos: [number, number, number] = [
    center.x + sun.dir[0] * 45,
    Math.max(2, sun.dir[1] * 45),
    center.z + sun.dir[2] * 45,
  ];

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

      <ambientLight intensity={ambient} />
      <hemisphereLight intensity={day ? 0.35 : 0.08} color="#cfe4ff" groundColor="#8a7a5f" />
      {day && (
        <SunLight
          position={lightPos}
          intensity={dirIntensity}
          color={sinAlt < 0.2 ? '#ffc48a' : '#fff4e0'}
          radius={radius}
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
          <boxGeometry args={[extentX + 0.8, 0.1, extentZ + 0.8]} />
          <meshStandardMaterial color="#cec2a8" roughness={0.9} />
        </mesh>
      )}

      {walls.map((w) => (
        <WallMesh key={w.id} wall={w} openings={openings} />
      ))}
      {furniture.map((f) => (
        <FurnitureMesh key={f.id} f={f} />
      ))}

      <arrowHelper args={[northArrow.dir, northArrow.origin, 2.2, '#d23333', 0.55, 0.3]} />

      <OrbitControls target={[center.x, 1, center.z]} maxPolarAngle={Math.PI / 2 - 0.02} />
    </>
  );
}

export default function View3D() {
  return (
    <div className="view3d">
      <Canvas shadows="soft" camera={{ position: [16, 12, 18], fov: 50 }}>
        <Scene />
      </Canvas>
    </div>
  );
}
