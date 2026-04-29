import type { BowlerId, MatchPhase, MatchSnapshot, ThrowResult } from "../types";
import { applyThrow, createScore, FRAME_COUNT, frameLabel } from "./scoring";

export class MatchState {
  private activeBowler: BowlerId = "player";
  private activeFrame = 0;
  private phase: MatchPhase = "aiming";
  private playerScore = createScore();
  private rivalScore = createScore();
  private message = "レーンを読んで、最初の一投を決めよう。";
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
    this.message = this.activeBowler === "player" ? "ナイスショットを狙え！" : "ライバルが投球中...";
  }

  beginSettling(): void {
    if (this.phase === "rolling") {
      this.phase = "settling";
      this.message = "ピンの行方を見守ろう。";
    }
  }

  applyResult(result: ThrowResult): void {
    this.lastResult = result;
    if (this.activeBowler === "player") {
      this.playerScore = applyThrow(this.playerScore, this.activeFrame, result);
    } else {
      this.rivalScore = applyThrow(this.rivalScore, this.activeFrame, result);
    }

    const reaction = result.isStrike
      ? "ストライク！レーンが一瞬止まったみたい。"
      : result.isSpare
        ? "スペア！最後まで諦めない一投。"
        : `${result.knockedPins}本。次で拾いにいこう。`;
    this.phase = "showingResult";
    this.message = this.activeBowler === "player" ? reaction : `ライバルは${result.knockedPins}本倒した。`;
  }

  advanceTurn(): void {
    if (this.phase === "matchComplete") return;

    if (!this.currentFrameComplete) {
      this.phase = "aiming";
      this.message = this.activeBowler === "player" ? "残りピンを狙ってもう一投。" : "ライバルの二投目。";
      return;
    }

    if (this.activeBowler === "player") {
      this.activeBowler = "rival";
      this.phase = "aiming";
      this.message = "ライバルの番。投球フォームを観察しよう。";
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
    this.message = `第${this.activeFrame + 1}フレーム。流れをつかもう。`;
  }

  reset(): void {
    this.activeBowler = "player";
    this.activeFrame = 0;
    this.phase = "aiming";
    this.playerScore = createScore();
    this.rivalScore = createScore();
    this.message = "新しい勝負。深呼吸して一投目へ。";
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
    if (this.playerScore.total > this.rivalScore.total) return "勝利！猫耳ボウラーの集中力が上回った。";
    if (this.playerScore.total < this.rivalScore.total) return "惜敗。ライバルが今日は一枚上手だった。";
    return "引き分け。次の勝負で決着をつけよう。";
  }
}
