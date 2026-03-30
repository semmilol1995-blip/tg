const tg = window.Telegram.WebApp;
tg.expand();

async function create(){
  const data = {
    user_id: tg.initDataUnsafe.user.id,
    text: document.getElementById('text').value,
    winners: Number(document.getElementById('winners').value),
    time: new Date(document.getElementById('date').value).getTime(),
    button: document.getElementById('button').value,
    channels: [] // можна додати далі
  };

  await fetch('/create',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify(data)
  });

  tg.showAlert('✅ Розіграш створено');
}