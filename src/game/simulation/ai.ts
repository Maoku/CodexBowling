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
    accuracy: 0.91,
    power: 0.84,
    curveBias: -0.035,
    risk: 0.11,
  },
];

export function createRivalThrow(frameIndex: number, throwIndex: number): ThrowParams {
  const rival = RIVAL_PROFILES[0];
  const pressure = frameIndex * 0.025 + throwIndex * 0.02;
  const wobble = (Math.random() - 0.5) * (1 - rival.accuracy) * 0.36;
  const riskPush = Math.random() < rival.risk + pressure ? 0.055 : 0;

  return {
    laneOffset: clamp(-0.08 + (Math.random() - 0.5) * 0.2, -0.8, 0.8),
    angle: clamp(0.035 + wobble + riskPush * 0.25, -0.28, 0.28),
    power: clamp(rival.power + riskPush + (Math.random() - 0.5) * 0.045, 0.5, 1),
    curve: clamp(rival.curveBias + (Math.random() - 0.5) * 0.12, -0.45, 0.45),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
