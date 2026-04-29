import { SAFE_BALL_LANE_OFFSET } from "../game/content/bowlingDimensions";
import { FRAME_COUNT } from "../game/simulation/scoring";
import type { BowlerId, MatchSnapshot, ThrowParams } from "../game/types";

const ASSET_PATH = "./assets/";

export type PerformanceAction = "idle" | "throw" | "strike" | "spare" | "gutter" | "victory" | "defeat";
export type TimingStage = "ready" | "power" | "curve";

export interface PerformanceState {
  bowler: BowlerId;
  action: PerformanceAction;
  quote: string;
  sequence: number;
}

interface HudCallbacks {
  onThrow: () => void;
  onReset: () => void;
  onLaneChange: (value: number) => void;
  onAngleChange: (value: number) => void;
  onPowerChange: (value: number) => void;
  onCurveChange: (value: number) => void;
}

export class Hud {
  private root: HTMLElement;
  private callbacks: HudCallbacks;
  private throwButton!: HTMLButtonElement;
  private resetButton!: HTMLButtonElement;
  private laneInput!: HTMLInputElement;
  private angleInput!: HTMLInputElement;
  private powerInput!: HTMLInputElement;
  private curveInput!: HTMLInputElement;
  private message!: HTMLElement;
  private quoteText!: HTMLElement;
  private frameInfo!: HTMLElement;
  private scoreGrid!: HTMLElement;
  private activeBowler!: HTMLElement;
  private lastResult!: HTMLElement;
  private performanceSprite!: HTMLElement;
  private performanceBowler!: HTMLElement;
  private resultOverlay!: HTMLElement;
  private resultTitle!: HTMLElement;
  private resultImage!: HTMLImageElement;
  private resultCopy!: HTMLElement;
  private lastPerformanceSequence = -1;

  constructor(root: HTMLElement, callbacks: HudCallbacks) {
    this.root = root;
    this.callbacks = callbacks;
    this.renderShell();
  }

  update(
    snapshot: MatchSnapshot,
    params: ThrowParams,
    scoreLabels: { player: string[]; rival: string[] },
    performance: PerformanceState,
    timingStage: TimingStage,
  ): void {
    this.laneInput.value = String(params.laneOffset);
    this.angleInput.value = String(params.angle);
    this.powerInput.value = String(params.power);
    this.curveInput.value = String(params.curve);

    this.message.textContent = snapshot.message;
    this.quoteText.textContent = performance.quote;
    this.frameInfo.textContent = `Frame ${Math.min(snapshot.activeFrame + 1, FRAME_COUNT)} / ${FRAME_COUNT}`;
    this.activeBowler.textContent = snapshot.activeBowler === "player" ? "Player Turn" : "Rival Turn";
    this.throwButton.disabled = snapshot.phase !== "aiming" || snapshot.activeBowler !== "player";
    this.throwButton.textContent = buttonTextForTiming(timingStage);
    this.powerInput.disabled = snapshot.activeBowler === "player";
    this.curveInput.disabled = snapshot.activeBowler === "player";
    this.resetButton.textContent = snapshot.phase === "matchComplete" ? "New Match" : "Reset";
    this.lastResult.textContent = snapshot.lastResult
      ? `${snapshot.lastResult.knockedPins} pins / standing ${snapshot.lastResult.standingPins.length}`
      : "Ready";

    this.scoreGrid.innerHTML = "";
    this.scoreGrid.appendChild(this.scoreRow("Mao", scoreLabels.player, snapshot.playerScore.total));
    this.scoreGrid.appendChild(this.scoreRow("Rinka", scoreLabels.rival, snapshot.rivalScore.total));

    this.updatePerformanceSprites(performance);
    this.updateResultOverlay(snapshot);

    this.root.dataset.phase = snapshot.phase;
    this.root.dataset.turn = snapshot.activeBowler;
  }

