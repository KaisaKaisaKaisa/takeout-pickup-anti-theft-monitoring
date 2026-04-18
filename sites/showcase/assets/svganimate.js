const promptInput = document.getElementById("prompt-input");
const charCount = document.getElementById("char-count");
const togglePro = document.getElementById("toggle-pro");
const exampleBtn = document.querySelector(".prompt-actions .ghost");

function updateCount() {
  const max = 200;
  const len = promptInput.value.length;
  charCount.textContent = `${len} / ${max}`;
}

promptInput.addEventListener("input", updateCount);
updateCount();

togglePro.addEventListener("click", () => {
  togglePro.classList.toggle("active");
  const active = togglePro.classList.contains("active");
  togglePro.setAttribute("aria-pressed", active ? "true" : "false");
});

exampleBtn.addEventListener("click", () => {
  promptInput.value = "draw a crystal, then pulse the core and sweep a wave underneath";
  updateCount();
});
