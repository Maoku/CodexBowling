import { MATCH_TEXT, isSplitResult, matchSplitResultLine } from "../content/text";
import type { BowlerId, MatchPhase, MatchSnapshot, ThrowResult } from "../types";
import { applyThrow, createScore, FRAME_COUNT, frameLabel } from "./scoring";

export class MatchState {
  private activeBowler: BowlerId = "player";
  private activeFrame = 0;
  private phase: MatchPhase = "aiming";
  private playerScore = createScore();
  private rivalScore = createScore();
  private message: string = MATCH_TEXT.opening;
  private lastResult: ThrowResult | undefined;

  get snapshot(): MatchSnapshot {
    return {
      activeBowler: this.activeBowler,
      activeFrame: this.activeFrame,
      phase: this.phase,
      playerScore: this.playerScore,
      rivalScore: this.rivalScore,
      message: this.message,
      lastResult: this.lastResult,
    };
  }

  get currentThrowIndex(): number {
    return this.currentScore.frames[this.activeFrame]?.throws.length ?? 0;
  }

  get currentFrameComplete(): boolean {
    return this.currentScore.frames[this.activeFrame]?.complete ?? true;
  }

  beginThrow(): void {
    if (this.phase !== "aiming") return;
    this.phase = "rolling";
    this.message = this.activeBowler === "player" ? MATCH_TEXT.playerRolling : MATCH_TEXT.rivalRolling;
  }

  beginSettling(): void {
    if (this.phase !== "rolling") return;
    this.phase = "settling";
    this.message = MATCH_TEXT.settling;
  }

  applyResult(result: ThrowResult): void {
    this.lastResult = result;
    if (this.activeBowler === "player") {
      this.playerScore = applyThrow(this.playerScore, this.activeFrame, result);
    } else {
      this.rivalScore = applyThrow(this.rivalScore, this.activeFrame, result);
    }

    const reaction = isSplitResult(result)
      ? matchSplitResultLine(this.activeBowler, result)
      : this.activeBowler === "player"
        ? result.isStrike
          ? MATCH_TEXT.strike
          : result.isSpare
            ? MATCH_TEXT.spare
            : MATCH_TEXT.playerResult(result.knockedPins)
        : MATCH_TEXT.rivalResult(result.knockedPins);
    this.phase = "showingResult";
    this.message = reaction;
  }

  advanceTurn(): void {
    if (this.phase === "matchComplete") return;

    if (!this.currentFrameComplete) {
      this.phase = "aiming";
      this.message = this.activeBowler === "player" ? MATCH_TEXT.playerSecondThrow : MATCH_TEXT.rivalSecondThrow;
      return;
    }

    if (this.activeBowler === "player") {
      this.activeBowler = "rival";
      this.phase = "aiming";
      this.message = MATCH_TEXT.rivalTurn;
      return;
    }

    this.activeBowler = "player";
    this.activeFrame += 1;
    if (this.activeFrame >= FRAME_COUNT) {
      this.phase = "matchComplete";
      this.message = this.resultMessage();
      return;
    }

    this.phase = "aiming";
    this.message = MATCH_TEXT.frameStart(this.activeFrame + 1);
  }

  reset(): void {
    this.activeBowler = "player";
    this.activeFrame = 0;
    this.phase = "aiming";
    this.playerScore = createScore();
    this.rivalScore = createScore();
    this.message = MATCH_TEXT.reset;
    this.lastResult = undefined;
  }

  scoreLabels(scoreOwner: BowlerId): string[] {
    const score = scoreOwner === "player" ? this.playerScore : this.rivalScore;
    return score.frames.map(frameLabel);
  }

  private get currentScore() {
    return this.activeBowler === "player" ? this.playerScore : this.rivalScore;
  }

  private resultMessage(): string {
    if (this.playerScore.total > this.rivalScore.total) return MATCH_TEXT.playerWin;
    if (this.playerScore.total < this.rivalScore.total) return MATCH_TEXT.rivalWin;
    return MATCH_TEXT.draw;
  }
}
