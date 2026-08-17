import { ShaderMaterial, Vector2, WebGLRenderTarget } from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { CopyShader } from 'three/addons/shaders/CopyShader.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

function fullscreenMaterial(shader) {
  return new ShaderMaterial({
    uniforms: {
      tDiffuse: { value: null },
      resolution: { value: new Vector2(1, 1) },
      opacity: { value: 1 },
    },
    vertexShader: shader.vertexShader,
    fragmentShader: shader.fragmentShader,
    depthTest: false,
    depthWrite: false,
  });
}

// Portal stencil must render into a target that has a stencil buffer. The
// FXAA/SMAA blit then happens to the default framebuffer — never run the
// portal pass through EffectComposer.
export class PostAA {
  constructor(renderer) {
    this.renderer = renderer;
    this.mode = 'off';
    this._width = 1;
    this._height = 1;
    this._pixelRatio = 1;
    this._target = null;
    this._fxaa = new FullScreenQuad(fullscreenMaterial(FXAAShader));
    this._copy = new FullScreenQuad(fullscreenMaterial(CopyShader));
    this._smaa = new SMAAPass();
    this._smaa.renderToScreen = true;
  }

  get active() {
    return this.mode !== 'off';
  }

  setMode(mode) {
    this.mode = mode === 'fxaa' || mode === 'smaa' || mode === 'supersample2x' ? mode : 'off';
    this._ensureTarget();
    return this;
  }

  setSize(width, height, pixelRatio = 1) {
    this._width = Math.max(1, width);
    this._height = Math.max(1, height);
    this._pixelRatio = pixelRatio;
    this._ensureTarget();
    return this;
  }

  begin() {
    if (!this.active) {
      this.renderer.setRenderTarget(null);
      return;
    }
    this._ensureTarget();
    this.renderer.setRenderTarget(this._target);
  }

  end() {
    if (!this.active || !this._target) {
      this.renderer.setRenderTarget(null);
      return;
    }

    const { renderer } = this;
    const { depth, stencil, color } = renderer.state.buffers;
    color.setMask(true);
    depth.setTest(false);
    depth.setMask(false);
    stencil.setTest(false);

    if (this.mode === 'smaa') {
      this._smaa.render(renderer, null, this._target);
      return;
    }

    const material = this.mode === 'fxaa' ? this._fxaa.material : this._copy.material;
    material.uniforms.tDiffuse.value = this._target.texture;
    if (material.uniforms.resolution) {
      material.uniforms.resolution.value.set(1 / this._target.width, 1 / this._target.height);
    }
    renderer.setRenderTarget(null);
    if (this.mode === 'fxaa') {
      this._fxaa.render(renderer);
    } else {
      this._copy.render(renderer);
    }
  }

  dispose() {
    this._target?.dispose();
    this._fxaa.dispose();
    this._copy.dispose();
    this._smaa.dispose();
  }

  _ensureTarget() {
    if (!this.active) {
      return;
    }
    const scale = this.mode === 'supersample2x' ? 2 : 1;
    const width = Math.max(1, Math.round(this._width * this._pixelRatio * scale));
    const height = Math.max(1, Math.round(this._height * this._pixelRatio * scale));
    if (!this._target) {
      this._target = new WebGLRenderTarget(width, height, {
        depthBuffer: true,
        stencilBuffer: true,
      });
      this._target.texture.name = 'PostAA.color';
    } else if (this._target.width !== width || this._target.height !== height) {
      this._target.setSize(width, height);
    }
    this._smaa.setSize(width, height);
  }
}
