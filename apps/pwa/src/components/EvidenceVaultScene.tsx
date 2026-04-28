import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { DoubleSide } from "three";
import type { Group, MeshBasicMaterial, ShaderMaterial } from "three";

function SealLiquid() {
  const material = useRef<ShaderMaterial | null>(null);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uImpulse: { value: 0 },
    }),
    [],
  );

  useEffect(() => {
    let lastY = window.scrollY;
    let impulse = 0;
    const onScroll = () => {
      const delta = Math.min(1, Math.abs(window.scrollY - lastY) / 240);
      impulse = Math.max(impulse, delta);
      lastY = window.scrollY;
      if (material.current) {
        material.current.uniforms.uImpulse.value = impulse;
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useFrame((state, delta) => {
    if (!material.current) {
      return;
    }
    material.current.uniforms.uTime.value = state.clock.elapsedTime;
    const current = material.current.uniforms.uImpulse.value;
    material.current.uniforms.uImpulse.value = Math.max(0, current - delta * 0.72);
  });

  return (
    <mesh position={[0, -0.12, 0.01]} scale={[1.04, 0.56, 1]}>
      <planeGeometry args={[2.15, 1.42, 96, 48]} />
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        vertexShader={`
          uniform float uTime;
          uniform float uImpulse;
          varying vec2 vUv;
          void main() {
            vUv = uv;
            vec3 pos = position;
            float inertia = sin((uv.x * 5.4) + uTime * 1.5) * 0.035 * (0.35 + uImpulse);
            pos.y += inertia + sin(uTime * 0.32) * 0.018;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
          }
        `}
        fragmentShader={`
          uniform float uTime;
          uniform float uImpulse;
          varying vec2 vUv;

          float bubble(vec2 uv, vec2 origin, float speed, float size) {
            vec2 p = vec2(origin.x, fract(origin.y + uTime * speed + uImpulse * 0.22));
            return smoothstep(size, 0.0, distance(uv, p));
          }

          void main() {
            vec2 uv = vUv;
            float meniscus = smoothstep(0.8, 0.28, abs(uv.y - 0.58 - sin(uv.x * 8.0 + uTime * 0.4) * 0.035));
            float bubbles = bubble(uv, vec2(0.28, 0.12), 0.08, 0.028);
            bubbles += bubble(uv, vec2(0.54, 0.04), 0.12, 0.018);
            bubbles += bubble(uv, vec2(0.72, 0.22), 0.07, 0.024);
            vec3 prismA = vec3(1.000, 0.721, 0.420);
            vec3 prismB = vec3(0.494, 0.910, 1.000);
            vec3 prismC = vec3(1.000, 0.557, 0.859);
            vec3 color = mix(prismA, prismB, uv.x);
            color = mix(color, prismC, uv.y * 0.24 + meniscus * 0.12);
            color += vec3(1.0) * (bubbles * 0.36 + meniscus * 0.2);
            float alpha = smoothstep(0.03, 0.18, uv.x) * smoothstep(0.97, 0.82, uv.x) * 0.62;
            gl_FragColor = vec4(color, alpha + bubbles * 0.22);
          }
        `}
      />
    </mesh>
  );
}

function VaultSilhouette() {
  const material = useRef<ShaderMaterial | null>(null);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
    }),
    [],
  );

  useFrame((state) => {
    if (material.current) {
      material.current.uniforms.uTime.value = state.clock.elapsedTime;
    }
  });

  return (
    <mesh position={[0, -0.02, 0.84]} scale={[1.32, 1.92, 1]}>
      <planeGeometry args={[1.6, 1.9, 1, 1]} />
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        vertexShader={`
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={`
          uniform float uTime;
          varying vec2 vUv;

          void main() {
            vec2 uv = vUv;
            vec2 p = uv * 2.0 - 1.0;
            float capsule = length(p * vec2(0.72, 1.06));
            float body = 1.0 - smoothstep(0.9, 1.0, capsule);
            float edge = (1.0 - smoothstep(0.0, 0.08, abs(capsule - 0.94))) * body;
            float liquidMask = body * smoothstep(-0.72, -0.16 + sin(uTime * 0.48) * 0.025, -p.y);
            float meniscus = (1.0 - smoothstep(0.0, 0.05, abs(p.y + 0.18 + sin(p.x * 5.0 + uTime * 0.5) * 0.025))) * body;
            float highlight = (1.0 - smoothstep(0.0, 0.1, abs(p.x + 0.38))) * (1.0 - smoothstep(-0.5, 0.86, p.y)) * body;
            vec3 prismA = vec3(1.000, 0.721, 0.420);
            vec3 prismB = vec3(0.494, 0.910, 1.000);
            vec3 prismC = vec3(1.000, 0.557, 0.859);
            vec3 ice = vec3(0.97, 0.99, 1.0);
            vec3 color = mix(vec3(0.86, 0.90, 0.94), ice, body * 0.6);
            color = mix(color, mix(prismA, prismB, uv.x), liquidMask * 0.72);
            color += prismC * (edge * 0.34 + meniscus * 0.24);
            color += ice * highlight * 0.5;
            float alpha = body * 0.28 + edge * 0.9 + liquidMask * 0.5 + meniscus * 0.34 + highlight * 0.28;
            gl_FragColor = vec4(color, alpha);
          }
        `}
      />
    </mesh>
  );
}

function ReadableVaultFace() {
  const material = useRef<ShaderMaterial | null>(null);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
    }),
    [],
  );

  useFrame((state) => {
    if (material.current) {
      material.current.uniforms.uTime.value = state.clock.elapsedTime;
    }
  });

  return (
    <mesh position={[0, -0.02, 1.08]} scale={[1.02, 1.36, 1]}>
      <planeGeometry args={[1.45, 1.68, 72, 72]} />
      <shaderMaterial
        ref={material}
        uniforms={uniforms}
        side={DoubleSide}
        transparent
        depthWrite={false}
        depthTest={false}
        vertexShader={`
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `}
        fragmentShader={`
          uniform float uTime;
          varying vec2 vUv;

          float capsule(vec2 p) {
            vec2 q = p;
            q.y *= 0.86;
            return length(q * vec2(0.72, 1.02));
          }

          void main() {
            vec2 uv = vUv;
            vec2 p = uv * 2.0 - 1.0;
            float d = capsule(p);
            float body = 1.0 - smoothstep(0.93, 0.985, d);
            float edge = (1.0 - smoothstep(0.0, 0.032, abs(d - 0.945))) * body;
            float inner = (1.0 - smoothstep(0.0, 0.052, abs(d - 0.74))) * body;
            float wave = sin(p.x * 5.2 + uTime * 0.48) * 0.026;
            float liquid = body * smoothstep(-0.84, -0.18 + wave, -p.y);
            float meniscus = (1.0 - smoothstep(0.0, 0.038, abs(p.y + 0.18 + wave))) * body;
            float leftShine = (1.0 - smoothstep(0.0, 0.055, abs(p.x + 0.34))) * smoothstep(0.82, -0.42, p.y) * body;
            float rightEdge = (1.0 - smoothstep(0.0, 0.07, abs(p.x - 0.42))) * smoothstep(0.78, -0.72, p.y) * body;
            float label = body * step(abs(p.y - 0.04), 0.14) * step(abs(p.x), 0.54);
            float hashPlate = body * step(abs(p.y + 0.24), 0.05) * step(abs(p.x), 0.48);

            vec3 prismA = vec3(1.000, 0.721, 0.420);
            vec3 prismB = vec3(0.494, 0.910, 1.000);
            vec3 prismC = vec3(1.000, 0.557, 0.859);
            vec3 mist = vec3(0.98, 0.99, 1.0);
            vec3 color = vec3(0.86, 0.90, 0.94) * body;
            color = mix(color, mix(prismA, prismB, uv.x), liquid * 0.82);
            color += prismC * (edge * 0.45 + inner * 0.14 + meniscus * 0.34);
            color += mist * leftShine * 0.5 + prismB * rightEdge * 0.34;
            color = mix(color, vec3(0.94, 0.96, 0.98), label * 0.74);
            color += prismA * hashPlate * 0.28;

            float alpha = clamp(body * 0.16 + liquid * 0.58 + edge * 0.9 + inner * 0.26 + meniscus * 0.54 + leftShine * 0.35 + rightEdge * 0.22, 0.0, 0.92);
            gl_FragColor = vec4(color, alpha);
          }
        `}
      />
    </mesh>
  );
}

function VaultGeometryPlate() {
  return (
    <group position={[0, -0.04, 1.32]} renderOrder={80}>
      <mesh scale={[0.74, 1.05, 1]} renderOrder={80}>
        <circleGeometry args={[1, 96]} />
        <meshBasicMaterial color="#DDE5EC" side={DoubleSide} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh scale={[0.82, 1.16, 1]} renderOrder={81}>
        <ringGeometry args={[0.95, 0.985, 128]} />
        <meshBasicMaterial color="#7EE8FF" side={DoubleSide} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, -0.33, 0.01]} scale={[0.62, 0.3, 1]} renderOrder={82}>
        <circleGeometry args={[1, 96]} />
        <meshBasicMaterial color="#FF8EDB" side={DoubleSide} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, -0.08, 0.02]} scale={[0.64, 0.13, 1]} renderOrder={83}>
        <boxGeometry args={[1, 1, 0.02]} />
        <meshBasicMaterial color="#FFFFFF" side={DoubleSide} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.15, 0.02]} scale={[0.58, 0.12, 1]} renderOrder={84}>
        <boxGeometry args={[1, 1, 0.02]} />
        <meshBasicMaterial color="#F2F4F8" side={DoubleSide} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[-0.24, 0.12, 0.03]} scale={[0.035, 0.82, 1]} rotation={[0, 0, -0.12]} renderOrder={85}>
        <boxGeometry args={[1, 1, 0.02]} />
        <meshBasicMaterial color="#FFFFFF" side={DoubleSide} transparent opacity={0.84} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[0.35, -0.02, 0.03]} scale={[0.026, 0.92, 1]} rotation={[0, 0, 0.08]} renderOrder={86}>
        <boxGeometry args={[1, 1, 0.02]} />
        <meshBasicMaterial color="#7EE8FF" side={DoubleSide} transparent opacity={0.76} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0.72, 0.03]} scale={[0.86, 0.04, 1]} renderOrder={87}>
        <boxGeometry args={[1, 1, 0.02]} />
        <meshBasicMaterial color="#B388FF" side={DoubleSide} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, -0.77, 0.03]} scale={[1.02, 0.05, 1]} renderOrder={88}>
        <boxGeometry args={[1, 1, 0.02]} />
        <meshBasicMaterial color="#E6E8EF" side={DoubleSide} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

function EvidenceCapsule() {
  const group = useRef<Group | null>(null);
  const flare = useRef<MeshBasicMaterial | null>(null);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (group.current) {
      group.current.rotation.y = Math.sin(t * 0.18) * 0.24;
      group.current.rotation.x = Math.sin(t * 0.12) * 0.035;
    }
    if (flare.current) {
      flare.current.opacity = 0.18 + Math.sin(t * 0.7) * 0.05;
    }
  });

  return (
      <group ref={group} position={[-0.46, -0.05, 0]} scale={[1.14, 1.14, 1.14]}>
        <mesh position={[0, -0.04, -0.62]} scale={[2.24, 2.72, 0.05]}>
          <sphereGeometry args={[1, 48, 24]} />
          <meshBasicMaterial ref={flare} color="#7EE8FF" transparent opacity={0.24} depthWrite={false} />
        </mesh>
        <VaultGeometryPlate />
        <SealLiquid />
        <VaultSilhouette />
        <ReadableVaultFace />
        <mesh position={[0, 0, 0.78]} scale={[1.28, 1.28, 1]}>
          <ringGeometry args={[0.7, 0.715, 84]} />
          <meshBasicMaterial color="#7EE8FF" transparent opacity={0.56} />
        </mesh>
        <mesh position={[0, 1.05, 0.12]} scale={[1.18, 0.06, 1]}>
          <boxGeometry args={[1, 1, 0.08]} />
          <meshBasicMaterial color="#FF8EDB" transparent opacity={0.48} />
        </mesh>
        <mesh position={[0, -1.02, 0.12]} scale={[1.6, 0.06, 1]}>
          <boxGeometry args={[1, 1, 0.08]} />
          <meshBasicMaterial color="#00958D" transparent opacity={0.54} />
        </mesh>
        <mesh position={[0, -1.14, -0.1]} rotation={[Math.PI / 2, 0, 0]} scale={[1.72, 0.36, 1]}>
          <ringGeometry args={[0.54, 0.64, 96]} />
          <meshBasicMaterial color="#DDE5EC" transparent opacity={0.72} />
        </mesh>
      </group>
  );
}

function PrismHalo() {
  const group = useRef<Group | null>(null);

  useFrame((state) => {
    if (group.current) {
      const t = state.clock.elapsedTime;
      group.current.rotation.z = Math.sin(t * 0.18) * 0.1;
      group.current.rotation.y = Math.sin(t * 0.22) * 0.16;
    }
  });

  return (
    <group ref={group} position={[0.62, 0.22, -0.42]} scale={[1.18, 0.74, 0.36]} rotation={[0.18, -0.46, -0.28]}>
      <mesh>
        <torusGeometry args={[1.02, 0.09, 28, 128]} />
        <meshBasicMaterial color="#EAF7FF" transparent opacity={0.48} depthWrite={false} />
      </mesh>
      <mesh rotation={[0, 0, 0.12]} scale={[1.06, 1.06, 1]}>
        <torusGeometry args={[1.02, 0.018, 16, 128]} />
        <meshBasicMaterial color="#7EE8FF" transparent opacity={0.74} depthWrite={false} />
      </mesh>
      <mesh rotation={[0, 0, -0.2]} scale={[0.92, 0.92, 1]}>
        <torusGeometry args={[1.02, 0.014, 16, 128]} />
        <meshBasicMaterial color="#FF8EDB" transparent opacity={0.62} depthWrite={false} />
      </mesh>
      <mesh rotation={[0, 0, 0.32]} scale={[1.15, 1.15, 1]}>
        <torusGeometry args={[1.02, 0.012, 16, 128]} />
        <meshBasicMaterial color="#FFB86B" transparent opacity={0.58} depthWrite={false} />
      </mesh>
    </group>
  );
}

function BubbleField() {
  const bubbles = useMemo(
    () =>
      Array.from({ length: 16 }, (_, index) => ({
        x: -1.15 + (index % 4) * 0.72,
        y: -1.08 + (index % 5) * 0.34,
        z: -0.35 + (index % 3) * 0.2,
        scale: 0.018 + (index % 4) * 0.008,
      })),
    [],
  );
  const group = useRef<Group | null>(null);

  useFrame((state) => {
    if (group.current) {
      group.current.children.forEach((child, index) => {
        child.position.y = -1.08 + (((state.clock.elapsedTime * (0.08 + index * 0.006) + index * 0.13) % 1.9));
        child.position.x += Math.sin(state.clock.elapsedTime * 0.6 + index) * 0.0008;
      });
    }
  });

  return (
    <group ref={group}>
      {bubbles.map((bubble, index) => (
        <mesh key={index} position={[bubble.x, bubble.y, bubble.z]} scale={bubble.scale}>
          <sphereGeometry args={[1, 16, 16]} />
          <meshBasicMaterial color="#7EE8FF" transparent opacity={0.42} />
        </mesh>
      ))}
    </group>
  );
}

export function EvidenceVaultScene() {
  return (
    <div className="evidence-vault-scene" data-evidence-target aria-label="3D 证据封存舱，包含滚动惯性液面和气泡">
      <Canvas
        orthographic
        camera={{ position: [0, 0, 5], zoom: 118 }}
        dpr={[1, 1.5]}
        resize={{ scroll: false }}
        gl={{ alpha: false, antialias: true, preserveDrawingBuffer: true }}
      >
        <color attach="background" args={["#FAFAFC"]} />
        <ambientLight intensity={1.2} />
        <spotLight position={[-2.8, 3.6, 3.5]} angle={0.44} penumbra={0.9} intensity={3.8} color="#7EE8FF" />
        <pointLight position={[2.2, -1.4, 2]} intensity={1.55} color="#FF8EDB" />
        <pointLight position={[0.1, 0.25, 2.2]} intensity={1.6} color="#FFFFFF" />
        <PrismHalo />
        <EvidenceCapsule />
        <BubbleField />
      </Canvas>
      <div className="vault-caption">
        <span>lightcore evidence vault</span>
        <strong>3D 棱镜封存舱</strong>
        <small>prism halo / soft glass / hash lock</small>
      </div>
    </div>
  );
}
