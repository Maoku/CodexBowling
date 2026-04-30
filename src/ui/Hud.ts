import { SAFE_BALL_LANE_OFFSET } from "../game/content/bowlingDimensions";
import { ASSET_PATHS, CHARACTER_TEXT, UI_TEXT, bowlerDisplayName } from "../game/content/text";
import { INPUT_TUNING, UI_TUNING } from "../game/content/tuning";
import { FRAME_COUNT } from "../game/simulation/scoring";
import type { BowlerId, MatchSnapshot, ThrowParams } from "../game/types";

const assetUrl = (filename: string) => `${ASSET_PATHS.root}${filename}`;

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
  private resultScoreGrid!: HTMLElement;
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
    this.root.style.setProperty("--meter-power", `${meterPercent(params.power, INPUT_TUNING.minPower, INPUT_TUNING.maxPower)}%`);
    this.root.style.setProperty("--meter-curve", `${meterPercent(params.curve, INPUT_TUNING.minCurve, INPUT_TUNING.maxCurve)}%`);

    this.message.textContent = snapshot.message;
    this.quoteText.textContent = performance.quote;
    this.frameInfo.textContent = `Frame ${Math.min(snapshot.activeFrame + 1, FRAME_COUNT)} / ${FRAME_COUNT}`;
    this.activeBowler.textContent = snapshot.activeBowler === "player" ? "Player Turn" : "Rival Turn";
    this.throwButton.disabled = snapshot.phase !== "aiming" || snapshot.activeBowler !== "player";
    this.throwButton.textContent = buttonTextForTiming(timingStage);
    this.powerInput.disabled = snapshot.activeBowler === "player";
    this.curveInput.disabled = snapshot.activeBowler === "player";
    this.lastResult.textContent = snapshot.lastResult
      ? `${snapshot.lastResult.knockedPins} pins / standing ${snapshot.lastResult.standingPins.length}`
      : "Ready";

    this.scoreGrid.innerHTML = "";
    this.scoreGrid.appendChild(this.scoreRow(CHARACTER_TEXT.playerName, scoreLabels.player, snapshot.playerScore.total));
    this.scoreGrid.appendChild(this.scoreRow(CHARACTER_TEXT.rivalName, scoreLabels.rival, snapshot.rivalScore.total));

    this.updatePerformanceSprites(performance);
    this.updateResultOverlay(snapshot, scoreLabels);

    this.root.dataset.phase = snapshot.phase;
    this.root.dataset.turn = snapshot.activeBowler;
    this.root.dataset.result = resultEffectName(snapshot);
  }

  private renderShell(): void {
    this.root.innerHTML = `
      <section class="top-strip" aria-live="polite">
        <div>
          <p class="eyebrow">${UI_TEXT.eyebrow}</p>
          <h1>${UI_TEXT.title}</h1>
        </div>
        <div class="status-stack">
          <div class="turn-chip">
            <span id="active-bowler">${UI_TEXT.playerTurn}</span>
            <strong id="frame-info">Frame 1 / 5</strong>
          </div>
        </div>
      </section>

      <aside class="character-card heroine-card">
        <img src="${assetUrl(ASSET_PATHS.playerPortrait)}" alt="${CHARACTER_TEXT.playerPortraitAlt}" />
        <div>
          <span>${CHARACTER_TEXT.playerCardRole}</span>
          <strong>${CHARACTER_TEXT.playerCardDescription}</strong>
        </div>
      </aside>

      <aside class="character-card rival-card">
        <img src="${assetUrl(ASSET_PATHS.rivalPortrait)}" alt="${CHARACTER_TEXT.rivalPortraitAlt}" />
        <div>
          <span>${CHARACTER_TEXT.rivalCardRole}</span>
          <strong>${CHARACTER_TEXT.rivalCardDescription}</strong>
        </div>
      </aside>

      <section class="performance-window" aria-live="polite">
        <div class="performance-header">
          <span>${UI_TEXT.actionCut}</span>
          <strong id="performance-bowler">${CHARACTER_TEXT.playerName}</strong>
        </div>
        <div id="sprite-stage" class="sprite-stage player idle" aria-label="Current bowler action animation"></div>
        <p id="quote-text" class="quote-text">${UI_TEXT.ready}</p>
      </section>

      <section class="score-panel">
        <div id="score-grid" class="score-grid"></div>
        <p id="last-result" class="last-result">${UI_TEXT.ready}</p>
      </section>

      <section class="control-panel">
        <p id="message" class="message">レーンを読んで、最初の一投を決めよう。</p>
        <label>
          <span>${UI_TEXT.laneLabel}</span>
          <input id="lane-input" type="range" min="${-SAFE_BALL_LANE_OFFSET}" max="${SAFE_BALL_LANE_OFFSET}" step="0.005" value="${INPUT_TUNING.defaultLaneOffset}" />
        </label>
        <label>
          <span>${UI_TEXT.angleLabel}</span>
          <input id="angle-input" type="range" min="${INPUT_TUNING.minAngleRadians}" max="${INPUT_TUNING.maxAngleRadians}" step="0.005" value="${INPUT_TUNING.defaultAngleRadians}" />
        </label>
        <label>
          <span>${UI_TEXT.powerLabel}</span>
          <input id="power-input" type="range" min="${INPUT_TUNING.minPower}" max="${INPUT_TUNING.maxPower}" step="0.01" value="${INPUT_TUNING.defaultPower}" />
        </label>
        <label>
          <span>${UI_TEXT.curveLabel}</span>
          <input id="curve-input" type="range" min="${INPUT_TUNING.minCurve}" max="${INPUT_TUNING.maxCurve}" step="0.01" value="${INPUT_TUNING.defaultCurve}" />
        </label>
        <div class="button-row">
          <button id="throw-button" class="throw-button" type="button">${UI_TEXT.buttonStartSpeed}</button>
        </div>
        <p class="hint">${UI_TEXT.controlsHint}</p>
      </section>

      <section id="result-overlay" class="result-overlay" hidden>
        <div class="result-card">
          <img id="result-image" src="${assetUrl(ASSET_PATHS.resultWin)}" alt="${UI_TEXT.resultImageAlt}" />
          <div class="result-copy">
            <span>${UI_TEXT.result}</span>
            <h2 id="result-title">${UI_TEXT.victory}</h2>
            <p id="result-copy">ふたりの勝負が決着しました。</p>
            <div id="result-score-grid" class="result-score-grid"></div>
            <button id="result-reset-button" type="button">${UI_TEXT.newMatch}</button>
          </div>
        </div>
      </section>
    `;

    this.throwButton = this.root.querySelector("#throw-button")!;
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
    this.resultScoreGrid = this.root.querySelector("#result-score-grid")!;

    this.throwButton.addEventListener("click", this.callbacks.onThrow);
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
    this.performanceBowler.textContent = bowlerDisplayName(performance.bowler);
    this.performanceSprite.className = `sprite-stage ${performance.bowler} ${performance.action}`;

    if (performance.sequence === this.lastPerformanceSequence) return;
    this.lastPerformanceSequence = performance.sequence;
    this.performanceSprite.style.animation = "none";
    void this.performanceSprite.offsetWidth;
    this.performanceSprite.style.animation =
      performance.action === "throw" ? `spriteThrow ${UI_TUNING.spriteThrowAnimationMs}ms steps(1) forwards` : "";
  }

  private updateResultOverlay(snapshot: MatchSnapshot, scoreLabels: { player: string[]; rival: string[] }): void {
    const isComplete = snapshot.phase === "matchComplete";
    this.resultOverlay.hidden = !isComplete;
    this.resultOverlay.style.display = isComplete ? "grid" : "none";
    if (!isComplete) return;

    const playerWon = snapshot.playerScore.total >= snapshot.rivalScore.total;
    this.resultImage.src = assetUrl(playerWon ? ASSET_PATHS.resultWin : ASSET_PATHS.resultLose);
    this.resultTitle.textContent = playerWon ? UI_TEXT.victory : UI_TEXT.rivalWins;
    this.resultCopy.textContent = playerWon ? UI_TEXT.resultWinCopy : UI_TEXT.resultLoseCopy;
    this.resultScoreGrid.innerHTML = "";
    this.resultScoreGrid.appendChild(this.scoreRow(CHARACTER_TEXT.playerName, scoreLabels.player, snapshot.playerScore.total));
    this.resultScoreGrid.appendChild(this.scoreRow(CHARACTER_TEXT.rivalName, scoreLabels.rival, snapshot.rivalScore.total));
  }
}

function buttonTextForTiming(stage: TimingStage): string {
  if (stage === "power") return UI_TEXT.buttonLockSpeed;
  if (stage === "curve") return UI_TEXT.buttonLockCurve;
  return UI_TEXT.buttonStartSpeed;
}

function resultEffectName(snapshot: MatchSnapshot): string {
  const result = snapshot.lastResult;
  if (snapshot.phase !== "showingResult" || !result) return "none";
  if (result.isStrike) return "strike";
  if (result.isSpare) return "spare";
  return "none";
}

function meterPercent(value: number, min: number, max: number): number {
  return Math.round(((value - min) / (max - min)) * 100);
}
