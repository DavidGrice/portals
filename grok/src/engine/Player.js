import { Vector3 } from 'three';
import { collectColliders, resolveColliders, resolveGround } from './colliders.js';

export class Player {
  constructor({
    camera,
    eyeHeight = 1,
    radius = 0.28,
    moveSpeed = 4,
    gravity = 20,
    jumpSpeed = 6.5,
  } = {}) {
    this.camera = camera;
    this.eyeHeight = eyeHeight;
    this.radius = radius;
    this.moveSpeed = moveSpeed;
    this.gravity = gravity;
    this.jumpSpeed = jumpSpeed;
    this.velocity = new Vector3();
    this.onGround = true;
    this.supportY = 0;
  }

  jump() {
    if (!this.onGround) {
      return false;
    }
    this.velocity.y = this.jumpSpeed;
    this.onGround = false;
    return true;
  }

  step(dt, move, controls, room = null) {
    const forward = Number(move?.forward ?? 0) - Number(move?.back ?? 0);
    const right = Number(move?.right ?? 0) - Number(move?.left ?? 0);
    if (controls) {
      const distance = this.moveSpeed * dt;
      controls.moveForward(forward * distance);
      controls.moveRight(right * distance);
    }

    const colliders = room ? collectColliders(room) : [];
    if (colliders.length) {
      resolveColliders(this.camera.position, this, colliders);
    }

    const prevY = this.camera.position.y;
    this.velocity.y -= this.gravity * dt;
    this.camera.position.y += this.velocity.y * dt;

    if (colliders.length) {
      resolveGround(this.camera.position, this, colliders, prevY);
      return;
    }

    this.supportY = 0;
    const floorY = this.eyeHeight;
    if (this.velocity.y <= 0 && this.camera.position.y <= floorY) {
      this.camera.position.y = floorY;
      this.velocity.y = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }
  }
}
