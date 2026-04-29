import type { ThrowParams } from "../types";

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
    accuracy: 0.78,
    power: 0.72,
    curveBias: -0.05,
    risk: 0.2,
  },
];

export function createRivalThrow(frameIndex: number, throwIndex: number): ThrowParams {
  const rival = RIVAL_PROFILES[0];
  const pressure = frameIndex * 0.04 + throwIndex * 0.03;
  const wobble = (Math.random() - 0.5) * (1 - rival.accuracy) * 0.5;
  const riskPush = Math.random() < rival.risk + pressure ? 0.12 : 0;

  return {
    laneOffset: clamp((Math.random() - 0.5) * 0.5, -0.8, 0.8),
    angle: clamp(wobble + riskPush * 0.35, -0.28, 0.28),
    power: clamp(rival.power + riskPush + (Math.random() - 0.5) * 0.08, 0.5, 1),
    curve: clamp(rival.curveBias + (Math.random() - 0.5) * 0.22, -0.45, 0.45),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
