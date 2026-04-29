export type BowlerId = "player" | "rival";

export type MatchPhase =
  | "aiming"
  | "rolling"
  | "settling"
  | "showingResult"
  | "matchComplete";

export interface ThrowParams {
  laneOffset: number;
  angle: number;
  power: number;
  curve: number;
}

export interface ThrowResult {
  knockedPins: number;
  standingPins: number[];
  isStrike: boolean;
  isSpare: boolean;
}

export interface FrameState {
  throws: number[];
  complete: boolean;
}

export interface BowlerScore {
  frames: FrameState[];
  total: number;
}

export interface MatchSnapshot {
  activeBowler: BowlerId;
  activeFrame: number;
  phase: MatchPhase;
  playerScore: BowlerScore;
  rivalScore: BowlerScore;
  message: string;
  lastResult?: ThrowResult;
}
