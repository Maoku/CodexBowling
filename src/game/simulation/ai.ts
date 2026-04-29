import type { ThrowParams } from "../types";
import { RIVAL_TUNING } from "../content/tuning";

interface RivalProfile {
  name: string;
  accuracy: number;
  power: number;
  curveBias: number;
  risk: number;
}

export const RIVAL_PROFILES: RivalProfile[] = [
  {
    name: "Rinka",
    accuracy: RIVAL_TUNING.accuracy,
    power: RIVAL_TUNING.power,
    curveBias: RIVAL_TUNING.curveBias,
    risk: RIVAL_TUNING.baseRisk,
  },
];

export function createRivalThrow(frameIndex: number, throwIndex: number): ThrowParams {
  const rival = RIVAL_PROFILES[0];
  const pressure = frameIndex * RIVAL_TUNING.pressurePerFrame + throwIndex * RIVAL_TUNING.pressurePerThrow;
  const randomCentered = Math.random() - 0.5;
  const wobble = randomCentered * (1 - rival.accuracy) * RIVAL_TUNING.wobbleScale;
  const riskPush = Math.random() < rival.risk + pressure ? RIVAL_TUNING.riskPush : 0;

  return {
    laneOffset: clamp(
      RIVAL_TUNING.laneAimCenterMeters + (Math.random() - 0.5) * RIVAL_TUNING.laneRandomRangeMeters,
      -RIVAL_TUNING.laneLimitMeters,
      RIVAL_TUNING.laneLimitMeters,
    ),
    angle: clamp(
      RIVAL_TUNING.baseAngleRadians + wobble + riskPush * RIVAL_TUNING.riskAngleScale,
      -RIVAL_TUNING.angleLimitRadians,
      RIVAL_TUNING.angleLimitRadians,
    ),
    power: clamp(
      rival.power + riskPush + (Math.random() - 0.5) * RIVAL_TUNING.powerRandomRange,
      RIVAL_TUNING.minPower,
      RIVAL_TUNING.maxPower,
    ),
    curve: clamp(
      rival.curveBias + (Math.random() - 0.5) * RIVAL_TUNING.curveRandomRange,
      -RIVAL_TUNING.curveLimit,
      RIVAL_TUNING.curveLimit,
    ),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
