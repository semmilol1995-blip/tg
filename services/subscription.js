async function checkAll(bot, userId, channels){
  for(let ch of channels){
    try{
      const member = await bot.telegram.getChatMember(ch, userId);

      if(!['member','administrator','creator'].includes(member.status)){
        return false;
      }
    }catch{
      return false;
    }
  }

  return true;
}

module.exports = { checkAll };
