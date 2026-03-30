function subKeyboard(channels, id) {
  return {
    inline_keyboard: [
      ...channels.map(ch => [{
        text: `📢 ${ch.replace('@','')}`,
        url: `https://t.me/${ch.replace('@','')}`
      }]),
      [{ text: '🔍 Перевірити', callback_data: `check_${id}` }]
    ]
  };
}

module.exports = { subKeyboard };