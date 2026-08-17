import { WebGLRenderer } from 'three';

export function createPortalRenderer() {
  const renderer = new WebGLRenderer({ antialias: true, stencil: true });
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
  return renderer;
}

export async function probeCapabilities() {
  const webgpuApi = typeof navigator !== 'undefined' && Boolean(navigator.gpu);
  let adapter = null;
  let features = [];
  let adapterLabel = null;

  if (webgpuApi) {
    try {
      adapter = await Promise.race([
        navigator.gpu.requestAdapter(),
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error('WebGPU adapter timed out')), 1500);
        }),
      ]);
      if (adapter) {
        features = [...adapter.features].sort();
        const info = adapter.info ?? {};
        adapterLabel = [info.vendor, info.architecture, info.device].filter(Boolean).join(' ') || null;
      }
    } catch {
      adapter = null;
    }
  }

  return {
    webgpuApi,
    webgpu: Boolean(adapter),
    features,
    adapterLabel,
    portalBackend: 'webgl',
    reason: adapter
      ? 'WebGPU adapter found. Portal stencil still runs on WebGL.'
      : webgpuApi
        ? 'WebGPU API present but no adapter. Portal stencil runs on WebGL.'
        : 'WebGPU not available. Portal stencil runs on WebGL.',
  };
}
