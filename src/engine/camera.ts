import type { CameraState, InputState, PlayerState, Vec2 } from './types';

const SWIVEL_SPEED_DEG_PER_SEC = 95;
const ANGLE_LERP_SPEED = 10;
const FOLLOW_SPEED = 7.5;
const AIM_LOOKAHEAD_PX = 42;
const VELOCITY_LEAN_SEC = 0.12;
const TILT_LERP_SPEED = 8;

function normalizeAngleDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

function shortestAngleDeltaDeg(fromDeg: number, toDeg: number): number {
  return ((toDeg - fromDeg + 540) % 360) - 180;
}

export function createCameraState(): CameraState {
  return {
    x: 0,
    y: 0,
    angleDeg: 0,
    targetAngleDeg: 0,
    tiltScale: 1.0,
    layerSpacing: 2.0,
    shakeMag: 0,
    shakeTimer: 0,
  };
}

export function setCameraTargetAngle(camera: CameraState, angleDeg: number): void {
  camera.targetAngleDeg = normalizeAngleDeg(angleDeg);
}

export function triggerCameraShake(
  camera: CameraState,
  magnitude: number,
  duration: number,
): void {
  if (magnitude <= 0 || duration <= 0) return;
  camera.shakeMag = Math.max(camera.shakeMag, magnitude);
  camera.shakeTimer = Math.max(camera.shakeTimer, duration);
}

export function updateCamera(
  camera: CameraState,
  player: PlayerState,
  input: InputState,
  dt: number,
): void {
  if (dt <= 0) return;

  // Manual Q/E camera swivel
  if (input.swivelDir !== 0) {
    camera.targetAngleDeg = normalizeAngleDeg(
      camera.targetAngleDeg + input.swivelDir * SWIVEL_SPEED_DEG_PER_SEC * dt,
    );
  }

  // Smooth shortest-arc rotation toward targetAngleDeg
  const angleT = 1 - Math.exp(-ANGLE_LERP_SPEED * dt);
  const angleDelta = shortestAngleDeltaDeg(camera.angleDeg, camera.targetAngleDeg);
  camera.angleDeg = normalizeAngleDeg(camera.angleDeg + angleDelta * angleT);

  // Follow player with aim look-ahead and subtle velocity lean
  const aimRad = (player.aimAngle * Math.PI) / 180;
  const lookAheadX = Math.sin(aimRad) * AIM_LOOKAHEAD_PX;
  const lookAheadY = -Math.cos(aimRad) * AIM_LOOKAHEAD_PX;

  const targetX = player.x + lookAheadX + player.vx * VELOCITY_LEAN_SEC;
  const targetY = player.y + lookAheadY + player.vy * VELOCITY_LEAN_SEC;

  const followT = 1 - Math.exp(-FOLLOW_SPEED * dt);
  camera.x += (targetX - camera.x) * followT;
  camera.y += (targetY - camera.y) * followT;

  // Dynamic tilt: subtle layerSpacing scale modulation from movement speed & dodge-roll
  const speed = Math.hypot(player.vx, player.vy);
  const speedFactor = Math.min(1, speed / 320);
  const targetTilt = player.dodgeTimer > 0 ? 0.92 : 1.0 + speedFactor * 0.14;
  const tiltT = 1 - Math.exp(-TILT_LERP_SPEED * dt);
  camera.tiltScale += (targetTilt - camera.tiltScale) * tiltT;

  // Screen shake decay
  if (camera.shakeTimer > 0) {
    camera.shakeTimer = Math.max(0, camera.shakeTimer - dt);
    if (camera.shakeTimer === 0) {
      camera.shakeMag = 0;
    }
  }
}

export function worldToScreen(
  wx: number,
  wy: number,
  camera: CameraState,
  viewW: number,
  viewH: number,
): Vec2 {
  const dx = wx - camera.x;
  const dy = wy - camera.y;
  const camRad = (camera.angleDeg * Math.PI) / 180;
  const cos = Math.cos(camRad);
  const sin = Math.sin(camRad);

  const rx = dx * cos - dy * sin;
  const ry = dx * sin + dy * cos;

  let shakeX = 0;
  let shakeY = 0;
  if (camera.shakeTimer > 0 && camera.shakeMag > 0) {
    shakeX = Math.sin(camera.shakeTimer * 97.3) * camera.shakeMag;
    shakeY = Math.cos(camera.shakeTimer * 131.7) * camera.shakeMag;
  }

  return {
    x: viewW * 0.5 + rx + shakeX,
    y: viewH * 0.5 + ry + shakeY,
  };
}

export function screenToWorld(
  sx: number,
  sy: number,
  camera: CameraState,
  viewW: number,
  viewH: number,
): Vec2 {
  const dx = sx - viewW * 0.5;
  const dy = sy - viewH * 0.5;
  const camRad = (-camera.angleDeg * Math.PI) / 180;
  const cos = Math.cos(camRad);
  const sin = Math.sin(camRad);

  const wx = dx * cos - dy * sin + camera.x;
  const wy = dx * sin + dy * cos + camera.y;
  return { x: wx, y: wy };
}
