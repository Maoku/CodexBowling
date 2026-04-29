import "./styles.css";
import { HEAD_PIN_Z } from "./game/content/bowlingDimensions";
import { ThrowInput } from "./game/input/ThrowInput";
import { createRivalThrow } from "./game/simulation/ai";
import { MatchState } from "./game/simulation/match";
import { makeThrowResult, pinsKnockedThisThrow, PIN_COUNT } from "./game/simulation/scoring";
import type { ThrowParams } from "./game/types";
import { BowlingPhysics } from "./physics/BowlingPhysics";
import { BowlingScene } from "./render/BowlingScene";
import { Hud, type PerformanceAction, type PerformanceState, type TimingStage } from "./ui/Hud";

const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas");
const hudRoot = document.querySelector<HTMLElement>("#hud-root");

if (!canvas || !hudRoot) {
  throw new Error("Missing game canvas or HUD root.");
}

const gameCanvas = canvas;
const gameHudRoot = hudRoot;

void bootstrap();

async function bootstrap(): Promise<void> {
  const input = new ThrowInput();
  const match = new MatchState();
  const physics = await BowlingPhysics.create();
  const scene = new BowlingScene(gameCanvas);

  let previousStandingPins = allPins();
  let aiThrowQueued = false;
  let resultAdvanceAt = 0;
  let throwSequence = 0;
  let timingStage: TimingStage = "ready";
  let timingStartedAt = 0;
  let lockedPower = input.value.power;
  let performance: PerformanceState = {
    bowler: "player",
    action: "idle",
    quote: "落ち着いて、まっすぐ狙うよ。",
    sequence: 0,
  };

  const hud = new Hud(gameHudRoot, {
    onThrow: () => handlePlayerThrowButton(),
    onReset: () => resetMatch(),
    onLaneChange: (value) => input.setLaneOffset(value),
    onAngleChange: (value) => input.setAngle(value),
    onPowerChange: (value) => input.setPower(value),
    onCurveChange: (value) => input.setCurve(value),
  });

  window.addEventListener("keydown", (event) => {
    if (event.code !== "Space") return;
    event.preventDefault();
    if (match.snapshot.phase === "aiming" && match.snapshot.activeBowler === "player") {
      handlePlayerThrowButton();
    }
  });

  function handlePlayerThrowButton(): void {
    const snapshot = match.snapshot;
    if (snapshot.phase !== "aiming" || snapshot.activeBowler !== "player") return;

    if (timingStage === "ready") {
      timingStage = "power";
      timingStartedAt = window.performance.now();
      setPerformance("player", "idle", "速度を決めるよ。タイミングを見て！", throwSequence + 1);
      throwSequence += 1;
      return;
    }

    if (timingStage === "power") {
      lockedPower = input.value.power;
      timingStage = "curve";
      timingStartedAt = window.performance.now();
      setPerformance("player", "idle", "次はカーブ。強く曲げるか、まっすぐ行くか！", throwSequence + 1);
      throwSequence += 1;
      return;
    }

    timingStage = "ready";
    throwForActiveBowler({ ...input.value, power: lockedPower });
  }

  function throwForActiveBowler(params: ThrowParams): void {
    const snapshot = match.snapshot;
    if (snapshot.phase !== "aiming") return;

    const activeBowler = snapshot.activeBowler;
    const releaseSequence = throwSequence + 1;
    throwSequence = releaseSequence;

    if (activeBowler === "player") {
      scene.updateAim(params);
    }

    previousStandingPins =
      activeBowler === "player" && match.currentThrowIndex === 0 ? allPins() : physics.standingPins();
    if (match.currentThrowIndex === 0) {
      physics.resetRack();
      previousStandingPins = allPins();
    } else {
      physics.resetBall(params.laneOffset);
    }

    match.beginThrow();
    setPerformance(activeBowler, "throw", throwLine(activeBowler), releaseSequence);
    window.setTimeout(() => {
      const fresh = match.snapshot;
      if (throwSequence === releaseSequence && fresh.phase === "rolling" && fresh.activeBowler === activeBowler) {
        physics.roll(params);
      }
    }, 850);
  }

  function finishThrow(): void {
    const standingPins = physics.standingPins();
    const knockedPins = pinsKnockedThisThrow(previousStandingPins, standingPins);
    const snapshot = match.snapshot;
    const currentFrame =
      snapshot.activeBowler === "player"
        ? snapshot.playerScore.frames[snapshot.activeFrame]
        : snapshot.rivalScore.frames[snapshot.activeFrame];
    const result = makeThrowResult(knockedPins, standingPins, currentFrame);

    match.applyResult(result);
    setPerformance(match.snapshot.activeBowler, resultAction(result), resultLine(match.snapshot.activeBowler, result), throwSequence + 1);
    throwSequence += 1;
    resultAdvanceAt = window.performance.now() + 1600;
    aiThrowQueued = false;
  }

  function resetMatch(): void {
    match.reset();
    physics.resetRack();
    previousStandingPins = allPins();
    aiThrowQueued = false;
    resultAdvanceAt = 0;
    timingStage = "ready";
    lockedPower = input.value.power;
    throwSequence += 1;
    setPerformance("player", "idle", "新しい勝負。まずは呼吸を合わせよう。", throwSequence);
  }

  function scoreLabels() {
    return {
      player: match.scoreLabels("player"),
      rival: match.scoreLabels("rival"),
    };
  }

  function tick(): void {
    const snapshot = match.snapshot;
    physics.step();
    const physicsSnapshot = physics.snapshot();

    if (snapshot.phase === "aiming" && snapshot.activeBowler === "rival" && !aiThrowQueued) {
      aiThrowQueued = true;
      window.setTimeout(() => {
        const fresh = match.snapshot;
        if (fresh.phase === "aiming" && fresh.activeBowler === "rival") {
          throwForActiveBowler(createRivalThrow(fresh.activeFrame, match.currentThrowIndex));
        }
      }, 850);
    }

    updateTimingMeters();

    if (snapshot.phase === "rolling" && physicsSnapshot.ball.position.z < HEAD_PIN_Z + 0.8) {
      match.beginSettling();
    }

    if ((snapshot.phase === "rolling" || snapshot.phase === "settling") && physics.isSettled()) {
      finishThrow();
    }

    if (match.snapshot.phase === "showingResult" && window.performance.now() > resultAdvanceAt) {
      match.advanceTurn();
      const advancedSnapshot = match.snapshot;
      if (advancedSnapshot.phase === "matchComplete") {
        const playerWon = advancedSnapshot.playerScore.total >= advancedSnapshot.rivalScore.total;
        setPerformance(playerWon ? "player" : "rival", playerWon ? "victory" : "defeat", advancedSnapshot.message, throwSequence + 1);
        throwSequence += 1;
      } else if (advancedSnapshot.phase === "aiming") {
        timingStage = advancedSnapshot.activeBowler === "player" ? "ready" : timingStage;
        setPerformance(
          advancedSnapshot.activeBowler,
          "idle",
          advancedSnapshot.activeBowler === "player" ? "次のピン、ちゃんと拾うよ。" : "リンカがレーンを読んでいる。",
          throwSequence + 1,
        );
        throwSequence += 1;
      }

      if (advancedSnapshot.phase === "aiming" && match.currentThrowIndex === 0) {
        physics.resetRack();
        previousStandingPins = allPins();
      }
    }

    const current = match.snapshot;
    scene.updateAim(input.value);
    scene.updateSignage(current);
    scene.sync(physicsSnapshot, current.phase);
    scene.render();
    hud.update(current, input.value, scoreLabels(), performance, timingStage);
    requestAnimationFrame(tick);
  }

  resetMatch();
  tick();

  function setPerformance(bowler: PerformanceState["bowler"], action: PerformanceAction, quote: string, sequence: number): void {
    performance = { bowler, action, quote, sequence };
  }

  function updateTimingMeters(): void {
    const snapshot = match.snapshot;
    if (snapshot.phase !== "aiming" || snapshot.activeBowler !== "player") return;

    const elapsed = (window.performance.now() - timingStartedAt) / 1000;
    if (timingStage === "power") {
      const wave = triangleWave(elapsed * 0.92);
      input.setPower(0.35 + wave * 0.65);
    } else if (timingStage === "curve") {
      const wave = Math.sin(elapsed * Math.PI * 1.35);
      input.setPower(lockedPower);
      input.setCurve(wave * 0.6);
    }
  }

  function triangleWave(t: number): number {
    const p = t - Math.floor(t);
    return p < 0.5 ? p * 2 : (1 - p) * 2;
  }

  function throwLine(bowler: PerformanceState["bowler"]): string {
    return bowler === "player" ? "いくよ、ストライクライン！" : "この角度なら、崩せる。";
  }

  function resultAction(result: { isStrike: boolean; isSpare: boolean; knockedPins: number }): PerformanceAction {
    if (result.isStrike) return "strike";
    if (result.isSpare) return "spare";
    if (result.knockedPins === 0) return "gutter";
    return "idle";
  }

  function resultLine(bowler: PerformanceState["bowler"], result: { isStrike: boolean; isSpare: boolean; knockedPins: number }): string {
    if (bowler === "player") {
      if (result.isStrike) return "やった、ぜんぶ倒れた！今の見てた？";
      if (result.isSpare) return "ふう、ちゃんと拾えた。まだ勝負はここから。";
      if (result.knockedPins === 0) return "うそ、ガター？今のは忘れて、次！";
      return `${result.knockedPins}本かあ。残りはきっちり拾うよ。`;
    }

    if (result.isStrike) return "リンカ: 当然。ここは私の得意レーンよ。";
    if (result.isSpare) return "リンカ: 最後の一本まで、逃がさない。";
    if (result.knockedPins === 0) return "リンカ: くっ、今のはレーンが悪いだけ。";
    return `リンカ: ${result.knockedPins}本。まだ計算通りよ。`;
  }
}

function allPins(): number[] {
  return Array.from({ length: PIN_COUNT }, (_, index) => index + 1);
}
