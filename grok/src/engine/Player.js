import { Vector3 } from 'three';

export class Player {
  constructor({
    camera,
    eyeHeight = 1,
    moveSpeed = 4,
    gravity = 20,
    jumpSpeed = 6.5,
  } = {}) {
    this.camera = camera;
    this.eyeHeight = eyeHeight;
    this.moveSpeed = moveSpeed;
    this.gravity = gravity;
    this.jumpSpeed = jumpSpeed;
    this.velocity = new Vector3();
    this.onGround = true;
  }

  jump() {
    if (!this.onGround) {
      return false;
    }
    this.velocity.y = this.jumpSpeed;
    this.onGround = false;
    return true;
  }

  step(dt, move, controls) {
    const forward = Number(Boolean(move.forward)) - Number(Boolean(move.back));
    const right = Number(Boolean(move.right)) - Number(Boolean(move.left));
    if (controls) {
      controls.moveForward(forward * this.moveSpeed * dt);
      controls.moveRight(right * this.moveSpeed * dt);
    }

    this.velocity.y -= this.gravity * dt;
    this.camera.position.y += this.velocity.y * dt;

    if (this.camera.position.y <= this.eyeHeight) {
      this.camera.position.y = this.eyeHeight;
      this.velocity.y = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }
  }
}
