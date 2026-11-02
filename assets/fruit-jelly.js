import * as T from './three.module.min.js';

// Each gel primitive carries its bind-space half extents and cheek pigment weight.
// Positions, the optical volume and the trapped air all inherit the same squash matrix.
const geometryGLSL = `
varying vec3 gelRest;
varying vec4 gelVolume;
uniform mat4 modelViewMatrix;
uniform mat3 normalMatrix;
uniform mat4 projectionMatrix;
uniform vec3 gelSky;
#ifdef GEL_ARENA
uniform sampler2D gelSceneColor;
uniform sampler2D gelSceneDepth;
#endif

vec2 gelProject(vec3 p) {
  vec4 clip = projectionMatrix * vec4(p, 1.0);
  return 0.5 + 0.5 * clip.xy / max(clip.w, 0.001);
}

float gelViewZ(float depth) {
  float z = 2.0 * depth - 1.0;
  return (projectionMatrix[3][2] - z * projectionMatrix[3][3])
       / max(0.00001, z * projectionMatrix[2][3] - projectionMatrix[2][2]);
}

vec3 gelBackdrop(vec3 entry, vec3 exitPoint, vec3 exitDirection, float path, float blur) {
  #ifdef GEL_ARENA
    vec2 original = gelProject(entry);
    vec2 first = gelProject(exitPoint);
    float depth = texture2D(gelSceneDepth, clamp(first, 0.001, 0.999)).r;
    // Continue through the exit interface toward the nearest background depth.
    float travel = exitDirection.z < -0.1
      ? clamp((gelViewZ(depth) - exitPoint.z) / exitDirection.z, 0.0, min(1.25, 1.02*path)) : 0.0;
    vec2 bent = mix(original,gelProject(exitPoint + exitDirection * travel),0.92);
    vec2 border = min(bent, 1.0 - bent);
    float onScreen = smoothstep(0.0, 0.025, min(border.x, border.y));
    vec2 uv = clamp(bent, 0.001, 0.999);
    if (texture2D(gelSceneDepth, uv).r < gl_FragCoord.z - 0.00012) uv = original;
    vec4 behind = textureLod(gelSceneColor, uv, blur);
    vec3 sky = mix(gelSky, vec3(0.96, 0.98, 1.0), 0.16);
    return mix(sky, behind.rgb + sky * (1.0 - behind.a), onScreen);
  #else
    return gelSky;
  #endif
}

float gelSoftbox(vec3 r, vec3 axis, vec2 size) {
  vec3 across = normalize(cross(vec3(0.,1.,0.), axis));
  vec2 card = vec2(dot(r,across), dot(r,cross(axis,across))) / size;
  float profile = 0.68*exp(-2.5*dot(card,card)) + 0.32*(1.0-smoothstep(0.26,0.96,length(card)));
  return profile * smoothstep(0.8,0.94,dot(r,axis));
}

// Intersect the in-volume ray with a small air pocket. Highlights and attenuation
// depend on its depth, so it shifts relative to the wet surface as the camera moves.
vec3 gelBubble(vec3 light, vec4 pocket, vec3 ray, float path, vec3 extinction, vec3 keyDir) {
  float ray2 = dot(ray,ray);
  float t = dot(pocket.xyz-gelRest,ray) / ray2;
  vec3 offset = gelRest + ray*t - pocket.xyz;
  float r2 = dot(offset,offset) / (pocket.w*pocket.w);
  float aa = clamp(fwidth(r2),0.04,0.7);
  float mask = 1.0-smoothstep(1.0-aa,1.0+aa,r2);
  if (mask <= 0.0 || t <= 0.0 || t >= path) return light;
  float cap = sqrt(max(0.0,1.0-r2));
  vec3 bubbleNormal = normalize(normalMatrix * (offset/pocket.w - normalize(ray)*cap));
  float rim = pow(1.0-cap,1.6);
  float shine = pow(max(0.0,dot(bubbleNormal,keyDir)),12.0);
  vec3 visibility = mask * exp(-extinction*t);
  return light + visibility * (vec3(0.75,0.91,1.)*(0.25*rim+0.70*shine)-light*(0.12+0.15*rim));
}
`;

