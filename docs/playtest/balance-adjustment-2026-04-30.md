# Balance Adjustment Log - 2026-04-30

## Goal

Tune Rinka so Mao can usually win by scoring 45+ in the 5-frame rule set, while still feeling contested.

## Method

1. Ran a fast physics simulation using the same `BowlingPhysics`, score rules, and rival throw generator.
2. Grid-searched strong pocket shots to identify realistic high-score lanes.
3. Retuned only the rival AI values in `RIVAL_TUNING`.
4. Ran a browser playtest and captured screenshots.

## Key Findings

- Before tuning, Rinka averaged about 19 points, which was too weak.
- A first tuning pass averaged about 47 points, which was too strong.
- Final tuning averaged about 39 points, with enough variance for occasional 45+ games.

## Final Simulation Result

From the saved simulation log:

- Rinka average: about 38-40 points depending on random seed
- Rinka observed range in the final pass: 25-50
- Rinka 45+ rate: about 20-25%

This means a player score of 45+ should usually beat Rinka, but not always.

## Browser Playtest

Automated browser playtest shot:

```json
{
  "lane": -0.18,
  "angle": 0,
  "power": 0.84,
  "curve": 0.08
}
```

Observed browser playtest result:

- Mao: 25
- Rinka: 33
- Result: Rival Wins

The browser run confirms Rinka now lands in the intended competitive band rather than the previous low-score band. The automated player timing did not consistently reproduce the simulation pocket shot, so the browser result is treated as a sanity check rather than the primary balance statistic.

## Artifacts

- Simulation log: `docs/playtest/balance-simulation-log.json`
- Browser log: `docs/playtest/balance-browser-log.json`
- Start screenshot: `docs/playtest/balance-browser-start.png`
- Mid-match screenshot: `docs/playtest/balance-browser-mid.png`
- Final screenshot: `docs/playtest/balance-browser-final.png`
