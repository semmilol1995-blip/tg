function genCaptcha(){
  const nums = ['1','2','3','4','5','6','7','8','9'];

  const target = nums[Math.floor(Math.random()*nums.length)];

  return {
    target,
    buttons: nums.sort(()=>Math.random()-0.5).slice(0,6)
  };
}

module.exports = { genCaptcha };
