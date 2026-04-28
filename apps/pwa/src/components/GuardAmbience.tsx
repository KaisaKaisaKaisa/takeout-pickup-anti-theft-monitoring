import { Canvas, useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import type { ShaderMaterial } from "three";

export type GuardAmbienceTone = "danger" | "evidence" | "sensor" | "safe";

const toneValues: Record<GuardAmbienceTone, number> = {
  danger: 0,
  evidence: 1,
  sensor: 2,
  safe: 3,
};

function LiquidSmokePlane({ tone }: { tone: GuardAmbienceTone }) {
  const material = useRef<ShaderMaterial | null>(null);
  const targetTone = useRef(toneValues[tone]);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uTone: { value: toneValues[tone] },
    }),
    [tone],
  );

  useEffect(() => {
    targetTone.current = toneValues[tone];
  }, [tone]);

  useFrame((state, delta) => {
    if (material.current) {
      material.current.uniforms.uTime.value = state.clock.elapsedTime;
      const current = material.current.uniforms.uTone.value;
      material.current.uniforms.uTone.value = current + (targetTone.current - current) * Math.min(1, delta * 2.4);
    }
  });

  return (
    <mesh position={[0, 0, 0]}>
      <planeGeometry args={[7.6, 4.8, 1, 1]} />
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
          uniform float uTone;
          varying vec2 vUv;

          float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
          }

          float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(
              mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
              mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
              u.y
            );
          }

          float fbm(vec2 p) {
            float v = 0.0;
            float a = 0.5;
            for (int i = 0; i < 5; i++) {
              v += a * noise(p);
              p = mat2(1.6, -1.2, 1.2, 1.6) * p;
              a *= 0.52;
            }
            return v;
          }

          void main() {
            vec2 uv = vUv;
            vec2 p = uv * 2.0 - 1.0;
            float breath = 0.5 + 0.5 * sin(uTime * 0.628318);
            float wave = sin((p.x * 2.8 + fbm(p * 2.4 + uTime * 0.05) * 2.0) + uTime * 0.34);
            float glass = smoothstep(0.95, 0.05, length(p * vec2(0.7, 1.18)));

            float fresnel = pow(1.0 - abs(dot(normalize(vec3(p, 0.65)), vec3(0.0, 0.0, 1.0))), 2.6);
            float subsurface = smoothstep(-0.72, 0.55, p.y + wave * 0.16) * glass;
            float caustic = pow(max(0.0, sin((p.x + wave * 0.18) * 18.0 + uTime * 0.9)), 9.0);
            float chromatic = smoothstep(0.74, 0.18, abs(p.y - wave * 0.14)) * fresnel;

            vec3 legacyAmber = vec3(0.784, 0.459, 0.200); // #C87533
            vec3 legacyCinnabar = vec3(0.788, 0.188, 0.173); // #C9302C
            vec3 snow = vec3(0.980, 0.984, 0.992);
            vec3 slate = vec3(0.949, 0.957, 0.973);
            vec3 prismA = vec3(1.000, 0.721, 0.420);
            vec3 prismB = vec3(1.000, 0.906, 0.541);
            vec3 prismC = vec3(0.494, 0.910, 1.000);
            vec3 prismD = vec3(0.702, 0.533, 1.000);
            vec3 prismE = vec3(1.000, 0.557, 0.859);
            vec3 teal = vec3(0.000, 0.584, 0.553);
            vec3 alert = vec3(1.000, 0.318, 0.161);
            vec3 toneColor = prismC;
            if (uTone < 0.5) {
              toneColor = alert;
            } else if (uTone < 1.5) {
              toneColor = prismE;
            } else if (uTone < 2.5) {
              toneColor = teal;
            } else {
              toneColor = prismC;
            }

            float smokeColumn = smoothstep(0.36, 0.0, abs(p.x + 0.18 + sin(uTime * 0.35) * 0.02));
            float smokeRise = smoothstep(-1.0, 0.82, p.y + fbm(vec2(p.x * 2.0, p.y * 1.6 - uTime * 0.18)) * 0.72);
            float smokeFade = 1.0 - smoothstep(0.46, 0.95, p.y);
            float smoke = smokeColumn * smokeRise * smokeFade * 0.42;
            float riskAura = smoothstep(0.98, 0.0, length(p - vec2(0.22, 0.02))) * 0.18;
            float prismBand = smoothstep(0.1, 0.0, abs(p.y - wave * 0.16 - p.x * 0.18));
            vec3 prism = mix(prismA, prismB, smoothstep(-0.7, -0.2, p.x));
            prism = mix(prism, prismC, smoothstep(-0.15, 0.18, p.x));
            prism = mix(prism, prismD, smoothstep(0.18, 0.48, p.x));
            prism = mix(prism, prismE, smoothstep(0.48, 0.82, p.x));

            vec3 color = mix(snow, slate, glass * 0.16);
            color += prism * (prismBand * 0.42 + caustic * 0.18);
            color += toneColor * (riskAura + smoke * 0.22);
            color += legacyAmber * fresnel * 0.03 + legacyCinnabar * chromatic * 0.025;
            color += vec3(1.0) * fresnel * 0.18;
            float alpha = clamp(0.74 + glass * 0.18 + prismBand * 0.08 + smoke * 0.08, 0.0, 1.0);
            gl_FragColor = vec4(color, alpha);
          }
        `}
      />
    </mesh>
  );
}

export function GuardAmbience({ tone = "evidence" }: { tone?: GuardAmbienceTone }) {
  return (
    <div className="guard-ambience" aria-hidden="true">
      <Canvas camera={{ position: [0, 0, 4.8], fov: 45 }} dpr={[1, 1.5]} gl={{ alpha: false, antialias: true }}>
        <color attach="background" args={["#FAFAFC"]} />
        <LiquidSmokePlane tone={tone} />
      </Canvas>
    </div>
  );
}