// A low-frequency molded surface remains anchored to the body. Compression and shear
// deepen the ripple in the optical normal; replaying the same pose gives the same lens.
const surfaceGLSL = `
  float strain = abs(length(modelViewMatrix[1].xyz) / max(0.01,length(modelViewMatrix[0].xyz)) - 1.0);
  float tilt = dot(normalize(modelViewMatrix[0].xyz),normalize(modelViewMatrix[1].xyz));
  vec3 waveA = vec3(3.7,6.6,-2.5), waveB = vec3(-4.9,2.1,4.2);
  vec3 slope = 0.012*waveA*cos(dot(gelRest,waveA)+3.8*tilt)
             + 0.008*waveB*sin(dot(gelRest,waveB)-2.9*tilt);
  vec3 bend = normalMatrix*slope*(0.78+min(1.35,2.2*strain+abs(tilt)))*(1.0-0.65*max(gelVolume.w,0.0));
  normal = normalize(normal - bend + normal*dot(normal,bend));
`;

const volumeGLSL = `
  vec3 gelIncident = -geometryViewDir;
  vec3 gelInside = refract(gelIncident, normal, 1.0 / material.ior);
  vec3 radii = max(gelVolume.xyz, vec3(0.018));
  // Analytic exit on an ellipsoid fitted to this piece of gel. normalMatrix
  // transposed is the view-to-local direction transform, including nonuniform scale.
  vec3 localRay = gelInside * normalMatrix;
  vec3 unitRay = localRay / radii;
  vec3 unitEntry = normalize((normal * mat3(modelViewMatrix)) * radii);
  float path = clamp(-2.0*dot(unitEntry,unitRay)/dot(unitRay,unitRay), 0.012, 3.2);
  vec3 exitNormal = normalize(normalMatrix * ((unitEntry + unitRay*path) / radii));
  vec3 gelExitRay = refract(gelInside, -exitNormal, material.ior);
  float exitCos = saturate(dot(gelInside,exitNormal));
  float escape = smoothstep(0.0,0.22,1.0-material.ior*material.ior*(1.0-exitCos*exitCos));
  gelExitRay = normalize(mix(gelInside,gelExitRay,0.78*escape));
  float milk = max(0.0,gelVolume.w);
  float facing = saturate(dot(normal,geometryViewDir));
  float fresnel = 0.025 + 0.975*pow(1.0-facing,5.0);

  vec3 dye = clamp(diffuseColor.rgb,0.026,0.985);
  vec3 absorb = -log(dye) * 1.12 + vec3(0.052);
  vec3 scatter = (0.40 + 1.85*milk) * mix(vec3(0.36),sqrt(dye),0.64);
  vec3 extinction = absorb + scatter;
  vec3 throughput = exp(-extinction * path);
  vec3 incoming = vec3(0.12) + 0.67*reflectedLight.indirectDiffuse/max(diffuseColor.rgb,vec3(0.025));
  vec3 focusedLight = vec3(0.0);
  vec3 keyDir = normalize(vec3(-0.46,0.74,0.5));
  #if NUM_DIR_LIGHTS > 0
    vec3 halfDir = directionalLights[0].direction + geometryViewDir;
    keyDir = halfDir * inversesqrt(max(dot(halfDir,halfDir),0.0001));
    for (int i=0; i<NUM_DIR_LIGHTS; i++) {
      vec3 L = directionalLights[i].direction;
      float nL = dot(normal,L);
      float wrap = smoothstep(-0.6,1.0,nL);
      float back = smoothstep(-0.15,0.94,-dot(L,geometryViewDir));
      vec3 through = exp(-extinction*path*(0.18+0.38*max(-nL,0.0)));
      float farLobe = pow(saturate(dot(normal,normalize(0.36*geometryViewDir-L))),4.0);
      focusedLight += directionalLights[i].color * farLobe*farLobe * (0.075+0.12*back);
      incoming += directionalLights[i].color *
        (vec3(0.045+0.36*wrap*wrap) + through*(back*(0.25+0.31*pow(1.0-facing,1.2))+0.29*farLobe));
    }
  #endif
  vec3 behind = gelBackdrop(geometryPosition, geometryPosition+gelInside*path, gelExitRay,path,
                            0.2+0.73*path+1.45*milk);
  vec3 source = incoming * scatter / extinction * (1.0 - throughput);
  source *= mix(vec3(1.0),pow(dye,vec3(0.56)),0.86-0.43*milk);
  float backEnergy = dot(behind,vec3(0.22,0.68,0.10));
  source += dye*(1.0-exp(-0.84*path))*(0.16+0.49*backEnergy)*(1.0-0.60*milk);
  source *= 1.0-0.17*milk;
  vec3 volumeLight = source + behind*throughput + focusedLight*dye*exp(-absorb*path*0.60)*(1.0-0.7*milk);
  if (gelVolume.w >= 0.0) {
    volumeLight = gelBubble(volumeLight,vec4(-0.34,1.27,-0.34,0.057),localRay,path,extinction,keyDir);
    volumeLight = gelBubble(volumeLight,vec4(-0.42,1.37,-0.24,0.032),localRay,path,extinction,keyDir);
    volumeLight = gelBubble(volumeLight,vec4( 0.34,1.10,-0.37,0.051),localRay,path,extinction,keyDir);
    volumeLight = gelBubble(volumeLight,vec4( 0.47,1.29, 0.20,0.063),localRay,path,extinction,keyDir);
    volumeLight = gelBubble(volumeLight,vec4(-0.41,0.97, 0.25,0.038),localRay,path,extinction,keyDir);
  }
  vec3 refl = inverseTransformDirection(reflect(gelIncident,normal),viewMatrix);
  float key = gelSoftbox(refl,normalize(vec3(-0.54,0.73,0.42)),vec2(0.46,0.165));
  float strip = gelSoftbox(refl,normalize(vec3(0.74,0.40,-0.55)),vec2(0.13,0.48));
  float wetEdge = gelSoftbox(refl,normalize(vec3(-0.89,0.05,-0.44)),vec2(0.16,0.61));
  vec3 reflectionLight = mix(gelSky*0.24,vec3(1.0,0.97,0.90),smoothstep(-0.1,1.0,refl.y))*0.87
       + key*vec3(8.4,7.9,7.3) + strip*vec3(4.75,5.35,5.8) + wetEdge*vec3(5.8,6.6,6.9);
  totalDiffuse = volumeLight*(1.0-fresnel);
  totalSpecular += reflectionLight*fresnel*(1.0-0.30*milk);
  #ifndef GEL_ARENA
    // Studio cutouts leave room for their actual UI or Canvas background.
    float open = clamp(dot(throughput,vec3(0.36,0.41,0.23))*0.94,0.015,0.58)*(1.0-fresnel);
    diffuseColor.a = 1.0-open;
    totalDiffuse = max(vec3(0.0),totalDiffuse-gelSky*open)/diffuseColor.a;
    totalSpecular /= diffuseColor.a;
  #endif
`;

export function createJellyMaterial(target = null, sky = new T.Color('#d9e6f4')) {
  const material = new T.MeshPhysicalMaterial({
    // The arena shader has already composited the scene behind the surface.
    // Portraits instead retain alpha for the unknown background of the cutout.
    name: 'Fruit gel volume',
    vertexColors: true,
    transparent: !target,
    depthWrite: true,
    metalness: 0,
    roughness: 0.21,
    ior: 1.365,
    clearcoat: 0.72,
    clearcoatRoughness: 0.12,
  });
  if (target) material.defines.GEL_ARENA = 1;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.gelSky = { value: sky };
    if (target) {
      shader.uniforms.gelSceneColor = { value: target.texture };
      shader.uniforms.gelSceneDepth = { value: target.depthTexture };
    }
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute vec4 gelOptics; varying vec4 gelVolume; varying vec3 gelRest;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\ngelRest = position; gelVolume = gelOptics;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <transmission_pars_fragment>', geometryGLSL)
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + surfaceGLSL)
      .replace('#include <transmission_fragment>', volumeGLSL);
  };
  return material;
}
