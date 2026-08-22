import {
  Color,
  DoubleSide,
  ShaderMaterial,
  Vector3,
} from 'three';

const vertexShader = /* glsl */ `
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPos = world.xyz;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uLinesPerMm;
  uniform float uBlazeDeg;
  uniform float uMode;
  uniform vec3 uViewPos;
  uniform vec3 uLightDir;
  uniform float uLightLambdaNm;
  uniform float uLightOn;
  uniform float uTime;
  uniform vec3 uBase;
  varying vec3 vWorldPos;
  varying vec3 vWorldNormal;
  varying vec2 vUv;

  vec3 wavelengthRgb(float nm) {
    float r = 0.0;
    float g = 0.0;
    float b = 0.0;
    if (nm < 380.0 || nm > 780.0) {
      return vec3(0.0);
    }
    if (nm < 440.0) {
      r = -(nm - 440.0) / 60.0;
      b = 1.0;
    } else if (nm < 490.0) {
      g = (nm - 440.0) / 50.0;
      b = 1.0;
    } else if (nm < 510.0) {
      g = 1.0;
      b = -(nm - 510.0) / 20.0;
    } else if (nm < 580.0) {
      r = (nm - 510.0) / 70.0;
      g = 1.0;
    } else if (nm < 645.0) {
      r = 1.0;
      g = -(nm - 645.0) / 65.0;
    } else {
      r = 1.0;
    }
    float factor = 1.0;
    if (nm > 700.0) {
      factor = 0.3 + 0.7 * (780.0 - nm) / 80.0;
    } else if (nm < 420.0) {
      factor = 0.3 + 0.7 * (nm - 380.0) / 40.0;
    }
    return pow(max(vec3(r, g, b) * factor, 0.0), vec3(0.8));
  }

  float orderLobe(vec3 viewDir, vec3 diffracted) {
    return pow(max(dot(viewDir, diffracted), 0.0), 48.0);
  }

  void main() {
    vec3 n = normalize(vWorldNormal);
    vec3 viewDir = normalize(uViewPos - vWorldPos);
    vec3 tangent = normalize(cross(vec3(0.0, 1.0, 0.0), n));
    if (length(tangent) < 0.2) {
      tangent = normalize(cross(vec3(1.0, 0.0, 0.0), n));
    }
    vec3 light = normalize(uLightDir);
    vec3 toward = -light;
    float cosI = clamp(dot(toward, n), -1.0, 1.0);
    float thetaI = sign(dot(toward, tangent)) * acos(cosI);
    float d = 0.001 / max(uLinesPerMm, 1.0);
    vec3 color = uBase * 0.35;
    float groove = 0.04 * sin(vUv.x * uLinesPerMm * 6.28318 + uTime * 0.15);
    color += groove * vec3(0.08, 0.09, 0.1);

    int samples = uLightLambdaNm > 0.0 ? 1 : 11;
    for (int s = 0; s < 11; s += 1) {
      if (s >= samples) {
        break;
      }
      float nm = uLightLambdaNm > 0.0 ? uLightLambdaNm : mix(400.0, 700.0, float(s) / 10.0);
      float lambda = nm * 1e-9;
      vec3 rgb = wavelengthRgb(nm);
      float weight = uLightOn * (uLightLambdaNm > 0.0 ? 1.2 : 0.45);
      for (int m = -3; m <= 3; m += 1) {
        float thetaM;
        if (m == 0) {
          thetaM = uMode > 0.5 ? thetaI : -thetaI;
        } else {
          float sinM = float(m) * lambda / d - sin(thetaI);
          if (abs(sinM) > 1.0) {
            continue;
          }
          thetaM = asin(sinM);
        }
        vec3 diffracted = normalize(tangent * sin(thetaM) + n * cos(thetaM));
        float lobe = orderLobe(viewDir, diffracted) * weight;
        if (m == 0) {
          color += lobe * vec3(0.92, 0.94, 0.98);
        } else {
          color += lobe * rgb;
        }
      }
    }
    color = min(color, vec3(1.4));
    gl_FragColor = vec4(color, uMode > 0.5 ? 0.72 : 1.0);
  }
`;

export function createGratingMaterial(spec = {}) {
  const material = new ShaderMaterial({
    uniforms: {
      uLinesPerMm: { value: spec.linesPerMm ?? 600 },
      uBlazeDeg: { value: spec.blazeDeg ?? 17.45 },
      uMode: { value: spec.mode === 'transmit' ? 1 : 0 },
      uViewPos: { value: new Vector3(0, 1, 6) },
      uLightDir: { value: new Vector3(0, -0.2, -1) },
      uLightLambdaNm: { value: spec.lambdaNm ?? 0 },
      uLightOn: { value: spec.lightOn ?? 0.35 },
      uTime: { value: 0 },
      uBase: { value: new Color(0x2a3038) },
    },
    vertexShader,
    fragmentShader,
    side: DoubleSide,
    transparent: spec.mode === 'transmit',
  });
  material.userData.gratingMaterial = true;
  return material;
}

export function syncGratingMaterial(material, spec = {}) {
  if (!material?.uniforms) {
    return material;
  }
  if (spec.linesPerMm != null) {
    material.uniforms.uLinesPerMm.value = spec.linesPerMm;
  }
  if (spec.blazeDeg != null) {
    material.uniforms.uBlazeDeg.value = spec.blazeDeg;
  }
  if (spec.mode != null) {
    material.uniforms.uMode.value = spec.mode === 'transmit' ? 1 : 0;
    material.transparent = spec.mode === 'transmit';
  }
  if (spec.lambdaNm != null) {
    material.uniforms.uLightLambdaNm.value = spec.lambdaNm;
  }
  if (spec.lightOn != null) {
    material.uniforms.uLightOn.value = spec.lightOn;
  }
  return material;
}
