'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var fs = require('node:fs');
var os = require('node:os');
var path = require('node:path');
var zlib = require('node:zlib');

var mathEngine = require('../client/js/mathEngine.js');
var prprojParser = require('../client/js/prprojParser.js');

function makeQuad(cxNorm, cyNorm, hwPx, hhPx, angleDeg, seqW, seqH) {
  var w = seqW || 1920;
  var h = seqH || 1080;
  var cx = cxNorm * w;
  var cy = cyNorm * h;
  var rad = (angleDeg * Math.PI) / 180;
  var c = Math.cos(rad);
  var s = Math.sin(rad);
  var pts = [
    [-hwPx, -hhPx],
    [hwPx, -hhPx],
    [hwPx, hhPx],
    [-hwPx, hhPx]
  ];
  return pts.map(function (p) {
    return {
      x: (cx + p[0] * c - p[1] * s) / w,
      y: (cy + p[0] * s + p[1] * c) / h
    };
  });
}

test('2D Pinning computes exact position, scale, and rotation via Procrustes', function () {
  var frames = [
    { time: 0, vertices: makeQuad(0.25, 0.5, 50, 50, 0) },
    { time: 1, vertices: makeQuad(0.75, 0.25, 100, 100, 45) }
  ];

  var res = mathEngine.solveTracking(frames, {
    seqWidth: 1920,
    seqHeight: 1080,
    normalizedInput: true,
    mode: 'pin'
  });

  assert.equal(res.frameCount, 2);
  assert.ok(Math.abs(res.keyframes[0].position[0] - 480) < 0.01);
  assert.ok(Math.abs(res.keyframes[0].position[1] - 540) < 0.01);
  assert.ok(Math.abs(res.keyframes[0].scale - 100) < 0.01);
  assert.ok(Math.abs(res.keyframes[0].rotation - 0) < 0.01);

  assert.ok(Math.abs(res.keyframes[1].position[0] - 1440) < 0.01);
  assert.ok(Math.abs(res.keyframes[1].position[1] - 270) < 0.01);
  assert.ok(Math.abs(res.keyframes[1].scale - 200) < 0.5);
  assert.ok(Math.abs(res.keyframes[1].rotation - 45) < 0.5);
});

test('Center Lock keeps moving subject pinned to exact frame center via Anchor Point + Scale', function () {
  var frames = [
    { time: 0, vertices: makeQuad(0.25, 0.5, 100, 100, 0) },  // x=480, full size
    { time: 1, vertices: makeQuad(0.625, 0.5, 50, 50, 10) }   // x=1200, shrunk 50% -> invScale=200%
  ];

  var res = mathEngine.solveTracking(frames, {
    seqWidth: 1920,
    seqHeight: 1080,
    normalizedInput: true,
    mode: 'centerlock'
  });

  // Anchor Point tracks subject centroid; Position stays locked at exact frame center (960, 540)
  assert.ok(Math.abs(res.keyframes[0].anchorPoint[0] - 480) < 0.01);
  assert.ok(Math.abs(res.keyframes[1].anchorPoint[0] - 1200) < 0.01);
  assert.ok(Math.abs(res.keyframes[0].position[0] - 960) < 0.01);
  assert.ok(Math.abs(res.keyframes[1].position[0] - 960) < 0.01);
  assert.ok(Math.abs(res.keyframes[1].position[1] - 540) < 0.01);
  assert.ok(res.keyframes[1].scale > 150);
  assert.ok(Math.abs(res.keyframes[1].rotation - (-10)) < 0.5);
});

test('Stabilize mode removes camera shake relative to reference frame', function () {
  var frames = [
    { time: 0, vertices: makeQuad(0.25, 0.5, 50, 50, 0) },
    { time: 1, vertices: makeQuad(0.625, 0.5, 50, 50, 0) }
  ];

  var res = mathEngine.solveTracking(frames, {
    seqWidth: 1920,
    seqHeight: 1080,
    normalizedInput: true,
    mode: 'stabilize'
  });

  assert.ok(Math.abs(res.keyframes[0].anchorPoint[0] - 480) < 0.01);
  assert.ok(Math.abs(res.keyframes[1].anchorPoint[0] - 1200) < 0.01);
  assert.ok(Math.abs(res.keyframes[0].position[0] - 480) < 0.01);
  assert.ok(Math.abs(res.keyframes[1].position[0] - 480) < 0.01);
});

