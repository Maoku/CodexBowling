import type { ThrowParams } from "../types";
import { SAFE_BALL_LANE_OFFSET } from "../content/bowlingDimensions";
import { INPUT_TUNING } from "../content/tuning";

export class ThrowInput {
  private params: ThrowParams = {
    laneOffset: INPUT_TUNING.defaultLaneOffset,
    angle: INPUT_TUNING.defaultAngleRadians,
    power: INPUT_TUNING.defaultPower,
    curve: INPUT_TUNING.defaultCurve,
  };

  constructor() {
    window.addEventListener("keydown", (event) => {
      if (event.key.toLowerCase() === "a") this.nudgeLane(-INPUT_TUNING.keyboardLaneStepMeters);
      if (event.key.toLowerCase() === "d") this.nudgeLane(INPUT_TUNING.keyboardLaneStepMeters);
      if (event.key === "ArrowLeft") this.nudgeAngle(-INPUT_TUNING.keyboardAngleStepRadians);
      if (event.key === "ArrowRight") this.nudgeAngle(INPUT_TUNING.keyboardAngleStepRadians);
    });
  }

  get value(): ThrowParams {
    return { ...this.params };
  }

  setLaneOffset(value: number): void {
    this.params.laneOffset = clamp(value, -SAFE_BALL_LANE_OFFSET, SAFE_BALL_LANE_OFFSET);
  }

  setAngle(value: number): void {
    this.params.angle = clamp(value, INPUT_TUNING.minAngleRadians, INPUT_TUNING.maxAngleRadians);
  }

  setPower(value: number): void {
    this.params.power = clamp(value, INPUT_TUNING.minPower, INPUT_TUNING.maxPower);
  }

  setCurve(value: number): void {
    this.params.curve = clamp(value, INPUT_TUNING.minCurve, INPUT_TUNING.maxCurve);
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
