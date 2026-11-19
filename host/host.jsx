/**
 * Kinetix Host ExtendScript (ES3) for Adobe Premiere Pro 2026 (v26.0+)
 * Zero-dependency native Transform, Motion, and Corner Pin keyframe writer.
 */

if (typeof JSON === 'undefined') {
  JSON = {};
}
if (typeof JSON.stringify !== 'function') {
  JSON.stringify = function (val) {
    if (val === null) return 'null';
    var t = typeof val;
    if (t === 'number' || t === 'boolean') return String(val);
    if (t === 'string') {
      return '"' + val.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r') + '"';
    }
    if (val instanceof Array) {
      var arr = [];
      for (var i = 0; i < val.length; i++) {
        arr.push(JSON.stringify(val[i]));
      }
      return '[' + arr.join(',') + ']';
    }
    if (t === 'object') {
      var props = [];
      for (var k in val) {
        if (val.hasOwnProperty(k) && typeof val[k] !== 'function' && typeof val[k] !== 'undefined') {
          props.push(JSON.stringify(k) + ':' + JSON.stringify(val[k]));
        }
      }
      return '{' + props.join(',') + '}';
    }
    return 'null';
  };
}
if (typeof JSON.parse !== 'function') {
  JSON.parse = function (str) {
    return eval('(' + str + ')');
  };
}

function _kxResult(obj) {
  return JSON.stringify(obj);
}

function _kxGetActiveSequence() {
  if (!app || !app.project || !app.project.activeSequence) {
    return null;
  }
  return app.project.activeSequence;
}

function kinetix_getSequenceInfo() {
  try {
    var seq = _kxGetActiveSequence();
    if (!seq) {
      return _kxResult({ ok: false, error: 'Aktif bir sekans bulunamadi.' });
    }
    var sel = seq.getSelection();
    var selectedNames = [];
    for (var i = 0; i < sel.length; i++) {
      selectedNames.push(sel[i].name || ('Clip ' + (i + 1)));
    }
    var playhead = seq.getPlayerPosition();
    return _kxResult({
      ok: true,
      sequenceName: seq.name,
      seqWidth: seq.frameSizeHorizontal || 1920,
      seqHeight: seq.frameSizeVertical || 1080,
      timebase: seq.timebase,
      playheadSeconds: playhead ? playhead.seconds : 0,
      projectPath: app.project.path || '',
      selectionCount: sel.length,
      selectedNames: selectedNames
    });
  } catch (e) {
    return _kxResult({ ok: false, error: 'Sekans bilgisi alinamadi: ' + e.toString() });
  }
}

function _kxTryExtractVertices(val) {
  if (!val) return null;
  if (typeof val === 'string') {
    // Some PPro versions serialize path/points as JSON string
    if (val.charAt(0) === '{' || val.charAt(0) === '[') {
      try {
        val = JSON.parse(val);
      } catch (e) {
        return null;
      }
    } else {
      return null;
    }
  }
  if (val instanceof Array && val.length >= 3) {
    var pts = [];
    for (var i = 0; i < val.length; i++) {
      var item = val[i];
      if (item && typeof item.x === 'number' && typeof item.y === 'number') {
        pts.push({ x: item.x, y: item.y });
      } else if (item instanceof Array && item.length >= 2) {
        pts.push({ x: Number(item[0]), y: Number(item[1]) });
      }
    }
    if (pts.length >= 3) return pts;
  }
  if (val && val.vertices instanceof Array && val.vertices.length >= 3) {
    return _kxTryExtractVertices(val.vertices);
  }
  if (val && val.points instanceof Array && val.points.length >= 3) {
    return _kxTryExtractVertices(val.points);
  }
  if (val && val.corners instanceof Array && val.corners.length >= 4) {
    return _kxTryExtractVertices(val.corners);
  }
  // Bounding-box / center fallback for Object Mask Tracker objects
  if (val && typeof val.x === 'number' && typeof val.y === 'number') {
    var hw = (typeof val.width === 'number' ? val.width : 0.1) * 0.5;
    var hh = (typeof val.height === 'number' ? val.height : 0.1) * 0.5;
    return [
      { x: val.x - hw, y: val.y - hh },
      { x: val.x + hw, y: val.y - hh },
      { x: val.x + hw, y: val.y + hh },
      { x: val.x - hw, y: val.y + hh }
    ];
  }
  return null;
}

