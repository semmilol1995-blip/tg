function genCaptcha() {
  const arr = ['🐶','🐱','🐸','🦊','🐼','🐵'];
  const target = arr[Math.floor(Math.random()*arr.length)];
  const shuffled = [...arr].sort(()=>Math.random()-0.5);

  return { target, buttons: shuffled };
}

module.exports = { genCaptcha };