test('Corner Pin orders 4 corners [TL, TR, BR, BL] and outputs normalized coords', function () {
  // Intentionally pass shuffled corners
  var frames = [
    {
      time: 0,
      vertices: [
        { x: 0.8, y: 0.8 }, // BR
        { x: 0.2, y: 0.2 }, // TL
        { x: 0.2, y: 0.8 }, // BL
        { x: 0.8, y: 0.2 }  // TR
      ]
    }
  ];

  var res = mathEngine.solveTracking(frames, {
    seqWidth: 1920,
    seqHeight: 1080,
    normalizedInput: true,
    mode: 'cornerpin'
  });

  var cn = res.keyframes[0].cornersNorm;
  assert.deepEqual(cn.upperLeft, [0.2, 0.2]);
  assert.deepEqual(cn.upperRight, [0.8, 0.2]);
  assert.deepEqual(cn.lowerRight, [0.8, 0.8]);
  assert.deepEqual(cn.lowerLeft, [0.2, 0.8]);
});

test('AI Rotoscope fallback handles varying vertex counts across frames', function () {
  var frames = [
    {
      time: 0,
      vertices: [
        { x: 0.4, y: 0.4 }, { x: 0.6, y: 0.4 }, { x: 0.6, y: 0.6 }, { x: 0.4, y: 0.6 }
      ]
    },
    {
      time: 1,
      vertices: [
        { x: 0.3, y: 0.3 }, { x: 0.5, y: 0.28 }, { x: 0.7, y: 0.3 },
        { x: 0.72, y: 0.5 }, { x: 0.7, y: 0.7 }, { x: 0.3, y: 0.7 }
      ]
    }
  ];

  var res = mathEngine.solveTracking(frames, {
    seqWidth: 1920,
    seqHeight: 1080,
    normalizedInput: true,
    mode: 'pin'
  });

  assert.equal(res.frameCount, 2);
  assert.ok(res.keyframes[1].scale > 150);
});

test('Scale is safely clamped to avoid Premiere 30000px Transform buffer error', function () {
  var frames = [
    { time: 0, vertices: makeQuad(0.5, 0.5, 5, 5, 0) },     // tiny 10x10px ref
    { time: 1, vertices: makeQuad(0.5, 0.5, 500, 500, 0) }  // 100x growth -> 10000%
  ];

  var res = mathEngine.solveTracking(frames, {
    seqWidth: 3840,
    seqHeight: 2160,
    normalizedInput: true,
    mode: 'pin'
  });

  // On 4K (3840px), 3840 * (scale / 100) must stay <= 12000px (< 30000px limit)
  assert.ok(res.keyframes[1].scale <= 312.6);
});

test('Angle unwrapping avoids 360-degree jumps', function () {
  var unwrapped = mathEngine.unwrapAngles([170, 178, -175, -165]);
  assert.deepEqual(unwrapped, [170, 178, 185, 195]);
});

test('prprojParser extracts mask keyframes from gzipped .prproj XML', function () {
  var ticks0 = 0;
  var ticks1 = prprojParser.PPRO_TICKS_PER_SECOND;
  var mockXml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<PremiereData Version="3">',
    '  <VideoMask>',
    '    <Name>Mask (1)</Name>',
    '    <Keyframe Time="' + ticks0 + '">',
    '      <Vertices>',
    '        <Point X="0.2" Y="0.2"/>',
    '        <Point X="0.4" Y="0.2"/>',
    '        <Point X="0.4" Y="0.4"/>',
    '        <Point X="0.2" Y="0.4"/>',
    '      </Vertices>',
    '    </Keyframe>',
    '    <Keyframe Time="' + ticks1 + '">',
    '      <Vertices>',
    '        <Point X="0.5" Y="0.5"/>',
    '        <Point X="0.7" Y="0.5"/>',
    '        <Point X="0.7" Y="0.7"/>',
    '        <Point X="0.5" Y="0.7"/>',
    '      </Vertices>',
    '    </Keyframe>',
    '  </VideoMask>',
    '</PremiereData>'
  ].join('\n');

  var tmpFile = path.join(os.tmpdir(), 'kinetix_test_' + Date.now() + '.prproj');
  fs.writeFileSync(tmpFile, zlib.gzipSync(Buffer.from(mockXml, 'utf8')));

  try {
    var masks = prprojParser.loadMasksFromPrproj(tmpFile);
    assert.equal(masks.length, 1);
    assert.equal(masks[0].name, 'Mask (1)');
    assert.equal(masks[0].frames.length, 2);
    assert.equal(masks[0].frames[1].time, 1);
    assert.equal(masks[0].frames[1].vertices.length, 4);
  } finally {
    fs.unlinkSync(tmpFile);
  }
});

