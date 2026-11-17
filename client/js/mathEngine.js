/**
 * Kinetix Math Engine
 * Converts mask vertex trajectories into Transform (Position, Scale, Rotation),
 * Inverse Stabilization, and 4-Point Corner Pin keyframes.
 *
 * Works both in browser/CEP (window.KinetixMath) and Node.js (module.exports).
 */
(function (root) {
  'use strict';

  function toPixelVertices(vertices, seqWidth, seqHeight, normalizedInput) {
    var w = seqWidth || 1920;
    var h = seqHeight || 1080;
    var scaleX = normalizedInput ? w : 1;
    var scaleY = normalizedInput ? h : 1;
    var out = new Array(vertices.length);
    for (var i = 0; i < vertices.length; i++) {
      out[i] = {
        x: vertices[i].x * scaleX,
        y: vertices[i].y * scaleY
      };
    }
    return out;
  }

  function computeCentroid(pts) {
    if (!pts || pts.length === 0) {
      return { x: 0, y: 0 };
    }
    var sx = 0;
    var sy = 0;
    for (var i = 0; i < pts.length; i++) {
      sx += pts[i].x;
      sy += pts[i].y;
    }
    return { x: sx / pts.length, y: sy / pts.length };
  }

  function computeBoundingBox(pts) {
    if (!pts || pts.length === 0) {
      return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0, diag: 0 };
    }
    var minX = Infinity;
    var minY = Infinity;
    var maxX = -Infinity;
    var maxY = -Infinity;
    for (var i = 0; i < pts.length; i++) {
      if (pts[i].x < minX) minX = pts[i].x;
      if (pts[i].y < minY) minY = pts[i].y;
      if (pts[i].x > maxX) maxX = pts[i].x;
      if (pts[i].y > maxY) maxY = pts[i].y;
    }
    var width = maxX - minX;
    var height = maxY - minY;
    return {
      minX: minX,
      minY: minY,
      maxX: maxX,
      maxY: maxY,
      width: width,
      height: height,
      diag: Math.sqrt(width * width + height * height)
    };
  }

  /**
   * Computes principal axis angle (in radians) from 2D point cloud covariance.
   * Used as fallback when vertex counts differ across frames (e.g. AI Rotoscope masks).
   */
  function computePrincipalAngle(pts, centroid) {
    var cxx = 0;
    var cyy = 0;
    var cxy = 0;
    for (var i = 0; i < pts.length; i++) {
      var dx = pts[i].x - centroid.x;
      var dy = pts[i].y - centroid.y;
      cxx += dx * dx;
      cyy += dy * dy;
      cxy += dx * dy;
    }
    return 0.5 * Math.atan2(2 * cxy, cxx - cyy);
  }

  /**
   * 2D Procrustes / Kabsch alignment between reference points and current points
   * when both frames have identical vertex counts.
   */
  function computeProcrustesTransform(refPts, refCentroid, curPts, curCentroid) {
    var n = refPts.length;
    var sumCross = 0;
    var sumDot = 0;
    var sumRefSq = 0;
    var sumCurSq = 0;

    for (var i = 0; i < n; i++) {
      var rx = refPts[i].x - refCentroid.x;
      var ry = refPts[i].y - refCentroid.y;
      var cx = curPts[i].x - curCentroid.x;
      var cy = curPts[i].y - curCentroid.y;

      sumCross += rx * cy - ry * cx;
      sumDot += rx * cx + ry * cy;
      sumRefSq += rx * rx + ry * ry;
      sumCurSq += cx * cx + cy * cy;
    }

    var angleRad = Math.atan2(sumCross, sumDot);
    var scaleRatio = sumRefSq > 1e-6 ? Math.sqrt(sumCurSq / sumRefSq) : 1;

    return {
      angleDeg: (angleRad * 180) / Math.PI,
      scalePct: scaleRatio * 100
    };
  }

  /**
   * Orders 4 points into [TL, TR, BR, BL] based on screen-space heuristics.
   */
  function orderFourCorners(pts) {
    if (!pts || pts.length === 0) {
      return [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 0 }
      ];
    }

    if (pts.length === 4) {
      var c = computeCentroid(pts);
      var sorted = pts.slice().sort(function (a, b) {
        return Math.atan2(a.y - c.y, a.x - c.x) - Math.atan2(b.y - c.y, b.x - c.x);
      });
      // Find top-left (smallest x + y) and rotate array so TL is index 0
      var tlIdx = 0;
      var bestSum = Infinity;
      for (var i = 0; i < 4; i++) {
        var s = sorted[i].x + sorted[i].y;
        if (s < bestSum) {
          bestSum = s;
          tlIdx = i;
        }
      }
      return [
        sorted[tlIdx],
        sorted[(tlIdx + 1) % 4],
        sorted[(tlIdx + 2) % 4],
        sorted[(tlIdx + 3) % 4]
      ];
    }

    // For arbitrary polygons (>4 or <4 vertices), project onto diagonal axes
    var tl = pts[0];
    var tr = pts[0];
    var br = pts[0];
    var bl = pts[0];
    var minSum = Infinity;
    var maxSum = -Infinity;
    var minDiff = Infinity;
    var maxDiff = -Infinity;

    for (var j = 0; j < pts.length; j++) {
      var p = pts[j];
      var sum = p.x + p.y;
      var diff = p.x - p.y;
      if (sum < minSum) { minSum = sum; tl = p; }
      if (sum > maxSum) { maxSum = sum; br = p; }
      if (diff > maxDiff) { maxDiff = diff; tr = p; }
      if (diff < minDiff) { minDiff = diff; bl = p; }
    }
    return [tl, tr, br, bl];
  }

  function unwrapAngles(angles) {
    if (!angles || angles.length === 0) return [];
    var out = [angles[0]];
    for (var i = 1; i < angles.length; i++) {
      var delta = angles[i] - angles[i - 1];
      while (delta > 180) delta -= 360;
      while (delta < -180) delta += 360;
      out.push(out[i - 1] + delta);
    }
    return out;
  }

  function smoothSeries(values, smoothingPct) {
    if (!smoothingPct || smoothingPct <= 0 || values.length < 3) {
      return values.slice();
    }
    var radius = Math.max(1, Math.round((smoothingPct / 100) * 6));
    var out = new Array(values.length);
    for (var i = 0; i < values.length; i++) {
      var sum = 0;
      var weightSum = 0;
      for (var k = -radius; k <= radius; k++) {
        var idx = i + k;
        if (idx >= 0 && idx < values.length) {
          // Triangular kernel weight
          var w = radius + 1 - Math.abs(k);
          sum += values[idx] * w;
          weightSum += w;
        }
      }
      out[i] = sum / weightSum;
    }
    return out;
  }

  /**
   * Main solver entry point.
   * @param {Array<{time:number, vertices:Array<{x:number, y:number}>}>} frames
   * @param {Object} options
   */
  function solveTracking(frames, options) {
    if (!frames || frames.length === 0) {
      throw new Error('Mask frame data is empty.');
    }

    var opts = options || {};
    var seqWidth = opts.seqWidth || 1920;
    var seqHeight = opts.seqHeight || 1080;
    var normalizedInput = opts.normalizedInput !== false;
    var refIdx = Math.max(0, Math.min(frames.length - 1, opts.referenceIndex || 0));
    var mode = opts.mode || 'pin'; // 'pin' | 'stabilize' | 'cornerpin'
    var smoothing = Math.max(0, Math.min(100, opts.smoothing || 0));
    var lockToCenter = opts.lockToCenter !== false;
    var offset = opts.offset || { x: 0, y: 0, scale: 0, rotation: 0 };

    var pixelFrames = frames.map(function (f) {
      return {
        time: f.time,
        pts: toPixelVertices(f.vertices || [], seqWidth, seqHeight, normalizedInput)
      };
    });

    var refPts = pixelFrames[refIdx].pts;
    var refCentroid = computeCentroid(refPts);
    var refBox = computeBoundingBox(refPts);
    var refPrincipal = computePrincipalAngle(refPts, refCentroid);

    var rawX = [];
    var rawY = [];
    var rawScale = [];
    var rawRot = [];
    var cornerTracks = [];

    for (var i = 0; i < pixelFrames.length; i++) {
      var pts = pixelFrames[i].pts;
      var c = computeCentroid(pts);
      var scalePct = 100;
      var angleDeg = 0;

      if (pts.length >= 2 && pts.length === refPts.length) {
        var proc = computeProcrustesTransform(refPts, refCentroid, pts, c);
        scalePct = proc.scalePct;
        angleDeg = proc.angleDeg;
      } else if (pts.length >= 2) {
        var box = computeBoundingBox(pts);
        scalePct = refBox.diag > 1e-6 ? (box.diag / refBox.diag) * 100 : 100;
        var curPrincipal = computePrincipalAngle(pts, c);
        angleDeg = ((curPrincipal - refPrincipal) * 180) / Math.PI;
      }

      if (mode === 'stabilize') {
        var targetX = lockToCenter
          ? seqWidth - c.x
          : seqWidth / 2 - (c.x - refCentroid.x);
        var targetY = lockToCenter
          ? seqHeight - c.y
          : seqHeight / 2 - (c.y - refCentroid.y);
        var invScale = scalePct > 1e-3 ? Math.max(20, Math.min(500, (10000 / scalePct))) : 100;
        rawX.push(targetX);
        rawY.push(targetY);
        rawScale.push(invScale);
        rawRot.push(-angleDeg);
      } else {
        rawX.push(c.x);
        rawY.push(c.y);
        rawScale.push(scalePct);
        rawRot.push(angleDeg);
      }

      var quad = orderFourCorners(pts);
      cornerTracks.push(quad);
    }

    var unwrappedRot = unwrapAngles(rawRot);
    // Re-center unwrapped rotation so reference frame stays at 0 (before offset)
    var refRot = unwrappedRot[refIdx];
    for (var r = 0; r < unwrappedRot.length; r++) {
      unwrappedRot[r] -= refRot;
    }

    var smX = smoothSeries(rawX, smoothing);
    var smY = smoothSeries(rawY, smoothing);
    var smScale = smoothSeries(rawScale, smoothing);
    var smRot = smoothSeries(unwrappedRot, smoothing);

    // Smooth corner pins independently if smoothing > 0
    var cornerNames = ['upperLeft', 'upperRight', 'lowerRight', 'lowerLeft'];
    var smoothedCorners = [];
    for (var ci = 0; ci < 4; ci++) {
      var cxArr = cornerTracks.map(function (q) { return q[ci].x; });
      var cyArr = cornerTracks.map(function (q) { return q[ci].y; });
      smoothedCorners.push({
        x: smoothSeries(cxArr, smoothing),
        y: smoothSeries(cyArr, smoothing)
      });
    }

    var keyframes = [];
    for (var k = 0; k < pixelFrames.length; k++) {
      var px = smX[k] + (offset.x || 0);
      var py = smY[k] + (offset.y || 0);
      var sc = Math.max(1, smScale[k] + (offset.scale || 0));
      var rot = smRot[k] + (offset.rotation || 0);

      var cornersPx = {};
      var cornersNorm = {};
      for (var cIdx = 0; cIdx < 4; cIdx++) {
        var cpx = smoothedCorners[cIdx].x[k] + (offset.x || 0);
        var cpy = smoothedCorners[cIdx].y[k] + (offset.y || 0);
        cornersPx[cornerNames[cIdx]] = [cpx, cpy];
        cornersNorm[cornerNames[cIdx]] = [cpx / seqWidth, cpy / seqHeight];
      }

      keyframes.push({
        time: pixelFrames[k].time,
        position: [px, py],
        positionNorm: [px / seqWidth, py / seqHeight],
        scale: sc,
        rotation: rot,
        corners: cornersPx,
        cornersNorm: cornersNorm
      });
    }

    return {
      mode: mode,
      seqWidth: seqWidth,
      seqHeight: seqHeight,
      frameCount: keyframes.length,
      referenceIndex: refIdx,
      keyframes: keyframes
    };
  }

  var api = {
    solveTracking: solveTracking,
    computeCentroid: computeCentroid,
    computeBoundingBox: computeBoundingBox,
    orderFourCorners: orderFourCorners,
    unwrapAngles: unwrapAngles,
    smoothSeries: smoothSeries
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.KinetixMath = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
