/**
 * Kinetix Offline .prproj, .prmf (Premiere 2026 AI Object Mask) & Mask Data Parser
 * Reads Premiere Pro 2026 binary .prmf mask caches and gzipped (.prproj) XML
 * locally via Node.js (100% offline).
 */
(function (root) {
  'use strict';

  var PPRO_TICKS_PER_SECOND = 254016000000;

  function readPrprojXml(filePath) {
    if (typeof require !== 'function') {
      throw new Error('Node.js runtime is required to read .prproj files.');
    }
    var fs = require('fs');
    var path = require('path');
    var zlib = require('zlib');

    // If an Auto-Save for the same project is newer than the saved .prproj,
    // use the newer Auto-Save so unsaved recent mask tracks are still picked up.
    var targetPath = filePath;
    try {
      var baseMtime = fs.statSync(filePath).mtimeMs;
      var projDir = path.dirname(filePath);
      var projName = path.basename(filePath, path.extname(filePath));
      var autoSaveDir = path.join(projDir, 'Adobe Premiere Pro Auto-Save');
      if (fs.existsSync(autoSaveDir)) {
        var entries = fs.readdirSync(autoSaveDir);
        var bestMtime = baseMtime;
        for (var i = 0; i < entries.length; i++) {
          var fn = entries[i];
          if (fn.indexOf(projName + '--') === 0 && fn.slice(-7).toLowerCase() === '.prproj') {
            var full = path.join(autoSaveDir, fn);
            var st = fs.statSync(full);
            if (st.mtimeMs > bestMtime) {
              bestMtime = st.mtimeMs;
              targetPath = full;
            }
          }
        }
      }
    } catch (e) {}

    var buf = fs.readFileSync(targetPath);
    if (buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b) {
      return zlib.gunzipSync(buf).toString('utf8');
    }
    return buf.toString('utf8');
  }

  /**
   * Attempts to decompress a .prmf per-frame mask alpha chunk via zlib and
   * compute its principal orientation angle (radians) using 2nd-order image moments.
   * Returns null if the chunk uses an unsupported codec or has isotropic moments.
   */
  function tryExtractChunkAngleRad(chunkBuf, w, h) {
    if (!chunkBuf || chunkBuf.length < 4 || typeof require !== 'function') return null;
    if (w <= 2 || h <= 2 || w * h > 4000000) return null;
    var zlib = require('zlib');
    var raw = null;
    try {
      raw = zlib.inflateSync(chunkBuf);
    } catch (e1) {
      try {
        raw = zlib.inflateRawSync(chunkBuf);
      } catch (e2) {
        return null;
      }
    }
    if (!raw || raw.length < w * h) return null;

    var m00 = 0, m10 = 0, m01 = 0;
    var len = w * h;
    for (var idx = 0; idx < len; idx++) {
      var val = raw[idx];
      if (val > 20) {
        var x = idx % w;
        var y = (idx / w) | 0;
        m00 += val;
        m10 += x * val;
        m01 += y * val;
      }
    }
    if (m00 <= 0) return null;
    var cx = m10 / m00;
    var cy = m01 / m00;
    var mu20 = 0, mu02 = 0, mu11 = 0;
    for (var j = 0; j < len; j++) {
      var v = raw[j];
      if (v > 20) {
        var dx = (j % w) - cx;
        var dy = ((j / w) | 0) - cy;
        mu20 += dx * dx * v;
        mu02 += dy * dy * v;
        mu11 += dx * dy * v;
      }
    }
    if (Math.abs(mu20 - mu02) < 1e-3 && Math.abs(mu11) < 1e-3) return null;
    return 0.5 * Math.atan2(2 * mu11, mu20 - mu02);
  }

  /**
   * Parses a Premiere Pro 2026 binary .prmf (Premiere Mask File) containing
   * a FlatBuffer index table of tracked AI Object Mask frames.
   */
  function parsePrmfBuffer(buf, label) {
    if (!buf || buf.length < 40) return null;
    if (buf.toString('ascii', 0, 4) !== 'prmf') return null;

    var ver = buf.readUInt32LE(4);
    var idxOff = Number(buf.readBigUInt64LE(8));
    var idxSz = Number(buf.readBigUInt64LE(16));
    if (idxOff <= 0 || idxSz <= 0 || idxOff + idxSz > buf.length) return null;

    var fb = buf.subarray(idxOff, idxOff + idxSz);
    var rootOff = fb.readUInt32LE(0);
    var vtRel = fb.readInt32LE(rootOff);
    var vtOff = rootOff - vtRel;
    var vtSz = fb.readUInt16LE(vtOff);
    if (vtSz < 10) return null;

    var f2 = fb.readUInt16LE(vtOff + 4 + 2 * 2);
    if (!f2) return null;
    var vecFieldOff = rootOff + f2;
    var vecPos = vecFieldOff + fb.readUInt32LE(vecFieldOff);
    var vecLen = fb.readUInt32LE(vecPos);
    if (vecLen <= 0) return null;

    var frames = [];
    for (var i = 0; i < vecLen; i++) {
      var ep = vecPos + 4 + i * 4;
      var eo = ep + fb.readUInt32LE(ep);
      var vtr = fb.readInt32LE(eo);
      var vto = eo - vtr;
      var vtsz = fb.readUInt16LE(vto);

      var getFieldOff = function (fIdx) {
        var pos = 4 + fIdx * 2;
        return pos < vtsz ? fb.readUInt16LE(vto + pos) : 0;
      };

      var fTicks = getFieldOff(1);
      var fDataOff = getFieldOff(2);
      var fRect1 = getFieldOff(3);
      var fDim = getFieldOff(4);
      var fDataSz = getFieldOff(6);
      var fRect2 = getFieldOff(7);
      var fTDim = getFieldOff(8);

      if (!fTicks || !fRect1) continue;

      var ticks = Number(fb.readBigInt64LE(eo + fTicks));
      var r1x = fb.readInt32LE(eo + fRect1);
      var r1y = fb.readInt32LE(eo + fRect1 + 4);
      var r1w = fb.readInt32LE(eo + fRect1 + 8);
      var r1h = fb.readInt32LE(eo + fRect1 + 12);

      var angleRad = null;
      if (fDataOff && fDataSz) {
        var dOff = fb.readUInt32LE(eo + fDataOff);
        var dSz = fb.readUInt32LE(eo + fDataSz);
        if (dOff >= 32 && dSz > 0 && dOff + dSz <= idxOff) {
          angleRad = tryExtractChunkAngleRad(buf.subarray(dOff, dOff + dSz), r1w, r1h);
        }
      }

      var frameW = fDim ? fb.readInt32LE(eo + fDim) : 1080;
      var frameH = fDim ? fb.readInt32LE(eo + fDim + 4) : 1920;
      if (frameW <= 0) frameW = 1080;
      if (frameH <= 0) frameH = 1920;

      var bx = r1x;
      var by = r1y;
      var bw = r1w;
      var bh = r1h;

      if (fRect2 && fTDim) {
        var tw = fb.readInt32LE(eo + fTDim);
        var th = fb.readInt32LE(eo + fTDim + 4);
        var r2x = fb.readInt32LE(eo + fRect2);
        var r2y = fb.readInt32LE(eo + fRect2 + 4);
        var r2w = fb.readInt32LE(eo + fRect2 + 8);
        var r2h = fb.readInt32LE(eo + fRect2 + 12);
        if (tw > 0 && th > 0 && r2w > 0 && r2h > 0) {
          bx = r2x + (r1x / tw) * r2w;
          by = r2y + (r1y / th) * r2h;
          bw = (r1w / tw) * r2w;
          bh = (r1h / th) * r2h;
        }
      }

      var verts;
      if (angleRad !== null) {
        var cx = (bx + bw * 0.5) / frameW;
        var cy = (by + bh * 0.5) / frameH;
        var hwPx = bw * 0.5;
        var hhPx = bh * 0.5;
        var cosA = Math.cos(angleRad);
        var sinA = Math.sin(angleRad);
        verts = [
          [-hwPx, -hhPx],
          [hwPx, -hhPx],
          [hwPx, hhPx],
          [-hwPx, hhPx]
        ].map(function (pt) {
          return {
            x: cx + (pt[0] * cosA - pt[1] * sinA) / frameW,
            y: cy + (pt[0] * sinA + pt[1] * cosA) / frameH
          };
        });
      } else {
        var x0 = bx / frameW;
        var y0 = by / frameH;
        var x1 = (bx + bw) / frameW;
        var y1 = (by + bh) / frameH;
        verts = [
          { x: x0, y: y0 },
          { x: x1, y: y0 },
          { x: x1, y: y1 },
          { x: x0, y: y1 }
        ];
      }

      frames.push({
        time: ticks / PPRO_TICKS_PER_SECOND,
        vertices: verts
      });
    }

    frames.sort(function (a, b) {
      return a.time - b.time;
    });

    return {
      name: label || 'AI Object Mask',
      version: ver,
      source: 'prmf',
      frameCount: frames.length,
      frames: frames
    };
  }

  /**
   * Scans the "<ProjectName> Masks" folder next to the active .prproj file
   * for Premiere Pro 2026 .prmf AI Object Mask files.
   */
  function loadPrmfMasksForProject(projectPath) {
    if (!projectPath || typeof require !== 'function') return [];
    var fs = require('fs');
    var path = require('path');

    var projDir = path.dirname(projectPath);
    var projBase = path.basename(projectPath, path.extname(projectPath));
    var candidateDirs = [];

    var exactMaskDir = path.join(projDir, projBase + ' Masks');
    if (fs.existsSync(exactMaskDir)) {
      candidateDirs.push(exactMaskDir);
    }

    try {
      var entries = fs.readdirSync(projDir);
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].slice(-6) === ' Masks') {
          var full = path.join(projDir, entries[i]);
          if (candidateDirs.indexOf(full) === -1) {
            candidateDirs.push(full);
          }
        }
      }
    } catch (e) {}

    var prmfFiles = [];
    for (var d = 0; d < candidateDirs.length; d++) {
      var dir = candidateDirs[d];
      try {
        var files = fs.readdirSync(dir);
        for (var f = 0; f < files.length; f++) {
          if (files[f].slice(-5).toLowerCase() === '.prmf') {
            var fp = path.join(dir, files[f]);
            var st = fs.statSync(fp);
            prmfFiles.push({ path: fp, name: files[f], mtimeMs: st.mtimeMs });
          }
        }
      } catch (e) {}
    }

    // Sort newest first
    prmfFiles.sort(function (a, b) {
      return b.mtimeMs - a.mtimeMs;
    });

    var parsedMasks = [];
    for (var k = 0; k < prmfFiles.length; k++) {
      try {
        var buf = fs.readFileSync(prmfFiles[k].path);
        var parsed = parsePrmfBuffer(buf, 'Object Mask (' + prmfFiles[k].name.slice(0, 8) + ')');
        if (parsed && parsed.frames.length > 0) {
          parsed.mtimeMs = prmfFiles[k].mtimeMs;
          parsedMasks.push(parsed);
        }
      } catch (e) {}
    }

    // Prioritize multi-frame tracked masks (frames.length > 1), then newest mtime
    parsedMasks.sort(function (a, b) {
      var aMulti = a.frames.length > 1 ? 1 : 0;
      var bMulti = b.frames.length > 1 ? 1 : 0;
      if (aMulti !== bMulti) return bMulti - aMulti;
      return (b.mtimeMs || 0) - (a.mtimeMs || 0);
    });

    return parsedMasks;
  }

  function decodeArbBase64ToQuad(b64Str) {
    if (!b64Str || typeof Buffer === 'undefined') return null;
    var clean = b64Str.replace(/\s+/g, '');
    if (clean.length < 16) return null;
    var buf;
    try {
      buf = Buffer.from(clean, 'base64');
    } catch (e) {
      return null;
    }
    if (buf.length < 40) return null;

    var version = buf.readUInt32LE(0);
    if (version !== 1) return null;

    var refOffsets = [
      { x: -0.1, y: -0.1 },
      { x: 0.1, y: -0.1 },
      { x: 0.1, y: 0.1 },
      { x: -0.1, y: 0.1 }
    ];

    // Premiere Pro 2026 Pen/Mask Tracker (104 bytes: version + M1(9f) + M2(9f) + extra(7f))
    // M2 is a row-vector 3x3 matrix: [dx, dy, 1] * M2 -> (nx, ny, w)
    if (buf.length >= 76) {
      var m2 = [];
      for (var j = 0; j < 9; j++) {
        m2.push(buf.readFloatLE(4 + 36 + j * 4));
      }
      var m2Ok = m2.every(function (v) { return isFinite(v) && Math.abs(v) < 1e4; });
      if (m2Ok && Math.abs(m2[8]) > 1e-5 && (Math.abs(m2[6]) > 1e-6 || Math.abs(m2[7]) > 1e-6 || Math.abs(m2[1]) > 1e-6 || Math.abs(m2[3]) > 1e-6)) {
        return refOffsets.map(function (pt) {
          var w = m2[2] * pt.x + m2[5] * pt.y + m2[8];
          if (Math.abs(w) < 1e-6) w = 1;
          var nx = (m2[0] * pt.x + m2[3] * pt.y + m2[6]) / w;
          var ny = (m2[1] * pt.x + m2[4] * pt.y + m2[7]) / w;
          return { x: nx, y: ny };
        });
      }
    }

    // Fallback: 3x3 row-major matrix at offset 4
    var m = [];
    for (var i = 0; i < 9; i++) {
      m.push(buf.readFloatLE(4 + i * 4));
    }
    var allFinite = m.every(function (v) { return isFinite(v) && Math.abs(v) < 1e4; });
    if (allFinite && Math.abs(m[8]) > 1e-5) {
      return refOffsets.map(function (pt) {
        var sx = pt.x + 0.5;
        var sy = pt.y + 0.5;
        var w = m[6] * sx + m[7] * sy + m[8];
        if (Math.abs(w) < 1e-6) w = 1;
        var nx = (m[0] * sx + m[1] * sy + m[2]) / w;
        var ny = (m[3] * sx + m[4] * sy + m[5]) / w;
        return { x: nx, y: ny };
      });
    }
    return null;
  }

  /**
   * Builds a lightweight ObjectRef -> parent map so each ArbVideoComponentParam
   * can be matched to its owning VideoClipTrackItem (<Start> ticks) on multi-clip timelines.
   */
  function buildTrackItemStartMap(xmlText) {
    var parentOf = {};
    var trackItemStartSec = {};

    // Index all ObjectID blocks and their outgoing ObjectRef links
    var objRegex = /<([A-Za-z0-9_.]+)\b[^>]*\bObjectID="(\d+)"[^>]*>([\s\S]*?)<\/\1>/g;
    var m;
    while ((m = objRegex.exec(xmlText)) !== null) {
      var tag = m[1];
      var oid = m[2];
      var body = m[3];

      if (tag === 'VideoClipTrackItem') {
        var stMatch = body.match(/<Start>(\d+)<\/Start>/);
        if (stMatch) {
          trackItemStartSec[oid] = parseFloat(stMatch[1]) / PPRO_TICKS_PER_SECOND;
        }
      }

      var refRegex = /\bObjectRef="(\d+)"/g;
      var rm;
      while ((rm = refRegex.exec(body)) !== null) {
        if (!parentOf[rm[1]]) {
          parentOf[rm[1]] = oid;
        }
      }
    }

    return function resolveClipStartSec(paramOid) {
      var cur = paramOid;
      for (var depth = 0; depth < 8 && cur; depth++) {
        if (typeof trackItemStartSec[cur] === 'number') {
          return trackItemStartSec[cur];
        }
        cur = parentOf[cur];
      }
      return null;
    };
  }

  function parseMasksFromXml(xmlText, clipFilter) {
    if (!xmlText || typeof xmlText !== 'string') {
      return [];
    }

    var filterStartSec =
      clipFilter && typeof clipFilter === 'object' && typeof clipFilter.clipStartSeconds === 'number'
        ? clipFilter.clipStartSeconds
        : null;

    var resolveStart = filterStartSec !== null ? buildTrackItemStartMap(xmlText) : null;
    var masks = [];

    var arbRegex = /<ArbVideoComponentParam\b([^>]*)>([\s\S]*?)<\/ArbVideoComponentParam>/gi;
    var arbMatch;
    while ((arbMatch = arbRegex.exec(xmlText)) !== null) {
      var arbAttrs = arbMatch[1] || '';
      var arbBlock = arbMatch[2];
      var oidMatch = arbAttrs.match(/\bObjectID="(\d+)"/);
      var paramOid = oidMatch ? oidMatch[1] : null;
      var nameMatch = arbBlock.match(/<Name>([^<]+)<\/Name>/i);
      var ctrlMatch = arbBlock.match(/<ParameterControlType>(\d+)<\/ParameterControlType>/i);
      var paramName = nameMatch ? nameMatch[1].trim() : '';
      var ctrlType = ctrlMatch ? ctrlMatch[1] : '';

      var isMaskOrTracker =
        paramName === 'Tracker' ||
        paramName === 'Mask Path' ||
        paramName === 'Path' ||
        paramName.toLowerCase().indexOf('mask') !== -1 ||
        ctrlType === '22';

      if (!isMaskOrTracker) continue;

      var arbFrames = extractArbKeyframes(arbBlock);
      if (arbFrames.length > 0) {
        var ownerStart = resolveStart && paramOid ? resolveStart(paramOid) : null;
        masks.push({
          name: paramName || 'Tracker',
          source: 'prproj-arb',
          clipStartSeconds: ownerStart,
          frameCount: arbFrames.length,
          frames: arbFrames
        });
      }
    }

    if (masks.length > 0) {
      if (filterStartSec !== null) {
        masks.sort(function (a, b) {
          var da = typeof a.clipStartSeconds === 'number' ? Math.abs(a.clipStartSeconds - filterStartSec) : 1e9;
          var db = typeof b.clipStartSeconds === 'number' ? Math.abs(b.clipStartSeconds - filterStartSec) : 1e9;
          return da - db;
        });
      }
      return masks;
    }

    var maskBlockRegex = /<(?:VideoMask|Mask|MaskComponent)[^>]*>([\s\S]*?)<\/(?:VideoMask|Mask|MaskComponent)>/gi;
    var match;
    var index = 0;

    while ((match = maskBlockRegex.exec(xmlText)) !== null) {
      var block = match[1];
      var mNameMatch = block.match(/<Name>([^<]+)<\/Name>/i);
      var maskName = mNameMatch ? mNameMatch[1].trim() : 'Mask ' + (index + 1);

      var frames = extractFramesFromBlock(block);
      if (frames.length > 0) {
        masks.push({
          name: maskName,
          source: 'prproj-xml',
          frameCount: frames.length,
          frames: frames
        });
      }
      index++;
    }

    if (masks.length === 0) {
      var kfBlockRegex = /<Keyframes>([\s\S]*?)<\/Keyframes>/gi;
      var kfMatch;
      var kfIdx = 0;
      while ((kfMatch = kfBlockRegex.exec(xmlText)) !== null) {
        var parsed = parseKeyframeListString(kfMatch[1]);
        if (parsed.length >= 2) {
          masks.push({
            name: 'Extracted Mask ' + (kfIdx + 1),
            source: 'prproj-keyframes',
            frameCount: parsed.length,
            frames: parsed
          });
          kfIdx++;
        }
      }
    }

    return masks;
  }

  function extractArbKeyframes(block) {
    var frames = [];
    var kfNodeRegex = /<Keyframe[^>]*Time="([+-]?\d+)"[^>]*>([\s\S]*?)<\/Keyframe>/gi;
    var kfNode;
    while ((kfNode = kfNodeRegex.exec(block)) !== null) {
      var ticks = parseFloat(kfNode[1]);
      if (!isFinite(ticks) || ticks < 0) continue;
      var valMatch = kfNode[2].match(/<(?:Value|KeyframeValue)[^>]*>([\s\S]*?)<\/(?:Value|KeyframeValue)>/i);
      if (valMatch) {
        var quad = decodeArbBase64ToQuad(valMatch[1]);
        if (quad) {
          frames.push({ time: ticks / PPRO_TICKS_PER_SECOND, vertices: quad });
        }
      }
    }
    if (frames.length > 0) return frames;

    var kfTextMatch = block.match(/<Keyframes>([\s\S]*?)<\/Keyframes>/i);
    if (kfTextMatch) {
      var entries = kfTextMatch[1].split(';');
      for (var i = 0; i < entries.length; i++) {
        var entry = entries[i].trim();
        if (!entry) continue;
        var parts = entry.split(',');
        if (parts.length < 2) continue;
        var t = parseFloat(parts[0]);
        if (!isFinite(t) || t < 0) continue;
        var decoded = decodeArbBase64ToQuad(parts[1]);
        if (decoded) {
          frames.push({ time: t / PPRO_TICKS_PER_SECOND, vertices: decoded });
        }
      }
    }
    return frames;
  }

  function extractFramesFromBlock(block) {
    var frames = [];
    var kfNodeRegex = /<Keyframe[^>]*Time="(\d+)"[^>]*>([\s\S]*?)<\/Keyframe>/gi;
    var kfNode;
    while ((kfNode = kfNodeRegex.exec(block)) !== null) {
      var ticks = parseFloat(kfNode[1]);
      var timeSec = isFinite(ticks) ? ticks / PPRO_TICKS_PER_SECOND : 0;
      var pts = [];
      var ptRegex = /<Point[^>]*X="([+-]?[\d.eE-]+)"[^>]*Y="([+-]?[\d.eE-]+)"[^>]*\/?>/gi;
      var pt;
      while ((pt = ptRegex.exec(kfNode[2])) !== null) {
        pts.push({ x: parseFloat(pt[1]), y: parseFloat(pt[2]) });
      }
      if (pts.length > 0) {
        frames.push({ time: timeSec, vertices: pts });
      }
    }

    if (frames.length > 0) {
      return frames;
    }

    var kfTextMatch = block.match(/<Keyframes>([\s\S]*?)<\/Keyframes>/i);
    if (kfTextMatch) {
      return parseKeyframeListString(kfTextMatch[1]);
    }
    return frames;
  }

  function parseKeyframeListString(raw) {
    if (!raw) return [];
    var entries = raw.split(';');
    var frames = [];
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i].trim();
      if (!entry) continue;
      var parts = entry.split(',');
      if (parts.length < 2) continue;
      var ticks = parseFloat(parts[0]);
      if (!isFinite(ticks)) continue;
      var coordStr = parts[1].trim();
      if (coordStr.indexOf('|') === -1 && coordStr.indexOf(':') === -1) continue;

      var pairs = coordStr.split('|');
      var vertices = [];
      for (var p = 0; p < pairs.length; p++) {
        var xy = pairs[p].split(':');
        if (xy.length >= 2) {
          var x = parseFloat(xy[0]);
          var y = parseFloat(xy[1]);
          if (isFinite(x) && isFinite(y)) {
            vertices.push({ x: x, y: y });
          }
        }
      }
      if (vertices.length >= 3) {
        frames.push({
          time: ticks / PPRO_TICKS_PER_SECOND,
          vertices: vertices
        });
      }
    }
    return frames;
  }

  function parseMaskJson(text) {
    var data = typeof text === 'string' ? JSON.parse(text) : text;
    if (Array.isArray(data)) {
      return data;
    }
    if (data && Array.isArray(data.frames)) {
      return data.frames;
    }
    throw new Error('Invalid mask JSON format. Expected an array of {time, vertices}.');
  }

  function loadMasksFromPrproj(filePath, clipNameFilter) {
    // 1. Check .prproj XML first so polygon/3x3 Tracker masks (with full Rotation)
    // are never shadowed by older .prmf bounding-box caches in the project folder.
    var xml = readPrprojXml(filePath);
    var xmlMasks = parseMasksFromXml(xml, clipNameFilter);
    if (xmlMasks.length > 0) {
      return xmlMasks;
    }

    // 2. Fallback to Premiere Pro 2026 binary .prmf AI Object Masks
    return loadPrmfMasksForProject(filePath);
  }

  var api = {
    PPRO_TICKS_PER_SECOND: PPRO_TICKS_PER_SECOND,
    readPrprojXml: readPrprojXml,
    parsePrmfBuffer: parsePrmfBuffer,
    tryExtractChunkAngleRad: tryExtractChunkAngleRad,
    loadPrmfMasksForProject: loadPrmfMasksForProject,
    decodeArbBase64ToQuad: decodeArbBase64ToQuad,
    parseMasksFromXml: parseMasksFromXml,
    parseKeyframeListString: parseKeyframeListString,
    parseMaskJson: parseMaskJson,
    loadMasksFromPrproj: loadMasksFromPrproj
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.KinetixPrproj = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
