import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { ShaderMaterial } from "three";

function RadarPlane() {
  const material = useRef<ShaderMaterial | null>(null);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uAlert: { value: 0.62 },
    }),
    [],
  );

  useFrame((state) => {
    if (material.current) {
      material.current.uniforms.uTime.value = state.clock.elapsedTime;
      material.current.uniforms.uAlert.value = 0.45 + Math.sin(state.clock.elapsedTime * 0.65) * 0.18;
    }
  });

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.45, 0]}>
      <planeGeometry args={[6, 4.2, 96, 96]} />
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
          uniform float uAlert;
          varying vec2 vUv;

          float line(vec2 p, float y, float width) {
            return smoothstep(width, 0.0, abs(p.y - y));
          }

          void main() {
            vec2 p = vUv * 2.0 - 1.0;
            float shelf = smoothstep(0.96, 0.94, abs(p.x)) + smoothstep(0.76, 0.74, abs(p.y));
            float slots = 0.0;
            for (float i = -0.6; i <= 0.6; i += 0.4) {
              slots += line(p, i, 0.012);
            }
            float sweep = smoothstep(0.08, 0.0, abs(p.x - sin(uTime * 0.52) * 0.82));
            float hotspot = smoothstep(0.28, 0.0, distance(p, vec2(0.42, -0.26)));
            float grain = fract(sin(dot(p + uTime * 0.02, vec2(12.9898, 78.233))) * 43758.5453) * 0.045;
            vec3 snow = vec3(0.980, 0.984, 0.992);
            vec3 sensor = vec3(0.00, 0.58, 0.55);
            vec3 prism = vec3(0.49, 0.91, 1.0);
            vec3 danger = vec3(1.00, 0.32, 0.16);
            vec3 color = snow * 0.72 + sensor * (slots * 0.24 + shelf * 0.18 + sweep * 0.28);
            color += mix(prism, danger, uAlert) * hotspot * (0.22 + 0.16 * sin(uTime * 7.0));
            color += grain * 0.35;
            float alpha = clamp(0.82 + slots * 0.08 + shelf * 0.06 + sweep * 0.12 + hotspot * 0.18, 0.0, 1.0);
            gl_FragColor = vec4(color, alpha);
          }
        `}
      />
    </mesh>
  );
}

export function SensingField() {
  return (
    <div className="sensing-field" aria-label="取餐架俯视雷达与传感器热区">
      <Canvas camera={{ position: [0, 3.2, 3.1], fov: 42 }} dpr={[1, 1.5]} gl={{ alpha: false, antialias: true }}>
        <color attach="background" args={["#FAFAFC"]} />
        <ambientLight intensity={0.7} />
        <pointLight position={[2, 4, 2]} intensity={0.9} color="#00958D" />
        <RadarPlane />
      </Canvas>
      <div className="sensing-overlay">
        <span>PRISM ROI A3</span>
        <strong>weight -318g</strong>
        <small>soft glass lock</small>
      </div>
      <div className="sensing-controls" aria-hidden="true">
        <span><b /> Vision</span>
        <span><b /> Weight</span>
        <span><b /> Seal</span>
      </div>
    </div>
  );
}
