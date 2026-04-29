import type { ThrowParams } from "../types";
import { SAFE_BALL_LANE_OFFSET } from "../content/bowlingDimensions";

export class ThrowInput {
  private params: ThrowParams = {
    laneOffset: 0,
    angle: 0,
    power: 0.7,
    curve: 0,
  };

  constructor() {
    window.addEventListener("keydown", (event) => {
      if (event.key.toLowerCase() === "a") this.nudgeLane(-0.08);
      if (event.key.toLowerCase() === "d") this.nudgeLane(0.08);
      if (event.key === "ArrowLeft") this.nudgeAngle(-0.015);
      if (event.key === "ArrowRight") this.nudgeAngle(0.015);
    });
  }

  get value(): ThrowParams {
    return { ...this.params };
  }

  setLaneOffset(value: number): void {
    this.params.laneOffset = clamp(value, -SAFE_BALL_LANE_OFFSET, SAFE_BALL_LANE_OFFSET);
  }

  setAngle(value: number): void {
    this.params.angle = clamp(value, -0.35, 0.35);
  }

  setPower(value: number): void {
    this.params.power = clamp(value, 0.35, 1);
  }

  setCurve(value: number): void {
    this.params.curve = clamp(value, -0.6, 0.6);
  }

  nudgeLane(delta: number): void {
    this.setLaneOffset(this.params.laneOffset + delta);
  }

  nudgeAngle(delta: number): void {
    this.setAngle(this.params.angle + delta);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