function kinetix_loadSelectedClipMask() {
  try {
    var seq = _kxGetActiveSequence();
    if (!seq) {
      return _kxResult({ ok: false, error: 'Aktif bir sekans acik degil.' });
    }
    var sel = seq.getSelection();
    if (!sel || sel.length === 0) {
      return _kxResult({ ok: false, error: 'Lutfen zaman cizelgesinde maskeli bir klip secin.' });
    }

    var clip = sel[0];
    var components = clip.components;
    var foundMasks = [];
    var debugComponents = [];

    if (components && components.numItems > 0) {
      for (var c = 0; c < components.numItems; c++) {
        var comp = components[c];
        var compName = comp.displayName || '';
        var compMatch = comp.matchName || '';
        var cLower = compName.toLowerCase();
        var mLower = compMatch.toLowerCase();
        var isMaskLike = (cLower.indexOf('mask') !== -1) ||
                         (cLower.indexOf('rotoscope') !== -1) ||
                         (cLower.indexOf('object') !== -1) ||
                         (mLower.indexOf('mask') !== -1) ||
                         (mLower.indexOf('opacity') !== -1);

        var props = comp.properties;
        var debugProps = [];
        if (!props || props.numItems === 0) {
          debugComponents.push({ name: compName, match: compMatch, props: [] });
          continue;
        }

        for (var p = 0; p < props.numItems; p++) {
          var prop = props[p];
          var pName = prop.displayName || '';
          var pLower = pName.toLowerCase();
          var isTrackProp = (pLower.indexOf('mask path') !== -1) ||
                            (pLower.indexOf('tracker') !== -1) ||
                            (pLower.indexOf('shape') !== -1) ||
                            (pLower === 'path');

          var keys = null;
          try {
            if (typeof prop.getKeys === 'function') {
              keys = prop.getKeys();
            }
          } catch (ke) {
            keys = null;
          }

          if (isMaskLike || isTrackProp) {
            debugProps.push(pName + '(' + (keys ? keys.length : 0) + ')');
          }

          if (isTrackProp || (isMaskLike && keys && keys.length > 0)) {
            var frames = [];
            if (keys && keys.length > 0) {
              for (var k = 0; k < keys.length; k++) {
                var t = keys[k];
                var tSec = (typeof t === 'number') ? t : (t && typeof t.seconds === 'number' ? t.seconds : 0);
                var rawVal = null;
                try {
                  rawVal = prop.getValueAtTime(t);
                } catch (ve) {
                  rawVal = null;
                }
                var verts = _kxTryExtractVertices(rawVal);
                if (verts) {
                  frames.push({ time: tSec, vertices: verts });
                }
              }
            }

            if (frames.length > 0 || isTrackProp) {
              foundMasks.push({
                componentName: compName,
                componentMatchName: compMatch,
                propertyName: pName,
                keyCount: keys ? keys.length : 0,
                frames: frames
              });
            }
          }
        }
        debugComponents.push({ name: compName, match: compMatch, props: debugProps });
      }
    }

    return _kxResult({
      ok: true,
      clipName: clip.name || 'Selected Clip',
      projectPath: app.project.path || '',
      seqWidth: seq.frameSizeHorizontal || 1920,
      seqHeight: seq.frameSizeVertical || 1080,
      clipStartSeconds: clip.start ? clip.start.seconds : 0,
      clipInPointSeconds: clip.inPoint ? clip.inPoint.seconds : 0,
      masks: foundMasks,
      debugComponents: debugComponents
    });
  } catch (e) {
    return _kxResult({ ok: false, error: 'Maske okunurken hata: ' + e.toString() });
  }
}

