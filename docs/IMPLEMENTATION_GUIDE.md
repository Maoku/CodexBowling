# Nyanko Strike Rivals Implementation Guide

This project is a browser bowling game where 2D illustrated characters compete over a low-poly 3D physics bowling lane.

## Target Experience

- The player controls a pink-haired cat-ear heroine shown as a 2D illustration.
- Rival characters appear as 2D portraits and react to the match.
- The bowling lane, ball, pins, and collisions are rendered in 3D.
- Ball and pin movement are driven by Rapier physics, not hand-authored animation.
- The first playable scope is a short 5-frame duel.

## Stack

- Vite + TypeScript for the browser app.
- Three.js for low-poly 3D rendering.
- Rapier JS for physics.
- DOM/CSS for HUD, controls, score, and character panels.
- Generated bitmap assets live in `public/assets`.

## File Responsibilities

- `src/main.ts`
  - App bootstrap.
  - Creates simulation, physics, renderer, and HUD.
  - Owns the top-level game loop and turn transitions.

- `src/game/types.ts`
  - Shared domain types.
  - Add new match phases, player IDs, or throw result types here first.

- `src/game/content/bowlingDimensions.ts`
  - Regulation ten-pin dimensions converted to meters.
  - Change this file if the game mode changes to duckpin, candlepin, or a deliberately stylized scale.
  - Current units: 1 Three.js/Rapier world unit equals 1 meter.

- `src/game/simulation/scoring.ts`
  - Bowling frame state and scoring helpers.
  - Change this file when moving from the prototype 5-frame duel to full 10-frame scoring.

- `src/game/simulation/match.ts`
  - Match progression, turn ownership, and frame updates.
  - Add campaign progression or unlock rules outside this file unless they directly affect a match.

- `src/game/simulation/ai.ts`
  - Rival throw parameter generation.
  - Add rival personalities by changing the `RIVAL_PROFILES` data.

- `src/game/input/ThrowInput.ts`
  - Keyboard and pointer-adjusted player aim values.
  - Add gamepad or mobile gestures here.

- `src/physics/BowlingPhysics.ts`
  - Rapier world, lane colliders, ball body, pin bodies, and down-pin detection.
  - Tune ball feel, lane friction, pin mass, and collider sizes here.

- `src/render/BowlingScene.ts`
  - Three.js scene creation, low-poly lane art, ball/pin meshes, camera, and render sync.
  - Add models, lighting, particles, or replay camera behavior here.

- `src/ui/Hud.ts`
  - DOM UI rendering and user-facing controls.
  - Keep text-heavy interface work here rather than inside Three.js.

- `src/styles.css`
  - Visual theme and responsive layout.
  - Protect the 3D playfield: avoid covering the center of the lane during normal play.

## Asset Notes

- `public/assets/heroine-reference.png`
  - Copied from the user-provided character sheet.
  - Current build displays it as the heroine reference panel.
  - Next production step: crop or generate expression portraits for idle, confident, happy, and upset states.

- `public/assets/rival-bowler.png`
  - Generated with the imagegen skill and processed from a chroma-key source.
  - Current build uses it as the first rival portrait.

- `public/assets/player-bowler.png`
  - Generated with the imagegen skill from the three-view heroine reference.
  - Current build uses it as the heroine's bowling-wear portrait.

- `public/assets/player-sprite-framed.png` and `public/assets/rival-sprite-framed.png`
  - Pixel-art 8-frame sprite sheets shown in the top-center action-cut window.
  - Each runtime sheet is cropped from the white guide frames in the source sheet and normalized into equal 256 px frame cells to keep animation timing stable.
  - Frame order: idle, backswing, step, release, follow-through, cheer, gutter, victory.

- `public/assets/result-win-v2.png` and `public/assets/result-lose-v2.png`
  - Match result CGs shown after the 5-frame duel.

## Development Steps for a New Developer

1. Run `npm install`.
2. Run `npm run dev`.
3. Open the Vite URL in a browser.
4. Use `A/D` or the lane buttons to move the starting position.
5. Use the angle and curve controls to shape the shot.
6. Press `Space` or the throw button to bowl.
7. Verify that the ball follows the camera, pins fall, the score updates, and the rival takes a turn.

## Next Files to Modify

To make the prototype feel more like a finished game, work in this order:

1. `src/physics/BowlingPhysics.ts`
   - Tune friction, impulse, ball mass, and pin mass.
   - Add oil pattern zones as fixed regions that alter friction.

2. `src/render/BowlingScene.ts`
   - Add throw trail particles.
   - Add strike/spare camera cuts.
   - Extend the back-wall signage animation states if more result types are added.
   - Replace primitive pins with optimized GLB models when ready.

3. `src/game/simulation/scoring.ts`
   - Upgrade from the prototype 5-frame duel to a full 10-frame bowling ruleset.

4. `src/ui/Hud.ts`
   - Add expression switching.
   - Add dialogue bubbles and match-start banter.
   - Keep the top action-cut sprite animation and result CG overlay here.

5. `src/game/simulation/ai.ts`
   - Add more rivals and unique throw styles.

## Done Criteria for This Prototype

- The app builds with `npm run build`.
- A user can complete a 5-frame match against the rival.
- Ball/pin behavior is physically simulated.
- Ball, lane, and pin dimensions are based on regulation ten-pin measurements.
- Character art appears in the UI.
- The center playfield remains visible on desktop and mobile.
