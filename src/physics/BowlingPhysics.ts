import RAPIER from "@dimforge/rapier3d-compat";
import {
  BALL_RADIUS,
  BALL_START_Z,
  BOWLING_DIMENSIONS,
  HEAD_PIN_Z,
  LANE_CENTER_Z,
  LANE_HALF_WIDTH,
  PIN_MAX_RADIUS,
  PIN_ROW_Z_SPACING,
} from "../game/content/bowlingDimensions";
import { PHYSICS_TUNING } from "../game/content/tuning";
import type { ThrowParams } from "../game/types";

export interface PhysicsPinSnapshot {
  id: number;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number; w: number };
  down: boolean;
}

export interface PhysicsSnapshot {
  ball: {
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number; w: number };
  };
  pins: PhysicsPinSnapshot[];
  ballSpeed: number;
}

interface PinBody {
  id: number;
  body: RAPIER.RigidBody;
  start: { x: number; y: number; z: number };
}

export class BowlingPhysics {
  private world: RAPIER.World;
  private ball: RAPIER.RigidBody;
  private pins: PinBody[] = [];
  private lastThrowStartedAt = 0;
  private hasRolled = false;

  private constructor(world: RAPIER.World, ball: RAPIER.RigidBody) {
    this.world = world;
    this.ball = ball;
  }

  static async create(): Promise<BowlingPhysics> {
    await RAPIER.init();
    const world = new RAPIER.World({ x: 0, y: PHYSICS_TUNING.gravityY, z: 0 });
    const ball = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(0, BALL_RADIUS + PHYSICS_TUNING.ballRestHeightMeters, BALL_START_Z)
        .setLinearDamping(PHYSICS_TUNING.ballLinearDamping)
        .setAngularDamping(PHYSICS_TUNING.ballAngularDamping),
    );
    world.createCollider(
      RAPIER.ColliderDesc.ball(BALL_RADIUS)
        .setMass(BOWLING_DIMENSIONS.ballMassKg)
        .setFriction(PHYSICS_TUNING.ballFriction)
        .setRestitution(PHYSICS_TUNING.ballRestitution),
      ball,
    );

