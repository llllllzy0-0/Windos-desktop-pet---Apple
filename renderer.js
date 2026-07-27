const pet = document.querySelector('#pet');
const hint = document.querySelector('#hint');
const context = pet.getContext('2d');
const atlas = new Image();
atlas.src = '../assets/sprites.png';
const actions = {
  idle: { row: 0, count: 6, fps: 3 },
  'walk-right': { row: 1, count: 8, fps: 9 },
  'walk-left': { row: 2, count: 8, fps: 9 },
  wave: { row: 3, count: 4, fps: 5, once: true },
  play: { row: 4, count: 5, fps: 6, once: true },
  tail: { row: 5, count: 8, fps: 5 },
  scratch: { row: 6, count: 6, fps: 6, once: true },
  groom: { row: 7, count: 6, fps: 5, once: true },
  'groom-2': { row: 8, count: 6, fps: 5, once: true },
  sleep: { row: 9, count: 6, fps: 2, once: true },
  jump: { row: 10, count: 6, fps: 7, once: true },
  roll: { row: 11, count: 6, fps: 5, once: true },
  box: { row: 12, count: 8, fps: 5, once: true },
  eat: { row: 13, count: 8, fps: 5, once: true },
  drink: { row: 14, count: 8, fps: 5, once: true }
};

let current = 'idle';
let frame = 0;
let timer;
let dragging = false;
let pointer = { x: 0, y: 0 };
let dragDistance = 0;
let suppressClick = false;
let clickTimer;
let lastInteraction = Date.now();
let hasWeComNotification = false;

function drawFrame(action, index) {
  const config = actions[action];
  context.clearRect(0, 0, 184, 176);
  context.drawImage(atlas, index * 184, config.row * 176, 184, 176, 0, 0, 184, 176);
}

function play(action, forceOnce = false) {
  if (!actions[action]) return;
  clearInterval(timer);
  current = action;
  frame = 0;
  const config = actions[action];
  drawFrame(action, frame);
  timer = setInterval(() => {
    frame += 1;
    if (frame >= config.count) {
      if (config.once || forceOnce) return play('idle');
      frame = 0;
    }
    drawFrame(action, frame);
  }, 1000 / config.fps);
}

pet.addEventListener('pointerdown', event => {
  lastInteraction = Date.now();
  dragging = true;
  dragDistance = 0;
  suppressClick = false;
  pointer = { x: event.screenX, y: event.screenY };
  window.petAPI.beginDrag(event.screenX, event.screenY);
  pet.setPointerCapture(event.pointerId);
});

pet.addEventListener('pointermove', event => {
  if (!dragging) return;
  const dx = event.screenX - pointer.x;
  const dy = event.screenY - pointer.y;
  dragDistance += Math.abs(dx) + Math.abs(dy);
  if (dragDistance > 5) suppressClick = true;
  pointer = { x: event.screenX, y: event.screenY };
  window.petAPI.drag(event.screenX, event.screenY);
});

function finishDrag() {
  if (!dragging) return;
  dragging = false;
  window.petAPI.endDrag();
}
pet.addEventListener('pointerup', finishDrag);
pet.addEventListener('pointercancel', finishDrag);
pet.addEventListener('click', () => {
  if (suppressClick) { suppressClick = false; return; }
  clearTimeout(clickTimer);
  clickTimer = setTimeout(() => play('jump'), 240);
});
pet.addEventListener('dblclick', () => {
  clearTimeout(clickTimer);
  lastInteraction = Date.now();
  if (hasWeComNotification) {
    hasWeComNotification = false;
    hint.textContent = '苹果';
    hint.classList.remove('notification');
    window.petAPI.openWeCom();
    return;
  }
  play(Math.random() > .5 ? 'wave' : 'scratch');
});
pet.addEventListener('contextmenu', event => {
  event.preventDefault();
  lastInteraction = Date.now();
  play('groom');
});
window.petAPI.onAction(action => play(action));
window.petAPI.onWeComNotification(() => {
  hasWeComNotification = true;
  hint.textContent = '企微有新消息';
  hint.classList.add('notification');
  play('jump');
});
setInterval(() => {
  if (dragging || current !== 'idle') return;
  if (Date.now() - lastInteraction > 60000) return play('sleep');
  const choices = ['tail', 'play', 'scratch', 'groom-2', 'roll', 'box', 'eat', 'drink'];
  play(choices[Math.floor(Math.random() * choices.length)], true);
}, 12000);

atlas.addEventListener('load', () => play('idle'));
