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

test('Center Lock keeps moving subject pinned to exact frame center', function () {
  var frames = [
    { time: 0, vertices: makeQuad(0.25, 0.5, 50, 50, 0) },  // x=480
    { time: 1, vertices: makeQuad(0.625, 0.5, 50, 50, 10) } // x=1200 (+240px right of center)
  ];

  var res = mathEngine.solveTracking(frames, {
    seqWidth: 1920,
    seqHeight: 1080,
    normalizedInput: true,
    mode: 'centerlock'
  });

  // Frame 0 subject is at x=480 (-480px), so layer shifts +480px -> Position.x = 1440
  assert.ok(Math.abs(res.keyframes[0].position[0] - 1440) < 0.01);
  // Frame 1 subject is at x=1200 (+240px), so layer shifts -240px -> Position.x = 720
  assert.ok(Math.abs(res.keyframes[1].position[0] - 720) < 0.01);
  assert.ok(Math.abs(res.keyframes[1].position[1] - 540) < 0.01);
  assert.ok(Math.abs(res.keyframes[1].rotation - (-10)) < 0.5);
});

test('Stabilize mode removes camera shake relative to reference frame', function () {
  var frames = [
    { time: 0, vertices: makeQuad(0.5, 0.5, 50, 50, 0) },
    { time: 1, vertices: makeQuad(0.625, 0.5, 50, 50, 0) }
  ];

  var res = mathEngine.solveTracking(frames, {
    seqWidth: 1920,
    seqHeight: 1080,
    normalizedInput: true,
    mode: 'stabilize'
  });

  assert.ok(Math.abs(res.keyframes[0].position[0] - 960) < 0.01);
  assert.ok(Math.abs(res.keyframes[1].position[0] - 720) < 0.01);
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
