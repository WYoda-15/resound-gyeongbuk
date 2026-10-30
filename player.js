/*
  RE:SOUND GYEONGBUK 자동 멈춤 플레이어
  사용법: player.html?v=유튜브영상ID  또는  v/유튜브영상ID.html  (선택: ?t=시작초)
  한 페이지에 이 플레이어를 여러 개 넣으면, 하나를 재생할 때 나머지가 자동으로 멈춥니다.
  신호는 두 길로 보냅니다.
    1) BroadcastChannel: 같은 주소에서 온 플레이어끼리
    2) postMessage: 페이지 안의 모든 프레임을 위에서부터 훑어 전달 (노션처럼 프레임이 여러 겹이어도 도달)
*/
(function () {
  'use strict';

  var CHANNEL = 'resound-gb-player';
  var TYPE_PLAYING = 'resound-gb:playing';
  var TYPE_STATE = 'resound-gb:state';

  var query = new URLSearchParams(location.search);
  var videoId = (query.get('v') || document.documentElement.getAttribute('data-v') || '').trim();
  var startAt = parseInt(query.get('t') || '0', 10) || 0;
  var frame = document.querySelector('.frame');

  function showFallback(message, withLink) {
    var box = document.createElement('div');
    box.className = 'fallback';
    var p = document.createElement('div');
    p.textContent = message;
    box.appendChild(p);
    if (withLink && videoId) {
      var a = document.createElement('a');
      a.href = 'https://youtu.be/' + videoId;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = 'YouTube에서 보기';
      box.appendChild(a);
    }
    frame.appendChild(box);
  }

  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
    showFallback('영상 주소(v=)가 비어 있거나 올바르지 않습니다.', false);
    return;
  }

  var me = videoId + ':' + Math.random().toString(36).slice(2, 10);
  var player = null;
  var seen = Object.create(null);

  function isPlayingNow() {
    if (!player || typeof player.getPlayerState !== 'function') return false;
    var s = player.getPlayerState();
    return s === 1 || s === 3; // 재생 중 또는 불러오는 중
  }

  function handleOtherPlaying(data) {
    if (!data || data.type !== TYPE_PLAYING || data.from === me) return;
    if (data.nonce) {
      if (seen[data.nonce]) return;
      seen[data.nonce] = 1;
    }
    if (isPlayingNow()) {
      try { player.pauseVideo(); } catch (e) { /* 무시 */ }
    }
  }

  // 길 1: BroadcastChannel
  var channel = null;
  if (typeof BroadcastChannel === 'function') {
    try {
      channel = new BroadcastChannel(CHANNEL);
      channel.onmessage = function (e) { handleOtherPlaying(e.data); };
    } catch (e) { channel = null; }
  }

  // 길 2: postMessage 수신
  window.addEventListener('message', function (e) {
    var d = e.data;
    if (d && typeof d === 'object' && d.type === TYPE_PLAYING) handleOtherPlaying(d);
  });

  // 페이지의 모든 프레임에 전달 (다른 도메인 프레임이어도 length / [i] / postMessage는 허용됨)
  function postToAllFrames(win, data, depth) {
    if (depth > 8) return;
    if (win !== window) {
      try { win.postMessage(data, '*'); } catch (e) { /* 무시 */ }
    }
    var count = 0;
    try { count = win.length; } catch (e) { count = 0; }
    for (var i = 0; i < count; i++) {
      var child = null;
      try { child = win[i]; } catch (e) { child = null; }
      if (child) postToAllFrames(child, data, depth + 1);
    }
  }

  function announcePlaying() {
    var data = {
      type: TYPE_PLAYING,
      from: me,
      nonce: me + ':' + Date.now() + ':' + Math.random().toString(36).slice(2, 8)
    };
    seen[data.nonce] = 1;
    if (channel) {
      try { channel.postMessage(data); } catch (e) { /* 무시 */ }
    }
    var root = window;
    try { root = window.top || window; } catch (e) { root = window; }
    postToAllFrames(root, data, 0);
  }

  // 시험 페이지가 상태를 표시할 수 있도록 바로 위 프레임에 알림 (노션에서는 아무 영향 없음)
  function reportState(state) {
    if (window.parent === window) return;
    try { window.parent.postMessage({ type: TYPE_STATE, v: videoId, state: state }, '*'); } catch (e) { /* 무시 */ }
  }

  var apiReady = false;
  window.onYouTubeIframeAPIReady = function () {
    apiReady = true;
    var stale = frame.querySelector('.fallback');
    if (stale) stale.remove();
    player = new YT.Player('player', {
      videoId: videoId,
      playerVars: { playsinline: 1, start: startAt },
      events: {
        onReady: function () { reportState(-1); },
        onStateChange: function (e) {
          reportState(e.data);
          if (e.data === 1) announcePlaying();
        }
      }
    });
  };

  var script = document.createElement('script');
  script.src = 'https://www.youtube.com/iframe_api';
  script.async = true;
  script.onerror = function () { showFallback('플레이어를 불러오지 못했습니다.', true); };
  document.head.appendChild(script);

  setTimeout(function () {
    if (!apiReady) showFallback('플레이어를 불러오는 데 시간이 걸리고 있습니다.', true);
  }, 12000);
})();
