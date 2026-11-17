(function () {
  'use strict';

  var cs = new window.CSInterface();
  var mathEngine = window.KinetixMath;
  var prprojParser = window.KinetixPrproj;
  var i18n = window.KinetixI18n;

  var savedLang = 'tr';
  try {
    savedLang = window.localStorage.getItem('kinetix_lang') || 'tr';
  } catch (e) {}

  var state = {
    lang: savedLang,
    seqWidth: 1920,
    seqHeight: 1080,
    sequenceName: '',
    projectPath: '',
    clipName: '',
    clipStartSeconds: null,
    clipInPointSeconds: 0,
    rawFrames: [],
    loadedSource: '',
    mode: 'pin', // 'pin' | 'cornerpin' | 'stabilize'
    currentFrameIndex: 0
  };

  // DOM elements
  var langSelect = document.getElementById('langSelect');
  var onboardingView = document.getElementById('onboardingView');
  var workspaceView = document.getElementById('workspaceView');
  var onboardingStatus = document.getElementById('onboardingStatus');
  var btnResetMask = document.getElementById('btnResetMask');
  var seqBadge = document.getElementById('seqBadge');
  var cepBadge = document.getElementById('cepBadge');
  var maskSummaryBadge = document.getElementById('maskSummaryBadge');
  var btnLoadMask = document.getElementById('btnLoadMask');
  var btnLoadPrproj = document.getElementById('btnLoadPrproj');
  var btnToggleJson = document.getElementById('btnToggleJson');
  var jsonDrawer = document.getElementById('jsonDrawer');
  var jsonInput = document.getElementById('jsonInput');
  var btnLoadSample = document.getElementById('btnLoadSample');
  var btnParseJson = document.getElementById('btnParseJson');
  var previewCanvas = document.getElementById('previewCanvas');
  var previewFrameLabel = document.getElementById('previewFrameLabel');
  var frameScrubber = document.getElementById('frameScrubber');
  var segButtons = document.querySelectorAll('.seg-btn');
  var chkPosition = document.getElementById('chkPosition');
  var chkScale = document.getElementById('chkScale');
  var chkRotation = document.getElementById('chkRotation');
  var selTargetEffect = document.getElementById('selTargetEffect');
  var numRefFrame = document.getElementById('numRefFrame');
  var rngSmoothing = document.getElementById('rngSmoothing');
  var smoothValue = document.getElementById('smoothValue');
  var numOffsetX = document.getElementById('numOffsetX');
  var numOffsetY = document.getElementById('numOffsetY');
  var btnApplyTracking = document.getElementById('btnApplyTracking');
  var btnStabilize = document.getElementById('btnStabilize');
  var statusBar = document.getElementById('statusBar');

  function t(key, vars) {
    var pack = i18n.getLangPack(state.lang);
    return i18n.format(pack[key] || key, vars);
  }

  function applyLanguage(lang) {
    state.lang = lang || 'tr';
    try {
      window.localStorage.setItem('kinetix_lang', state.lang);
    } catch (e) {}

    var pack = i18n.getLangPack(state.lang);
    document.documentElement.lang = state.lang;
    document.documentElement.dir = pack.dir || 'ltr';
    if (langSelect) langSelect.value = state.lang;

    var nodes = document.querySelectorAll('[data-i18n]');
    nodes.forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      if (pack[key]) {
        el.textContent = pack[key];
      }
    });

    if (!cs.isRunningInCEP()) {
      cepBadge.textContent = pack.previewMode;
    }
    if (state.rawFrames.length > 0) {
      maskSummaryBadge.textContent = state.rawFrames.length + ' ' + pack.framesUnit + ' · ' + state.loadedSource;
    }
    renderPreview();
  }

  function setStatus(msg, type) {
    var cls = 'status-bar' + (type ? ' ' + type : '');
    statusBar.textContent = msg;
    statusBar.className = cls;
    onboardingStatus.textContent = msg;
    onboardingStatus.className = cls;
  }

  function evalHost(fnCall) {
    return new Promise(function (resolve) {
      cs.evalScript(fnCall, function (res) {
        try {
          resolve(JSON.parse(res));
        } catch (e) {
          resolve({ ok: false, error: res || 'ExtendScript error' });
        }
      });
    });
  }

  function refreshSequenceInfo() {
    if (!cs.isRunningInCEP()) {
      cepBadge.textContent = t('previewMode');
      seqBadge.textContent = state.seqWidth + 'x' + state.seqHeight;
      return Promise.resolve();
    }
    return evalHost('kinetix_getSequenceInfo()').then(function (res) {
      if (res && res.ok) {
        state.seqWidth = res.seqWidth || 1920;
        state.seqHeight = res.seqHeight || 1080;
        state.sequenceName = res.sequenceName || '';
        state.projectPath = res.projectPath || '';
        seqBadge.textContent = state.seqWidth + 'x' + state.seqHeight;
      } else {
        seqBadge.textContent = t('seqNone');
      }
    });
  }

  function setLoadedMask(frames, sourceLabel) {
    state.rawFrames = frames || [];
    state.loadedSource = sourceLabel || '';
    state.currentFrameIndex = 0;

    var hasData = state.rawFrames.length > 0;
    btnApplyTracking.disabled = !hasData;
    btnStabilize.disabled = !hasData;
    frameScrubber.disabled = !hasData;

    if (hasData) {
      onboardingView.classList.add('hidden');
      workspaceView.classList.remove('hidden');
      frameScrubber.min = 0;
      frameScrubber.max = state.rawFrames.length - 1;
      frameScrubber.value = 0;
      numRefFrame.max = state.rawFrames.length - 1;
      numRefFrame.value = 0;
      maskSummaryBadge.textContent = state.rawFrames.length + ' ' + t('framesUnit') + ' · ' + state.loadedSource;
      setStatus(t('readyToApply', { count: state.rawFrames.length }), 'ok');
    } else {
      workspaceView.classList.add('hidden');
      onboardingView.classList.remove('hidden');
      onboardingStatus.classList.add('hidden');
      maskSummaryBadge.textContent = t('noData');
    }
    renderPreview();
  }

  function buildSampleFrames() {
    var frames = [];
    var total = 30;
    for (var i = 0; i < total; i++) {
      var t = i / 30;
      var cx = 0.35 + 0.3 * (i / (total - 1));
      var cy = 0.5 + 0.08 * Math.sin((i / total) * Math.PI * 2);
      var scale = 1 + 0.25 * (i / (total - 1));
      var angle = -0.25 + 0.5 * (i / (total - 1));
      var hw = 0.08 * scale;
      var hh = 0.1 * scale;
      var cosA = Math.cos(angle);
      var sinA = Math.sin(angle);
      var corners = [
        [-hw, -hh],
        [hw, -hh],
        [hw, hh],
        [-hw, hh]
      ].map(function (pt) {
        return {
          x: cx + pt[0] * cosA - pt[1] * sinA,
          y: cy + pt[0] * sinA + pt[1] * cosA
        };
      });
      frames.push({ time: Number(t.toFixed(4)), vertices: corners });
    }
    return frames;
  }

  function renderPreview() {
    var ctx = previewCanvas.getContext('2d');
    var w = previewCanvas.width;
    var h = previewCanvas.height;
    ctx.clearRect(0, 0, w, h);

    // Subtle grid
    ctx.strokeStyle = '#1f2026';
    ctx.lineWidth = 1;
    for (var gx = 0; gx < w; gx += 32) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke();
    }
    for (var gy = 0; gy < h; gy += 28) {
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke();
    }

    if (state.rawFrames.length === 0) {
      previewFrameLabel.textContent = t('framePrefix') + ': - / -';
      ctx.fillStyle = '#64748b';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(t('canvasEmpty'), w / 2, h / 2 + 4);
      return;
    }

    // Draw centroid trajectory across all frames
    ctx.beginPath();
    for (var i = 0; i < state.rawFrames.length; i++) {
      var c = mathEngine.computeCentroid(state.rawFrames[i].vertices);
      var px = c.x * w;
      var py = c.y * h;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Draw current frame polygon
    var idx = Math.max(0, Math.min(state.rawFrames.length - 1, state.currentFrameIndex));
    var frame = state.rawFrames[idx];
    var verts = frame.vertices;

    if (verts && verts.length > 0) {
      ctx.beginPath();
      for (var v = 0; v < verts.length; v++) {
        var vx = verts[v].x * w;
        var vy = verts[v].y * h;
        if (v === 0) ctx.moveTo(vx, vy);
        else ctx.lineTo(vx, vy);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(45, 108, 223, 0.25)';
      ctx.fill();
      ctx.strokeStyle = '#60a5fa';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Corner / vertex handles
      ctx.fillStyle = '#f8fafc';
      for (var k = 0; k < verts.length; k++) {
        ctx.beginPath();
        ctx.arc(verts[k].x * w, verts[k].y * h, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    previewFrameLabel.textContent = t('framePrefix') + ': ' + (idx + 1) + ' / ' + state.rawFrames.length +
      ' (' + frame.time.toFixed(2) + 's)';
  }

  function setMode(newMode) {
    state.mode = newMode;
    segButtons.forEach(function (btn) {
      btn.classList.toggle('active', btn.getAttribute('data-mode') === newMode);
    });
    if (newMode === 'cornerpin') {
      selTargetEffect.value = 'cornerpin';
    } else if (selTargetEffect.value === 'cornerpin') {
      selTargetEffect.value = 'transform';
    }
  }

  function executeApply(overrideMode) {
    if (state.rawFrames.length === 0) {
      setStatus(t('errLoadFirst'), 'err');
      return;
    }

    var activeMode = overrideMode || state.mode;
    var targetEffect = activeMode === 'cornerpin' ? 'cornerpin' : selTargetEffect.value;

    var solved = mathEngine.solveTracking(state.rawFrames, {
      seqWidth: state.seqWidth,
      seqHeight: state.seqHeight,
      normalizedInput: true,
      referenceIndex: parseInt(numRefFrame.value, 10) || 0,
      mode: activeMode,
      smoothing: parseInt(rngSmoothing.value, 10) || 0,
      offset: {
        x: parseFloat(numOffsetX.value) || 0,
        y: parseFloat(numOffsetY.value) || 0,
        scale: 0,
        rotation: 0
      }
    });

    var payload = {
      targetEffect: targetEffect,
      sourceClipStartSeconds: state.clipStartSeconds,
      sourceClipInPointSeconds: state.clipInPointSeconds,
      axes: {
        position: chkPosition.checked,
        scale: chkScale.checked,
        rotation: chkRotation.checked
      },
      keyframes: solved.keyframes
    };

    if (!cs.isRunningInCEP()) {
      setStatus(
        t('previewCalculated', {
          count: solved.frameCount,
          mode: activeMode,
          effect: targetEffect
        }),
        'ok'
      );
      return;
    }

    setStatus(t('writingKeys'), '');
    var escaped = JSON.stringify(JSON.stringify(payload));
    evalHost('kinetix_applyTrackingToSelection(' + escaped + ')').then(function (res) {
      if (res && res.ok) {
        var countShown = res.writtenKeys || solved.frameCount;
        setStatus(
          t('keysApplied', { clips: res.appliedCount, keys: countShown }),
          'ok'
        );
      } else {
        setStatus(res && res.error ? res.error : t('errApplyFailed'), 'err');
      }
    });
  }

  // Event bindings
  btnLoadMask.addEventListener('click', function () {
    refreshSequenceInfo().then(function () {
      if (!cs.isRunningInCEP()) {
        setLoadedMask(buildSampleFrames(), t('demoSource'));
        return;
      }
      setStatus(t('readingMask'), '');
      evalHost('kinetix_loadSelectedClipMask()').then(function (res) {
        if (!res || !res.ok) {
          setStatus(res && res.error ? res.error : t('errMaskRead'), 'err');
          return;
        }
        state.projectPath = res.projectPath || state.projectPath;
        state.clipName = res.clipName || '';
        state.seqWidth = res.seqWidth || state.seqWidth;
        state.seqHeight = res.seqHeight || state.seqHeight;
        state.clipStartSeconds = typeof res.clipStartSeconds === 'number' ? res.clipStartSeconds : null;
        state.clipInPointSeconds = typeof res.clipInPointSeconds === 'number' ? res.clipInPointSeconds : 0;

        var masks = res.masks || [];
        var withFrames = masks.filter(function (m) { return m.frames && m.frames.length > 0; });
        if (withFrames.length > 0) {
          setLoadedMask(withFrames[0].frames, withFrames[0].componentName || 'Premiere Mask');
          return;
        }

        // Fallback to offline .prmf (Premiere 2026 AI Object Mask) & .prproj XML extraction
        if (state.projectPath && typeof require === 'function') {
          try {
            var xmlMasks = prprojParser.loadMasksFromPrproj(state.projectPath, state.clipName);
            if (xmlMasks.length > 0) {
              setLoadedMask(xmlMasks[0].frames, xmlMasks[0].name || '.prproj XML');
              return;
            }
          } catch (err) {
            setStatus(t('errPrprojRead', { msg: err.message }), 'err');
            return;
          }
        }

        var dbg = (res.debugComponents || [])
          .filter(function (c) { return c.props && c.props.length > 0; })
          .map(function (c) { return c.name + ':[' + c.props.join(',') + ']'; })
          .join(' | ');
        setStatus(
          t('errNoKeysFound') + (dbg ? ' ' + t('foundLabel') + ': ' + dbg : ''),
          'err'
        );
      });
    });
  });

  btnLoadPrproj.addEventListener('click', function () {
    if (!state.projectPath) {
      setStatus(t('errNoPrprojPath'), 'err');
      return;
    }
    try {
      var xmlMasks = prprojParser.loadMasksFromPrproj(state.projectPath, state.clipName);
      if (xmlMasks.length > 0) {
        setLoadedMask(xmlMasks[0].frames, xmlMasks[0].name || '.prproj XML');
      } else {
        setStatus(t('errNoMasksInPrproj'), 'err');
      }
    } catch (e) {
      setStatus(t('errPrprojRead', { msg: e.message }), 'err');
    }
  });

  btnToggleJson.addEventListener('click', function () {
    jsonDrawer.classList.toggle('hidden');
  });

  btnLoadSample.addEventListener('click', function () {
    var sample = buildSampleFrames();
    jsonInput.value = JSON.stringify(sample.slice(0, 4), null, 2);
    setLoadedMask(sample, t('sampleSource'));
  });

  btnParseJson.addEventListener('click', function () {
    try {
      var frames = prprojParser.parseMaskJson(jsonInput.value);
      setLoadedMask(frames, 'JSON');
      jsonDrawer.classList.add('hidden');
    } catch (e) {
      setStatus(t('errJsonParse', { msg: e.message }), 'err');
    }
  });

  frameScrubber.addEventListener('input', function () {
    state.currentFrameIndex = parseInt(frameScrubber.value, 10) || 0;
    renderPreview();
  });

  segButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      setMode(btn.getAttribute('data-mode'));
    });
  });

  rngSmoothing.addEventListener('input', function () {
    smoothValue.textContent = rngSmoothing.value + '%';
  });

  btnApplyTracking.addEventListener('click', function () {
    executeApply(state.mode === 'stabilize' ? 'pin' : state.mode);
  });

  btnStabilize.addEventListener('click', function () {
    setMode('stabilize');
    executeApply('stabilize');
  });

  btnResetMask.addEventListener('click', function () {
    setLoadedMask([], '');
  });

  if (langSelect) {
    langSelect.addEventListener('change', function () {
      applyLanguage(langSelect.value);
    });
  }

  // Init
  applyLanguage(state.lang);
  refreshSequenceInfo();
  renderPreview();
})();