    const physics = new BowlingPhysics(world, ball);
    physics.createLane();
    physics.createPins();
    return physics;
  }

  resetRack(): void {
    this.resetBall(0);
    this.pins.forEach((pin) => {
      pin.body.setTranslation(pin.start, true);
      pin.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      pin.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      pin.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    });
    this.hasRolled = false;
  }

  resetBall(laneOffset: number): void {
    this.ball.setTranslation({ x: laneOffset, y: BALL_RADIUS + PHYSICS_TUNING.ballRestHeightMeters, z: BALL_START_Z }, true);
    this.ball.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    this.ball.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.ball.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.hasRolled = false;
  }

  clearDownedPins(standingPinIds: number[]): void {
    const standing = new Set(standingPinIds);
    this.pins.forEach((pin) => {
      if (standing.has(pin.id)) return;
      pin.body.setTranslation({ x: pin.start.x, y: -4, z: pin.start.z }, true);
      pin.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      pin.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      pin.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    });
  }

  roll(params: ThrowParams): void {
    this.resetBall(params.laneOffset);
    const speed = PHYSICS_TUNING.throwBaseSpeedMetersPerSecond + params.power * PHYSICS_TUNING.throwPowerSpeedMetersPerSecond;
    const side = Math.sin(params.angle) * speed + params.curve * PHYSICS_TUNING.throwCurveSideVelocity;
    const forward = -Math.cos(params.angle) * speed;
    this.ball.setLinvel({ x: side, y: 0, z: forward }, true);
    this.ball.setAngvel({
      x: PHYSICS_TUNING.ballBackspinBase + params.power * PHYSICS_TUNING.ballBackspinPerPower,
      y: params.curve * PHYSICS_TUNING.ballCurveSpinY,
      z: params.curve * PHYSICS_TUNING.ballCurveSpinZ,
    }, true);
    this.lastThrowStartedAt = performance.now();
    this.hasRolled = true;
  }

  step(): void {
    this.world.step();
    if (!this.hasRolled) return;

    const velocity = this.ball.linvel();
    const curveInfluence = this.ball.angvel().y * PHYSICS_TUNING.curveImpulseFromSpin;
    if (
      Math.abs(curveInfluence) > PHYSICS_TUNING.curveImpulseMinimum &&
      this.ball.translation().z > HEAD_PIN_Z + PHYSICS_TUNING.curveStopsBeforeHeadPinMeters
    ) {
      this.ball.applyImpulse({ x: curveInfluence, y: 0, z: 0 }, true);
    }
    if (
      this.ball.translation().z < HEAD_PIN_Z + PHYSICS_TUNING.pitSlowdownStartsAfterHeadPinMeters ||
      this.ball.translation().y < PHYSICS_TUNING.pitFallY
    ) {
      this.ball.setLinvel({
        x: velocity.x * PHYSICS_TUNING.pitSlowdownMultiplier,
        y: velocity.y,
        z: velocity.z * PHYSICS_TUNING.pitSlowdownMultiplier,
      }, true);
    }
  }

  snapshot(): PhysicsSnapshot {
    const ballPosition = this.ball.translation();
    const ballRotation = this.ball.rotation();
    const ballVelocity = this.ball.linvel();

    return {
      ball: {
        position: ballPosition,
        rotation: ballRotation,
      },
      pins: this.pins.map((pin) => {
        const position = pin.body.translation();
        const rotation = pin.body.rotation();
        return {
          id: pin.id,
          position,
          rotation,
          down: isPinDown(position, rotation),
        };
      }),
      ballSpeed: Math.hypot(ballVelocity.x, ballVelocity.y, ballVelocity.z),
    };
  }

  standingPins(): number[] {
    return this.snapshot()
      .pins.filter((pin) => !pin.down)
      .map((pin) => pin.id);
  }

  isSettled(): boolean {
    if (!this.hasRolled) return false;
    const elapsed = performance.now() - this.lastThrowStartedAt;
    if (elapsed < PHYSICS_TUNING.settleMinimumMs) return false;

    const ballVelocity = this.ball.linvel();
    const ballSlow = Math.hypot(ballVelocity.x, ballVelocity.y, ballVelocity.z) < PHYSICS_TUNING.settledBallSpeed;
    const pinsSlow = this.pins.every((pin) => {
      const velocity = pin.body.linvel();
      const angular = pin.body.angvel();
      return (
        Math.hypot(velocity.x, velocity.y, velocity.z) < PHYSICS_TUNING.settledPinLinearSpeed &&
        Math.hypot(angular.x, angular.y, angular.z) < PHYSICS_TUNING.settledPinAngularSpeed
      );
    });

    return elapsed > PHYSICS_TUNING.settleMaximumMs || (ballSlow && pinsSlow);
  }

  private createLane(): void {
    const lane = RAPIER.RigidBodyDesc.fixed().setTranslation(0, PHYSICS_TUNING.laneSurfaceY, LANE_CENTER_Z);
    const laneBody = this.world.createRigidBody(lane);
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(
        BOWLING_DIMENSIONS.laneWidth / 2,
        PHYSICS_TUNING.laneColliderHalfHeightMeters,
        BOWLING_DIMENSIONS.laneEndFromFoulLine / 2,
      ).setFriction(PHYSICS_TUNING.laneFriction),
      laneBody,
    );

    const gutterX = LANE_HALF_WIDTH + BOWLING_DIMENSIONS.gutterWidth / 2;
    const leftGutter = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(-gutterX, PHYSICS_TUNING.gutterSurfaceY, LANE_CENTER_Z));
    const rightGutter = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(gutterX, PHYSICS_TUNING.gutterSurfaceY, LANE_CENTER_Z));
    this.world.createCollider(createGutterCollider(), leftGutter);
    this.world.createCollider(createGutterCollider(), rightGutter);

    const sideWallOffset = LANE_HALF_WIDTH + BOWLING_DIMENSIONS.gutterWidth + PHYSICS_TUNING.sideWallExtraOffsetMeters;
    const leftSideWall = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(-sideWallOffset, PHYSICS_TUNING.sideWallY, LANE_CENTER_Z));
    const rightSideWall = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(sideWallOffset, PHYSICS_TUNING.sideWallY, LANE_CENTER_Z));
    this.world.createCollider(createLowSideWall(), leftSideWall);
    this.world.createCollider(createLowSideWall(), rightSideWall);

    const pitZ = -BOWLING_DIMENSIONS.laneEndFromFoulLine - PHYSICS_TUNING.pitZOffsetMeters;
    const pit = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, PHYSICS_TUNING.pitY, pitZ));
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(
        PHYSICS_TUNING.pitHalfWidthMeters,
        PHYSICS_TUNING.pitHalfHeightMeters,
        PHYSICS_TUNING.pitHalfDepthMeters,
      ).setFriction(PHYSICS_TUNING.pitFriction),
      pit,
    );

    const pitBack = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(0, PHYSICS_TUNING.pitBackYOffsetMeters, pitZ - PHYSICS_TUNING.pitBackZOffsetMeters),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(
        PHYSICS_TUNING.pitHalfWidthMeters,
        PHYSICS_TUNING.pitBackHalfHeightMeters,
        PHYSICS_TUNING.pitBackHalfDepthMeters,
      ).setRestitution(PHYSICS_TUNING.pitBackRestitution),
      pitBack,
    );
  }

  private createPins(): void {
    const rows = [1, 2, 3, 4];
    let id = 1;

    rows.forEach((count, row) => {
      for (let col = 0; col < count; col += 1) {
        const x = (col - (count - 1) / 2) * BOWLING_DIMENSIONS.pinSpacing;
        const z = HEAD_PIN_Z - row * PIN_ROW_Z_SPACING;
        const start = { x, y: BOWLING_DIMENSIONS.pinHeight / 2 + PHYSICS_TUNING.pinRestHeightMeters, z };
        const body = this.world.createRigidBody(
          RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(start.x, start.y, start.z)
            .setLinearDamping(PHYSICS_TUNING.pinLinearDamping)
            .setAngularDamping(PHYSICS_TUNING.pinAngularDamping),
        );
        this.world.createCollider(
          RAPIER.ColliderDesc.cylinder(BOWLING_DIMENSIONS.pinHeight / 2, PIN_MAX_RADIUS)
            .setMass(BOWLING_DIMENSIONS.pinMassKg)
            .setFriction(PHYSICS_TUNING.pinFriction)
            .setRestitution(PHYSICS_TUNING.pinRestitution),
          body,
        );
        this.pins.push({ id, body, start });
        id += 1;
      }
    });
  }
}

function createGutterCollider(): RAPIER.ColliderDesc {
  return RAPIER.ColliderDesc.cuboid(
    BOWLING_DIMENSIONS.gutterWidth / 2,
    PHYSICS_TUNING.gutterColliderHalfHeightMeters,
    BOWLING_DIMENSIONS.laneEndFromFoulLine / 2,
  ).setFriction(PHYSICS_TUNING.gutterFriction);
}

function createLowSideWall(): RAPIER.ColliderDesc {
  return RAPIER.ColliderDesc.cuboid(
    PHYSICS_TUNING.sideWallHalfWidthMeters,
    PHYSICS_TUNING.sideWallHalfHeightMeters,
    BOWLING_DIMENSIONS.laneEndFromFoulLine / 2,
  ).setFriction(PHYSICS_TUNING.sideWallFriction);
}

function isPinDown(
  position: { y: number },
  rotation: { x: number; z: number },
): boolean {
  const upY = 1 - 2 * (rotation.x * rotation.x + rotation.z * rotation.z);
  return upY < PHYSICS_TUNING.pinUprightThreshold || position.y < BOWLING_DIMENSIONS.pinHeight * PHYSICS_TUNING.pinDownHeightRatio;
}
