// ================================================
// SABA AR – MindAR 版（蓋マーカー・ジッター対策済み）
// ================================================

const sceneEl     = document.querySelector('a-scene');
const tapOverlay  = document.getElementById('tapOverlay');
const beforeTrack = document.getElementById('beforeTrack');

// ── ジッター対策：lerp 補間コンポーネント ──────────────
// A-Frame のコンポーネントとして登録し、
// imageTarget の Object3D に毎フレーム lerp をかける
AFRAME.registerComponent('lerp-target', {
  schema: { factor: { type: 'number', default: 0.4 } },
  init: function () {
    this.smoothPos  = new THREE.Vector3();
    this.smoothQuat = new THREE.Quaternion();
    this.initialized = false;
  },
  tick: function () {
    const obj = this.el.object3D;
    if (!obj.visible) {
      this.initialized = false;
      return;
    }
    if (!this.initialized) {
      this.smoothPos.copy(obj.position);
      this.smoothQuat.copy(obj.quaternion);
      this.initialized = true;
      return;
    }
    this.smoothPos.lerp(obj.position, this.data.factor);
    this.smoothQuat.slerp(obj.quaternion, this.data.factor);
    obj.position.copy(this.smoothPos);
    obj.quaternion.copy(this.smoothQuat);
  }
});

// ── ターゲット要素 ──────────────────────────────────────
const target = {
  tapBtn:    document.getElementById('tapBtn0'),
  restartBtn:document.getElementById('restartBtn0'),
  kan:       document.getElementById('kan0'),
  kanMask:   document.getElementById('kanMask0'),
  sabaBlock: document.getElementById('sabaBlock0'),
};

// lerp コンポーネントを imageTarget に付与
const imageTargetEl = document.getElementById('imageTarget0');
imageTargetEl.setAttribute('lerp-target', 'factor: 0.4');

// ── さばモデル：ランダム選択 ────────────────────────────
let sabaNum = Math.floor(Math.random() * 2);
target.sabaBlock.children[sabaNum].setAttribute('visible', true);

// ── タップ状態 ──────────────────────────────────────────
// 0: タップ待ち  1: アニメ再生中  2: アニメ完了
let tapState  = 0;
let isTracking = false;

// ── マーカー認識イベント ────────────────────────────────
imageTargetEl.addEventListener('targetFound', () => {
  isTracking = true;
  beforeTrack.setAttribute('visible', false);
  tapOverlay.style.display = 'block';
});

imageTargetEl.addEventListener('targetLost', () => {
  isTracking = false;
  beforeTrack.setAttribute('visible', true);
  tapOverlay.style.display = 'none';
});

// ── タップ制御 ──────────────────────────────────────────
tapOverlay.addEventListener('touchend', (e) => {
  e.preventDefault();
  handleTap();
});
tapOverlay.addEventListener('click', handleTap);

function handleTap() {
  if (!isTracking) return;

  if (tapState === 0) {
    // 開缶アニメーション開始
    tapState = 1;
    target.tapBtn.setAttribute('scale', '0 0 0');
    target.sabaBlock.children[sabaNum].setAttribute('animation-mixer', {
      clip: 'sabaAnime',
      loop: 'once',
      clampWhenFinished: true,
      timeScale: 0.8
    });
    target.kan.emit('in', null, false);
    target.kanMask.children[0].emit('in', null, false);
    setTimeout(() => {
      target.kanMask.children[0].emit('out', null, false);
    }, 1200);

  } else if (tapState === 2) {
    // リスタート
    tapState = 0;
    target.restartBtn.setAttribute('material', { opacity: '0' });
    target.restartBtn.setAttribute('scale', '0 0 0');
    target.tapBtn.setAttribute('scale', '0.6 0.6 0.6');
    target.kan.setAttribute('material', { opacity: '0' });
    target.sabaBlock.children[sabaNum].removeAttribute('animation-mixer');

    // 次のさばモデルに切り替え
    target.sabaBlock.children[sabaNum].setAttribute('visible', false);
    sabaNum = sabaNum === 0 ? 1 : 0;
    target.sabaBlock.children[sabaNum].setAttribute('visible', true);
  }
}

// ── アニメーション完了 → リスタートボタン表示 ───────────
function onAnimationFinished() {
  tapState = 2;
  target.restartBtn.setAttribute('scale', '0.6 0.6 0.6');
  setTimeout(() => {
    target.restartBtn.emit('in', null, false);
  }, 500);
}

