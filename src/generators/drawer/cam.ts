/**
 * The under-desk drawer's push-push latch.
 *
 * The mechanism itself lives in `core/mech/heartCam`, because the push-lock
 * drawer generator fits the same one and two copies of a cam are two cams the
 * day somebody corrects one of them. This module is the seam: it says which
 * cam this drawer uses and nothing else.
 */
export {
  camCutter,
  camGroove,
  camPath,
  camSegments,
  camToLocal,
  latchedPoint,
  type CamPoint,
  type CamSpec,
} from '../../core/mech/heartCam';