test('prprojParser extracts Premiere 2026 ArbVideoComponentParam Tracker base64 keyframes', function () {
  var buf = Buffer.alloc(104);
  buf.writeUInt32LE(1, 0);
  // 3x3 homography with translation tx=+0.15, ty=-0.05
  var mat = [1, 0, 0.15, 0, 1, -0.05, 0, 0, 1];
  for (var i = 0; i < 9; i++) {
    buf.writeFloatLE(mat[i], 4 + i * 4);
  }
  var b64 = buf.toString('base64');
  var xml = [
    '<ArbVideoComponentParam ObjectID="20752" Version="3">',
    '  <ParameterControlType>22</ParameterControlType>',
    '  <Name>Tracker</Name>',
    '  <Keyframes>0,' + b64 + ',0,0,0,0,0,0;254016000000,' + b64 + ',0,0,0,0,0,0;</Keyframes>',
    '</ArbVideoComponentParam>'
  ].join('\n');

  var masks = prprojParser.parseMasksFromXml(xml);
  assert.equal(masks.length, 1);
  assert.equal(masks[0].name, 'Tracker');
  assert.equal(masks[0].frames.length, 2);
  assert.ok(Math.abs(masks[0].frames[0].vertices[0].x - 0.55) < 0.001);
});

test('prprojParser extracts rotation angle from zlib mask alpha chunk via image moments', function () {
  var w = 40, h = 40;
  var raw = Buffer.alloc(w * h);
  // Draw a diagonal bar (~45 deg) inside the mask buffer
  for (var y = 8; y < 32; y++) {
    for (var x = 8; x < 32; x++) {
      if (Math.abs(x - y) <= 2) {
        raw[y * w + x] = 255;
      }
    }
  }
  var compressed = zlib.deflateSync(raw);
  var angleRad = prprojParser.tryExtractChunkAngleRad(compressed, w, h);
  assert.ok(angleRad !== null);
  var deg = (angleRad * 180) / Math.PI;
  assert.ok(Math.abs(deg - 45) < 3);
});

test('prprojParser decodes Premiere 2026 Pen Mask M2 104-byte Tracker rotation & position', function () {
  var buf = Buffer.alloc(104);
  buf.writeUInt32LE(1, 0);
  // Real M2 row-vector matrix from Premiere 2026 Pen Mask Tracker (with rotation + translation)
  var m2 = [0.988, -0.0754, 0.0, 0.2384, 0.988, 0.0, 0.5568, 0.2943, 1.0];
  for (var i = 0; i < 9; i++) {
    buf.writeFloatLE(m2[i], 4 + 36 + i * 4);
  }
  var b64 = buf.toString('base64');
  var quad = prprojParser.decodeArbBase64ToQuad(b64);
  assert.ok(quad && quad.length === 4);

  // Also test a second frame with different rotation so Procrustes yields non-zero delta rotation
  var buf2 = Buffer.alloc(104);
  buf2.writeUInt32LE(1, 0);
  var m2b = [0.9963, -0.0393, 0.0, 0.1243, 0.9963, 0.0, 0.5648, 0.2941, 1.0];
  for (var j = 0; j < 9; j++) {
    buf2.writeFloatLE(m2b[j], 4 + 36 + j * 4);
  }
  var solved = mathEngine.solveTracking([
    { time: 0, vertices: quad },
    { time: 1, vertices: prprojParser.decodeArbBase64ToQuad(buf2.toString('base64')) }
  ], { seqWidth: 1080, seqHeight: 1920, mode: 'pin' });

  assert.ok(Math.abs(solved.keyframes[1].rotation - 3.7) < 0.3);
});
