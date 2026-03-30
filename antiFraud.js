const last = new Map();

function allow(id){
  const now = Date.now();

  if(last.has(id)){
    if(now - last.get(id) < 2000) return false;
  }

  last.set(id, now);
  return true;
}

module.exports = { allow };
