async function checkAll(bot, userId, channels) {
  for (let ch of channels) {
    try {
      const m = await bot.telegram.getChatMember(ch, userId);

      if (!['member','administrator','creator'].includes(m.status)) {
        return false;
      }
    } catch {
      return false;
    }
  }
  return true;
}

module.exports = { checkAll };