  private renderShell(): void {
    this.root.innerHTML = `
      <section class="top-strip" aria-live="polite">
        <div>
          <p class="eyebrow">Nyanko Strike Rivals</p>
          <h1>5-Frame Duel</h1>
        </div>
        <div class="turn-chip">
          <span id="active-bowler">Player Turn</span>
          <strong id="frame-info">Frame 1 / 5</strong>
        </div>
      </section>

      <aside class="character-card heroine-card">
        <img src="${ASSET_PATH}player-bowler-portrait.png" alt="Mao, pink-haired cat-ear bowler" />
        <div>
          <span>Mao</span>
          <strong>Competitive cat-ear bowler</strong>
        </div>
      </aside>

      <aside class="character-card rival-card">
        <img src="${ASSET_PATH}rival-bowler-portrait.png" alt="Rinka, rival bowler with ponytail" />
        <div>
          <span>Rival</span>
          <strong>Rinka, precision stylist</strong>
        </div>
      </aside>

      <section class="performance-window" aria-live="polite">
        <div class="performance-header">
          <span>Action Cut</span>
          <strong id="performance-bowler">Mao</strong>
        </div>
        <div id="sprite-stage" class="sprite-stage player idle" aria-label="Current bowler action animation"></div>
        <p id="quote-text" class="quote-text">Ready.</p>
      </section>

      <section class="score-panel">
        <div id="score-grid" class="score-grid"></div>
        <p id="last-result" class="last-result">Ready</p>
      </section>

      <section class="control-panel">
        <p id="message" class="message">レーンを読んで、最初の一投を決めよう。</p>
        <label>
          <span>Lane</span>
          <input id="lane-input" type="range" min="${-SAFE_BALL_LANE_OFFSET}" max="${SAFE_BALL_LANE_OFFSET}" step="0.005" value="0" />
        </label>
        <label>
          <span>Angle</span>
          <input id="angle-input" type="range" min="-0.35" max="0.35" step="0.005" value="0" />
        </label>
        <label>
          <span>Power</span>
          <input id="power-input" type="range" min="0.35" max="1" step="0.01" value="0.7" />
        </label>
        <label>
          <span>Curve</span>
          <input id="curve-input" type="range" min="-0.6" max="0.6" step="0.01" value="0" />
        </label>
        <div class="button-row">
          <button id="throw-button" type="button">Start Speed</button>
          <button id="reset-button" type="button">Reset</button>
        </div>
        <p class="hint">A/D: lane, Left/Right: angle, Space: timing</p>
      </section>

      <section id="result-overlay" class="result-overlay" hidden>
        <div class="result-card">
          <img id="result-image" src="${ASSET_PATH}result-win-v2.png" alt="Match result illustration" />
          <div class="result-copy">
            <span>Result</span>
            <h2 id="result-title">Victory</h2>
            <p id="result-copy">ふたりの勝負が決着しました。</p>
            <button id="result-reset-button" type="button">New Match</button>
          </div>
        </div>
      </section>
    `;

    this.throwButton = this.root.querySelector("#throw-button")!;
    this.resetButton = this.root.querySelector("#reset-button")!;
    this.laneInput = this.root.querySelector("#lane-input")!;
    this.angleInput = this.root.querySelector("#angle-input")!;
    this.powerInput = this.root.querySelector("#power-input")!;
    this.curveInput = this.root.querySelector("#curve-input")!;
    this.message = this.root.querySelector("#message")!;
    this.quoteText = this.root.querySelector("#quote-text")!;
    this.frameInfo = this.root.querySelector("#frame-info")!;
    this.scoreGrid = this.root.querySelector("#score-grid")!;
    this.activeBowler = this.root.querySelector("#active-bowler")!;
    this.lastResult = this.root.querySelector("#last-result")!;
    this.performanceSprite = this.root.querySelector("#sprite-stage")!;
    this.performanceBowler = this.root.querySelector("#performance-bowler")!;
    this.resultOverlay = this.root.querySelector("#result-overlay")!;
    this.resultTitle = this.root.querySelector("#result-title")!;
    this.resultImage = this.root.querySelector("#result-image")!;
    this.resultCopy = this.root.querySelector("#result-copy")!;

    this.throwButton.addEventListener("click", this.callbacks.onThrow);
    this.resetButton.addEventListener("click", this.callbacks.onReset);
    this.root.querySelector("#result-reset-button")!.addEventListener("click", this.callbacks.onReset);
    this.laneInput.addEventListener("input", () => this.callbacks.onLaneChange(Number(this.laneInput.value)));
    this.angleInput.addEventListener("input", () => this.callbacks.onAngleChange(Number(this.angleInput.value)));
    this.powerInput.addEventListener("input", () => this.callbacks.onPowerChange(Number(this.powerInput.value)));
    this.curveInput.addEventListener("input", () => this.callbacks.onCurveChange(Number(this.curveInput.value)));
  }

  private scoreRow(name: string, labels: string[], total: number): HTMLElement {
    const row = document.createElement("div");
    row.className = "score-row";
    const cells = labels.map((label) => `<span>${label}</span>`).join("");
    row.innerHTML = `<strong>${name}</strong>${cells}<b>${total}</b>`;
    return row;
  }

  private updatePerformanceSprites(performance: PerformanceState): void {
    this.performanceBowler.textContent = performance.bowler === "player" ? "Mao" : "Rinka";
    this.performanceSprite.className = `sprite-stage ${performance.bowler} ${performance.action}`;

    if (performance.sequence === this.lastPerformanceSequence) return;
    this.lastPerformanceSequence = performance.sequence;
    this.performanceSprite.style.animation = "none";
    void this.performanceSprite.offsetWidth;
    this.performanceSprite.style.animation =
      performance.action === "throw" ? "spriteThrow 1150ms steps(1) forwards" : "";
  }

  private updateResultOverlay(snapshot: MatchSnapshot): void {
    const isComplete = snapshot.phase === "matchComplete";
    this.resultOverlay.hidden = !isComplete;
    this.resultOverlay.style.display = isComplete ? "grid" : "none";
    if (!isComplete) return;

    const playerWon = snapshot.playerScore.total >= snapshot.rivalScore.total;
    this.resultImage.src = playerWon ? `${ASSET_PATH}result-win-v2.png` : `${ASSET_PATH}result-lose-v2.png`;
    this.resultTitle.textContent = playerWon ? "Victory" : "Rival Wins";
    this.resultCopy.textContent = playerWon
      ? "最後まで集中した一投が、勝負を決めました。"
      : "今日はリンカが一枚上手。次のレーンで取り返しましょう。";
  }
}

function buttonTextForTiming(stage: TimingStage): string {
  if (stage === "power") return "Lock Speed";
  if (stage === "curve") return "Lock Curve";
  return "Start Speed";
}
