import type { BowlerScore, FrameState, ThrowResult } from "../types";

export const FRAME_COUNT = 5;
export const PIN_COUNT = 10;

export function createScore(): BowlerScore {
  return {
    frames: Array.from({ length: FRAME_COUNT }, () => ({
      throws: [],
      complete: false,
    })),
    total: 0,
  };
}

export function pinsKnockedThisThrow(previousStanding: number[], currentStanding: number[]): number {
  return previousStanding.filter((pin) => !currentStanding.includes(pin)).length;
}

export function makeThrowResult(
  knockedPins: number,
  standingPins: number[],
  frame: FrameState,
): ThrowResult {
  const framePinsBeforeThrow = PIN_COUNT - frame.throws.reduce((sum, value) => sum + value, 0);
  const isStrike = frame.throws.length === 0 && knockedPins === PIN_COUNT;
  const isSpare = !isStrike && knockedPins === framePinsBeforeThrow;

  return {
    knockedPins,
    standingPins,
    isStrike,
    isSpare,
  };
}

export function applyThrow(score: BowlerScore, frameIndex: number, result: ThrowResult): BowlerScore {
  const frames = score.frames.map((frame) => ({
    throws: [...frame.throws],
    complete: frame.complete,
  }));
  const frame = frames[frameIndex];

  frame.throws.push(result.knockedPins);
  frame.complete = result.isStrike || result.isSpare || frame.throws.length >= 2;

  return {
    frames,
    total: calculatePrototypeTotal(frames),
  };
}

export function frameLabel(frame: FrameState): string {
  if (frame.throws.length === 0) return "-";
  if (frame.throws[0] === PIN_COUNT) return "X";
  if (frame.throws.length === 2 && frame.throws[0] + frame.throws[1] === PIN_COUNT) {
    return `${frame.throws[0]} /`;
  }
  return frame.throws.join(" ");
}

function calculatePrototypeTotal(frames: FrameState[]): number {
  return frames.reduce((total, frame) => {
    const raw = frame.throws.reduce((sum, value) => sum + value, 0);
    if (frame.throws[0] === PIN_COUNT) return total + raw + 5;
    if (frame.throws.length === 2 && raw === PIN_COUNT) return total + raw + 2;
    return total + raw;
  }, 0);
}
