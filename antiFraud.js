const lastJoin = new Map();

function allow(userId){
  const now = Date.now();

  if(lastJoin.has(userId)){
    if(now - lastJoin.get(userId) < 3000){
      return false;
    }
  }

  lastJoin.set(userId, now);
  return true;
}

module.exports = { allow };