function _kxFindComponent(clip, matchNames, displayNames) {
  var comps = clip.components;
  if (!comps) return null;
  for (var i = 0; i < comps.numItems; i++) {
    var comp = comps[i];
    var m = comp.matchName || '';
    var d = comp.displayName || '';
    for (var j = 0; j < matchNames.length; j++) {
      if (m === matchNames[j]) return comp;
    }
    for (var k = 0; k < displayNames.length; k++) {
      if (d === displayNames[k]) return comp;
    }
  }
  return null;
}

function _kxFindQEClip(seq, clip) {
  try {
    app.enableQE();
    var qeSeq = qe.project.getActiveSequence();
    if (!qeSeq) return null;
    var numTracks = qeSeq.numVideoTracks;
    for (var t = 0; t < numTracks; t++) {
      var track = qeSeq.getVideoTrackAt(t);
      if (!track) continue;
      for (var c = 0; c < track.numItems; c++) {
        var item = track.getItemAt(c);
        if (!item) continue;
        if (item.name === clip.name && Math.abs(item.start.secs - clip.start.seconds) < 0.05) {
          return item;
        }
      }
    }
  } catch (e) {
    return null;
  }
  return null;
}

function _kxEnsureEffect(seq, clip, matchNames, displayNames, qeEffectName) {
  var comp = _kxFindComponent(clip, matchNames, displayNames);
  if (comp) return comp;

  var qeClip = _kxFindQEClip(seq, clip);
  if (qeClip) {
    try {
      var fx = qe.project.getVideoEffectByName(qeEffectName);
      if (fx) {
        qeClip.addVideoEffect(fx);
        return _kxFindComponent(clip, matchNames, displayNames);
      }
    } catch (e) {
      // Ignore and return null
    }
  }
  return null;
}

function _kxFindProp(comp, names) {
  if (!comp || !comp.properties) return null;
  for (var i = 0; i < comp.properties.numItems; i++) {
    var prop = comp.properties[i];
    var d = (prop.displayName || '').toLowerCase();
    for (var j = 0; j < names.length; j++) {
      if (d === names[j].toLowerCase()) {
        return prop;
      }
    }
  }
  return null;
}

function _kxFindAllProps(comp, names) {
  var out = [];
  if (!comp || !comp.properties) return out;
  for (var i = 0; i < comp.properties.numItems; i++) {
    var prop = comp.properties[i];
    var d = (prop.displayName || '').toLowerCase();
    for (var j = 0; j < names.length; j++) {
      if (d === names[j].toLowerCase()) {
        out.push(prop);
        break;
      }
    }
  }
  return out;
}

function _kxWriteKeyframes(prop, times, values) {
  if (!prop || !times || times.length === 0) return 0;
  var written = 0;
  try {
    if (typeof prop.setTimeVarying === 'function') {
      prop.setTimeVarying(true);
    }
    for (var i = 0; i < times.length; i++) {
      try {
        var keyTime = new Time();
        keyTime.seconds = Number(times[i]);
        if (typeof prop.addKey === 'function') {
          prop.addKey(keyTime);
        }
        if (typeof prop.setValueAtKey === 'function') {
          prop.setValueAtKey(keyTime, values[i], 1);
          written++;
        } else if (typeof prop.setValueAtTime === 'function') {
          prop.setValueAtTime(keyTime.seconds, values[i], 1);
          written++;
        }
      } catch (innerErr) {}
    }
    try {
      if (typeof prop.getKeys === 'function') {
        var actualKeys = prop.getKeys();
        if (actualKeys && actualKeys.length) {
          return actualKeys.length;
        }
      }
    } catch (ge) {}
    return written;
  } catch (e) {
    return written;
  }
}