target.sabaBlock.children[0].addEventListener('animation-finished', onAnimationFinished);
target.sabaBlock.children[1].addEventListener('animation-finished', onAnimationFinished);

// ================================================
// 撮影機能（写真・動画）
// ================================================
let capMode = 'photo';
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;

const capType        = document.getElementById('capType');
const capturePreview = document.getElementById('capturePreview');
const captureImg     = document.getElementById('captureImg');
const captureVideo   = document.getElementById('captureVideo');
const captureSave    = document.getElementById('captureSave');
const captureClose   = document.getElementById('captureClose');

// シャッターボタン UI
capType.style.backgroundPosition = '0vmin 0vmin';
capType.innerHTML = `
  <button id="shutterBtn" style="
    position:fixed; bottom:3vmin; right:3vmin;
    width:14vmin; height:14vmin;
    border-radius:50%; border:3px solid #FFF;
    background:rgba(255,255,255,0.3);
    z-index:10; cursor:pointer;
  "></button>
`;

let cap = 0;
capType.addEventListener('click', (e) => {
  if (e.target.id === 'shutterBtn') return;
  if (cap === 0) {
    capType.style.backgroundPosition = '0vmin -11.5vmin';
    capMode = 'video';
    cap = 1;
  } else {
    capType.style.backgroundPosition = '0vmin 0vmin';
    capMode = 'photo';
    cap = 0;
  }
});

document.addEventListener('click', (e) => {
  if (e.target.id !== 'shutterBtn') return;
  if (capMode === 'photo') takePhoto();
  else if (!isRecording) startRecording();
  else stopRecording();
});

function takePhoto() {
  const canvas = sceneEl.canvas;
  sceneEl.renderer.preserveDrawingBuffer = true;
  requestAnimationFrame(() => {
    const dataURL = canvas.toDataURL('image/png');
    captureImg.src = dataURL;
    captureImg.style.display = 'block';
    captureVideo.style.display = 'none';
    capturePreview.style.display = 'flex';
    captureSave._saveData = dataURL;
    captureSave._saveType = 'photo';
    sceneEl.renderer.preserveDrawingBuffer = false;
  });
}

function startRecording() {
  const stream = sceneEl.canvas.captureStream(30);
  recordedChunks = [];
  mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) recordedChunks.push(e.data);
  };
  mediaRecorder.onstop = () => {
    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    const url  = URL.createObjectURL(blob);
    captureVideo.src = url;
    captureVideo.style.display = 'block';
    captureImg.style.display   = 'none';
    capturePreview.style.display = 'flex';
    captureSave._saveData = url;
    captureSave._saveType = 'video';
  };
  mediaRecorder.start();
  isRecording = true;
  document.getElementById('shutterBtn').style.background = 'rgba(255,0,0,0.6)';
}

function stopRecording() {
  if (mediaRecorder && isRecording) {
    mediaRecorder.stop();
    isRecording = false;
    document.getElementById('shutterBtn').style.background = 'rgba(255,255,255,0.3)';
  }
}

captureSave.addEventListener('click', () => {
  const a = document.createElement('a');
  a.href     = captureSave._saveData;
  a.download = captureSave._saveType === 'photo'
    ? 'SABA_AR_umios.png'
    : 'SABA_AR_umios.webm';
  a.click();
  capturePreview.style.display = 'none';
});

captureClose.addEventListener('click', () => {
  capturePreview.style.display = 'none';
  if (captureVideo.src) {
    URL.revokeObjectURL(captureVideo.src);
    captureVideo.src = '';
  }
});

// キャプチャプレビューのスタイル
const previewStyle = document.createElement('style');
previewStyle.textContent = `
  #capturePreview {
    position: fixed;
    top: 0; left: 0;
    width: 100vw; height: 100vh;
    background: rgba(0,0,0,0.85);
    z-index: 100;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  #captureActions {
    display: flex;
    gap: 20px;
    margin-top: 20px;
  }
  #captureActions button {
    padding: 12px 32px;
    font-size: 1.2rem;
    border-radius: 12px;
    border: none;
    cursor: pointer;
  }
  #captureSave  { background: #0042BC; color: #FFF; }
  #captureClose { background: #555;    color: #FFF; }
`;
document.head.appendChild(previewStyle);
