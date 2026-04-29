export const INCH_TO_METER = 0.0254;
export const FOOT_TO_METER = 0.3048;

export const BOWLING_DIMENSIONS = {
  laneWidth: 41.5 * INCH_TO_METER,
  laneLengthToHeadPin: 60 * FOOT_TO_METER,
  laneEndFromFoulLine: 62.849 * FOOT_TO_METER,
  gutterWidth: 9.25 * INCH_TO_METER,
  ballDiameter: 8.5 * INCH_TO_METER,
  ballMassKg: 16 * 0.45359237,
  pinHeight: 15 * INCH_TO_METER,
  pinMaxDiameter: 4.75 * INCH_TO_METER,
  pinBaseDiameter: 2.25 * INCH_TO_METER,
  pinSpacing: 12 * INCH_TO_METER,
  pinMassKg: 3.5 * 0.45359237,
} as const;

export const BALL_RADIUS = BOWLING_DIMENSIONS.ballDiameter / 2;
export const PIN_MAX_RADIUS = BOWLING_DIMENSIONS.pinMaxDiameter / 2;
export const PIN_BASE_RADIUS = BOWLING_DIMENSIONS.pinBaseDiameter / 2;
export const LANE_HALF_WIDTH = BOWLING_DIMENSIONS.laneWidth / 2;
export const SAFE_BALL_LANE_OFFSET = LANE_HALF_WIDTH - BALL_RADIUS - 0.015;
export const BALL_START_Z = 0.82;
export const HEAD_PIN_Z = -BOWLING_DIMENSIONS.laneLengthToHeadPin;
export const LANE_CENTER_Z = -BOWLING_DIMENSIONS.laneEndFromFoulLine / 2;
export const PIN_ROW_Z_SPACING = BOWLING_DIMENSIONS.pinSpacing * Math.sqrt(3) * 0.5;