function kinetix_applyTrackingToSelection(payloadJson) {
  try {
    var seq = _kxGetActiveSequence();
    if (!seq) {
      return _kxResult({ ok: false, error: 'Aktif bir sekans acik degil.' });
    }
    var sel = seq.getSelection();
    if (!sel || sel.length === 0) {
      return _kxResult({ ok: false, error: 'Hedef katman olarak en az bir klip secin.' });
    }

    var payload = JSON.parse(payloadJson);
    var keyframes = payload.keyframes || [];
    if (keyframes.length === 0) {
      return _kxResult({ ok: false, error: 'Uygulanacak anahtar kare verisi bos.' });
    }

    var targetEffect = payload.targetEffect || 'transform'; // 'transform' | 'motion' | 'cornerpin'
    var axes = payload.axes || { position: true, scale: true, rotation: true };

    var times = [];
    var posNormVals = [];
    var anchorNormVals = [];
    var hasAnchor = false;
    var scaleVals = [];
    var rotVals = [];
    var ulVals = [];
    var urVals = [];
    var lrVals = [];
    var llVals = [];

    for (var i = 0; i < keyframes.length; i++) {
      var kf = keyframes[i];
      times.push(kf.time);
      posNormVals.push(kf.positionNorm);
      if (kf.anchorPointNorm) {
        anchorNormVals.push(kf.anchorPointNorm);
        hasAnchor = true;
      }
      scaleVals.push(kf.scale);
      rotVals.push(kf.rotation);
      if (kf.cornersNorm) {
        ulVals.push(kf.cornersNorm.upperLeft);
        urVals.push(kf.cornersNorm.upperRight);
        lrVals.push(kf.cornersNorm.lowerRight);
        llVals.push(kf.cornersNorm.lowerLeft);
      }
    }

    var details = [];
    var appliedCount = 0;
    var srcStart = typeof payload.sourceClipStartSeconds === 'number' ? payload.sourceClipStartSeconds : null;
    var srcIn = typeof payload.sourceClipInPointSeconds === 'number' ? payload.sourceClipInPointSeconds : 0;
    var t0 = times.length > 0 ? times[0] : 0;

    for (var s = 0; s < sel.length; s++) {
      var clip = sel[s];
      // Skip audio-only track items
      if (clip.mediaType && clip.mediaType === 'Audio') {
        details.push({ name: clip.name, status: 'skipped-audio' });
        continue;
      }

      // Compute clip-internal keyframe times aligned on the sequence timeline
      var clipStart = clip.start ? parseFloat(clip.start.seconds) : 0;
      var clipEnd = clip.end ? parseFloat(clip.end.seconds) : (clipStart + 3600);
      var clipIn = clip.inPoint ? parseFloat(clip.inPoint.seconds) : 0;
      if (isNaN(clipStart)) clipStart = 0;
      if (isNaN(clipIn)) clipIn = 0;
      var targetBaseTime = clipIn;

      if (srcStart !== null && !isNaN(srcStart)) {
        if (srcStart >= clipStart - 0.05 && srcStart <= clipEnd + 0.05) {
          targetBaseTime = clipIn + Math.max(0, srcStart - clipStart);
        }
      }

      var clipTimes = [];
      for (var ti = 0; ti < times.length; ti++) {
        clipTimes.push(targetBaseTime + (times[ti] - t0));
      }

      var maxKeys = 0;

      if (targetEffect === 'cornerpin') {
        var cpComp = _kxEnsureEffect(
          seq,
          clip,
          ['AE.ADBE Corner Pin', 'ADBE Corner Pin'],
          ['Corner Pin', 'Köşe Sabitleme'],
          'Corner Pin'
        );
        if (!cpComp) {
          details.push({ name: clip.name, status: 'error', message: 'Corner Pin efekti eklenemedi.' });
          continue;
        }
        var ulProp = _kxFindProp(cpComp, ['Upper Left', 'Sol Üst']);
        var urProp = _kxFindProp(cpComp, ['Upper Right', 'Sağ Üst']);
        var lrProp = _kxFindProp(cpComp, ['Lower Right', 'Sağ Alt']);
        var llProp = _kxFindProp(cpComp, ['Lower Left', 'Sol Alt']);

        var k1 = _kxWriteKeyframes(ulProp, clipTimes, ulVals);
        var k2 = _kxWriteKeyframes(urProp, clipTimes, urVals);
        var k3 = _kxWriteKeyframes(lrProp, clipTimes, lrVals);
        var k4 = _kxWriteKeyframes(llProp, clipTimes, llVals);
        maxKeys = Math.max(k1, k2, k3, k4);
        if (maxKeys > 0) appliedCount++;
        details.push({ name: clip.name, status: maxKeys > 0 ? 'ok' : 'error', effect: 'Corner Pin', keys: maxKeys });
      } else {
        var comp = null;
        if (targetEffect === 'motion') {
          comp = _kxFindComponent(clip, ['ADBE Motion'], ['Motion', 'Hareket']);
        } else {
          comp = _kxEnsureEffect(
            seq,
            clip,
            ['AE.ADBE Geometry', 'AE.ADBE Geometry2', 'ADBE Geometry2'],
            ['Transform', 'Dönüştür'],
            'Transform'
          );
        }

        if (!comp) {
          details.push({ name: clip.name, status: 'error', message: 'Transform/Motion efekti bulunamadi.' });
          continue;
        }

        if (hasAnchor && axes.position) {
          var anchorProp = _kxFindProp(comp, ['Anchor Point', 'Dayanak Noktası']);
          var ka = _kxWriteKeyframes(anchorProp, clipTimes, anchorNormVals);
          if (ka > maxKeys) maxKeys = ka;
        }
        if (axes.position) {
          var posProp = _kxFindProp(comp, ['Position', 'Konum']);
          var kp = _kxWriteKeyframes(posProp, clipTimes, posNormVals);
          if (kp > maxKeys) maxKeys = kp;
        }
        if (axes.scale) {
          var uniformProp = _kxFindProp(comp, ['Uniform Scale', 'Tekdüze Ölçek']);
          if (uniformProp && typeof uniformProp.setValue === 'function') {
            try { uniformProp.setValue(true, true); } catch (ue) {}
          }
          var scaleProps = _kxFindAllProps(comp, [
            'Scale',
            'Scale Height',
            'Scale Width',
            'Ölçek',
            'Ölçek Yüksekliği',
            'Ölçek Genişliği'
          ]);
          for (var sp = 0; sp < scaleProps.length; sp++) {
            var ks = _kxWriteKeyframes(scaleProps[sp], clipTimes, scaleVals);
            if (ks > maxKeys) maxKeys = ks;
          }
        }
        if (axes.rotation) {
          var rotProp = _kxFindProp(comp, ['Rotation', 'Döndürme']);
          var kr = _kxWriteKeyframes(rotProp, clipTimes, rotVals);
          if (kr > maxKeys) maxKeys = kr;
        }
        if (maxKeys > 0) appliedCount++;
        details.push({
          name: clip.name,
          status: maxKeys > 0 ? 'ok' : 'error',
          effect: targetEffect === 'motion' ? 'Motion' : 'Transform',
          keys: maxKeys
        });
      }
    }

    var writtenKeys = details.length > 0 && details[0].keys ? details[0].keys : 0;
    return _kxResult({
      ok: appliedCount > 0,
      appliedCount: appliedCount,
      writtenKeys: writtenKeys,
      totalSelected: sel.length,
      details: details
    });
  } catch (e) {
    return _kxResult({ ok: false, error: 'Anahtar kare yazma hatasi: ' + e.toString() });
  }
}
