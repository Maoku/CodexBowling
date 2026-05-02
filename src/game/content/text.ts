import type { BowlerId, MatchSnapshot, ThrowResult } from "../types";

export const CHARACTER_TEXT = {
  playerName: "Mao",
  rivalName: "Rinka",
  playerCardRole: "Mao",
  playerCardDescription: "Competitive cat-ear bowler",
  rivalCardRole: "Rival",
  rivalCardDescription: "Rinka, precision stylist",
  playerPortraitAlt: "Mao, pink-haired cat-ear bowler",
  rivalPortraitAlt: "Rinka, rival bowler with ponytail",
} as const;

export const ASSET_PATHS = {
  root: "./assets/",
  playerPortrait: "player-bowler-portrait.png",
  rivalPortrait: "rival-bowler-portrait.png",
  resultWin: "result-win-v2.png",
  resultLose: "result-lose-v2.png",
} as const;

export const UI_TEXT = {
  title: "5-Frame Duel",
  eyebrow: "Nyanko Strike Rivals",
  playerTurn: "Player Turn",
  rivalTurn: "Rival Turn",
  ready: "Ready",
  actionCut: "Action Cut",
  result: "Result",
  victory: "Victory",
  rivalWins: "Rival Wins",
  newMatch: "New Match",
  reset: "Reset",
  controlsHint: "A/D: lane, Left/Right: angle, Space: timing",
  buttonStartSpeed: "Start Power",
  buttonLockSpeed: "Lock Speed",
  buttonLockCurve: "Lock Curve",
  laneLabel: "Lane",
  angleLabel: "Angle",
  powerLabel: "Power",
  curveLabel: "Curve",
  resultWinCopy: "最後まで集中した一投が、勝負を決めました。",
  resultLoseCopy: "今日はリンカが一枚上手。次のレーンで取り返しましょう。",
  resultImageAlt: "Match result illustration",
} as const;

export const MATCH_TEXT = {
  opening: "レーンを読んで、最初の一投を決めよう。",
  playerRolling: "ナイスショットを狙え！",
  rivalRolling: "ライバルが投球中...",
  settling: "ピンの行方を見守ろう。",
  strike: "ストライク！レーンが一瞬止まったみたい。",
  spare: "スペア！最後まで諦めない一投。",
  splitResults: {
    player: [
      "スプリット！でも、ここから拾えたら最高に気持ちいいよ。",
      "うわ、割れちゃった。角度を信じて、一本ずつ狙おう。",
      "難しい形だね。落ち着いて、通すラインを見つけよう。",
    ],
    rival: [
      "リンカ: スプリットね。ここからが腕の見せどころよ。",
      "リンカ: 厄介な残り方。でも計算はまだ終わってない。",
      "リンカ: 割れたわね。次の一投で空気を変える。",
    ],
  },
  playerResult: (pins: number) => `${pins}本。次で拾いにいこう。`,
  rivalResult: (pins: number) => `ライバルは${pins}本倒した。`,
  playerSecondThrow: "残りピンを狙ってもう一投。",
  rivalSecondThrow: "ライバルの二投目。",
  rivalTurn: "ライバルの番。投球フォームを観察しよう。",
  frameStart: (frameNumber: number) => `第${frameNumber}フレーム。流れをつかもう。`,
  reset: "新しい勝負。深呼吸して一投目へ。",
  playerWin: "勝利！猫耳ボウラーの集中力が上回った。",
  rivalWin: "惜敗。ライバルが今日は一枚上手だった。",
  draw: "引き分け。次の勝負で決着をつけよう。",
} as const;

export const PERFORMANCE_TEXT = {
  initial: "落ち着いて、まっすぐ狙うよ。",
  timingSpeed: "速度を決めるよ。タイミングを見て！",
  timingCurve: "次はカーブ。強弱が合うところで押して！",
  playerThrow: "いくよ、ストライクライン！",
  rivalThrow: "この角度なら、崩せる。",
  reset: "新しい勝負。まずは呼吸を合わせよう。",
  playerNextThrow: "次のピン、ちゃんと拾うよ。",
  rivalReadingLane: "リンカがレーンを読んでいる。",
  matchComplete: (snapshot: MatchSnapshot) => snapshot.message,
  resultLine: (bowler: BowlerId, result: Pick<ThrowResult, "isStrike" | "isSpare" | "knockedPins" | "standingPins">) => {
    if (bowler === "player") {
      if (result.isStrike) return "やった、ぜんぶ倒れた！今の見てた？";
      if (result.isSpare) return "ふう、ちゃんと拾えた。まだ勝負はここから。";
      if (result.knockedPins === 0) return "うそ、ガター？今のは忘れて、次！";
      if (isSplitResult(result)) return chooseSplitLine("player", result, PERFORMANCE_SPLIT_LINES);
      return `${result.knockedPins}本かあ。残りはきっちり拾うよ。`;
    }

    if (result.isStrike) return "リンカ: 当然。このレーンは読めてる。";
    if (result.isSpare) return "リンカ: 最後の一本まで逃さない。";
    if (result.knockedPins === 0) return "リンカ: くっ、今のはレーンが悪いだけ。";
    if (isSplitResult(result)) return chooseSplitLine("rival", result, PERFORMANCE_SPLIT_LINES);
    return `リンカ: ${result.knockedPins}本。まだ計算通りよ。`;
  },
} as const;

export const SIGNAGE_TEXT = {
  ready: "READY!",
  final: "FINAL!",
  strike: "STRIKE!!",
  spare: "SPARE!",
  gutter: "GUTTER!",
  pins: (pins: number) => `${pins} PINS`,
} as const;

export function bowlerDisplayName(bowler: BowlerId): string {
  return bowler === "player" ? CHARACTER_TEXT.playerName : CHARACTER_TEXT.rivalName;
}

const PERFORMANCE_SPLIT_LINES = {
  player: [
    "わ、きれいに割れた。でもまだ拾える形を探すよ。",
    "むずかしい残り方だね。次はラインを少し外から通す。",
    "スプリットかあ。ここで決めたら流れを持っていける！",
  ],
  rival: [
    "リンカ: スプリット。面白いじゃない、燃えてきたわ。",
    "リンカ: 左右に割れたわね。次の角度で取り返す。",
    "リンカ: 簡単には終わらせてくれないレーンね。",
  ],
} as const;

export function matchSplitResultLine(bowler: BowlerId, result: Pick<ThrowResult, "knockedPins" | "standingPins">): string {
  return chooseSplitLine(bowler, result, MATCH_TEXT.splitResults);
}

export function isSplitResult(result: Pick<ThrowResult, "isStrike" | "isSpare" | "knockedPins" | "standingPins">): boolean {
  if (result.isStrike || result.isSpare || result.knockedPins === 0) return false;
  if (result.standingPins.length < 2 || result.standingPins.includes(1)) return false;

  const leftPins = new Set([2, 4, 7, 8]);
  const rightPins = new Set([3, 6, 9, 10]);
  const hasLeft = result.standingPins.some((pin) => leftPins.has(pin));
  const hasRight = result.standingPins.some((pin) => rightPins.has(pin));
  const hasCenterBridge = result.standingPins.some((pin) => pin === 5);
  return hasLeft && hasRight && !hasCenterBridge;
}

function chooseSplitLine(
  bowler: BowlerId,
  result: Pick<ThrowResult, "knockedPins" | "standingPins">,
  lines: Record<BowlerId, readonly string[]>,
): string {
  const lineSet = lines[bowler];
  const standingSum = result.standingPins.reduce((total, pin) => total + pin, 0);
  return lineSet[(standingSum + result.knockedPins) % lineSet.length];
}
