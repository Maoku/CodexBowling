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
    const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    const ball = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(0, BALL_RADIUS + 0.015, BALL_START_Z)
        .setLinearDamping(0.24)
        .setAngularDamping(0.12),
    );
    world.createCollider(
      RAPIER.ColliderDesc.ball(BALL_RADIUS)
        .setMass(BOWLING_DIMENSIONS.ballMassKg)
        .setFriction(0.62)
        .setRestitution(0.2),
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
    this.ball.setTranslation({ x: laneOffset, y: BALL_RADIUS + 0.015, z: BALL_START_Z }, true);
    this.ball.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    this.ball.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.ball.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.hasRolled = false;
  }

  roll(params: ThrowParams): void {
    this.resetBall(params.laneOffset);
    const speed = 6.5 + params.power * 4.5;
    const side = Math.sin(params.angle) * speed + params.curve * 0.45;
    const forward = -Math.cos(params.angle) * speed;
    this.ball.setLinvel({ x: side, y: 0, z: forward }, true);
    this.ball.setAngvel({ x: -38 - params.power * 32, y: params.curve * 6, z: -params.curve * 10 }, true);
    this.lastThrowStartedAt = performance.now();
    this.hasRolled = true;
  }

  step(): void {
    this.world.step();
    if (!this.hasRolled) return;

    const velocity = this.ball.linvel();
    const curveInfluence = this.ball.angvel().y * 0.0008;
    if (Math.abs(curveInfluence) > 0.0001 && this.ball.translation().z > HEAD_PIN_Z + 1.5) {
      this.ball.applyImpulse({ x: curveInfluence, y: 0, z: 0 }, true);
    }
    if (this.ball.translation().z < HEAD_PIN_Z - 1.2 || this.ball.translation().y < -0.5) {
      this.ball.setLinvel({ x: velocity.x * 0.94, y: velocity.y, z: velocity.z * 0.94 }, true);
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
    if (elapsed < 1800) return false;

    const ballVelocity = this.ball.linvel();
    const ballSlow = Math.hypot(ballVelocity.x, ballVelocity.y, ballVelocity.z) < 0.3;
    const pinsSlow = this.pins.every((pin) => {
      const velocity = pin.body.linvel();
      const angular = pin.body.angvel();
      return Math.hypot(velocity.x, velocity.y, velocity.z) < 0.18 && Math.hypot(angular.x, angular.y, angular.z) < 0.28;
    });

    return elapsed > 4800 || (ballSlow && pinsSlow);
  }

  private createLane(): void {
    const lane = RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.04, LANE_CENTER_Z);
    const laneBody = this.world.createRigidBody(lane);
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(
        BOWLING_DIMENSIONS.laneWidth / 2,
        0.04,
        BOWLING_DIMENSIONS.laneEndFromFoulLine / 2,
      ).setFriction(0.5),
      laneBody,
    );

    const gutterX = LANE_HALF_WIDTH + BOWLING_DIMENSIONS.gutterWidth / 2;
    const leftGutter = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(-gutterX, -0.16, LANE_CENTER_Z));
    const rightGutter = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(gutterX, -0.16, LANE_CENTER_Z));
    this.world.createCollider(createGutterCollider(), leftGutter);
    this.world.createCollider(createGutterCollider(), rightGutter);

    const sideWallOffset = LANE_HALF_WIDTH + BOWLING_DIMENSIONS.gutterWidth + 0.04;
    const leftSideWall = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(-sideWallOffset, -0.02, LANE_CENTER_Z));
    const rightSideWall = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(sideWallOffset, -0.02, LANE_CENTER_Z));
    this.world.createCollider(createLowSideWall(), leftSideWall);
    this.world.createCollider(createLowSideWall(), rightSideWall);

    const pitZ = -BOWLING_DIMENSIONS.laneEndFromFoulLine - 0.8;
    const pit = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.28, pitZ));
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(1.15, 0.08, 0.85).setFriction(0.95), pit);

    const pitBack = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, 0.12, pitZ - 1.05));
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(1.15, 0.28, 0.08).setRestitution(0.05), pitBack);
  }

  private createPins(): void {
    const rows = [1, 2, 3, 4];
    let id = 1;

    rows.forEach((count, row) => {
      for (let col = 0; col < count; col += 1) {
        const x = (col - (count - 1) / 2) * BOWLING_DIMENSIONS.pinSpacing;
        const z = HEAD_PIN_Z - row * PIN_ROW_Z_SPACING;
        const start = { x, y: BOWLING_DIMENSIONS.pinHeight / 2 + 0.01, z };
        const body = this.world.createRigidBody(
          RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(start.x, start.y, start.z)
            .setLinearDamping(0.08)
            .setAngularDamping(0.08),
        );
        this.world.createCollider(
          RAPIER.ColliderDesc.cylinder(BOWLING_DIMENSIONS.pinHeight / 2, PIN_MAX_RADIUS)
            .setMass(BOWLING_DIMENSIONS.pinMassKg)
            .setFriction(0.74)
            .setRestitution(0.38),
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
    0.04,
    BOWLING_DIMENSIONS.laneEndFromFoulLine / 2,
  ).setFriction(0.86);
}

function createLowSideWall(): RAPIER.ColliderDesc {
  return RAPIER.ColliderDesc.cuboid(0.035, 0.12, BOWLING_DIMENSIONS.laneEndFromFoulLine / 2).setFriction(0.8);
}

function isPinDown(
  position: { y: number },
  rotation: { x: number; z: number },
): boolean {
  const upY = 1 - 2 * (rotation.x * rotation.x + rotation.z * rotation.z);
  return upY < 0.72 || position.y < BOWLING_DIMENSIONS.pinHeight * 0.34;
}
