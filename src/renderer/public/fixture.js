let clockFrozen = false;
let sceneFrozen = false;
let frame = 0;
const main = document.querySelector('main');
const clock = document.querySelector('#clock');
const marker = document.querySelector('#marker');
const sequence = document.querySelector('#sequence');
function tick() {
  if (!clockFrozen) clock.textContent = new Date().toLocaleTimeString('ja-JP', { hour12: false });
  if (!sceneFrozen) {
    frame++;
    marker.style.left = `${(Math.sin(frame / 8) + 1) * 45}%`;
    sequence.textContent = `FRAME ${String(frame).padStart(6, '0')}`;
  }
}
document.querySelector('#freeze-clock').onclick = () => {
  clockFrozen = !clockFrozen;
};
document.querySelector('#freeze-scene').onclick = () => {
  sceneFrozen = !sceneFrozen;
};
document.querySelector('#black').onclick = () => main.classList.add('black');
document.querySelector('#restore').onclick = () => {
  clockFrozen = false;
  sceneFrozen = false;
  main.classList.remove('black');
};
tick();
setInterval(tick, 250);
