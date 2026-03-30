const tg = window.Telegram.WebApp;
tg.expand();

const user = tg.initDataUnsafe?.user?.id || 0;

let selectedChannels = [];

// ---------- LOAD GIVEAWAYS ----------
async function load(){
  const res = await fetch(`/giveaways/${user}`);
  const data = await res.json();

  const list = document.getElementById('list');
  list.innerHTML = '';

  data.forEach(g=>{
    list.innerHTML += `
      <div class="card">

        <div class="card-header">
          <b>#${g.id}</b>
          <span class="status ${g.status}">${g.status}</span>
        </div>

        <div class="card-body">
          ${g.text || 'Без тексту'}
        </div>

        <div class="card-footer">
          🏆 ${g.winners}
        </div>

        <div class="actions">
          <button class="btn reroll" onclick="reroll(${g.id})">🔄 Рерол</button>
          <button class="btn delete" onclick="del(${g.id})">✖ Видалити</button>
        </div>

      </div>
    `;
  });
}

// ---------- LOAD CHANNELS ----------
async function loadChannels(){
  const res = await fetch(`/channels/${user}`);
  const data = await res.json();

  const box = document.getElementById('channels');
  box.innerHTML = '';

  data.forEach(ch=>{
    box.innerHTML += `
      <div class="card">
        <label>
          <input type="checkbox" value="${ch.chat_id}" onchange="toggleChannel(this)">
          ${ch.username}
        </label>
      </div>
    `;
  });
}

// ---------- SELECT CHANNEL ----------
function toggleChannel(el){
  const id = Number(el.value);

  if(el.checked){
    if(!selectedChannels.includes(id)){
      selectedChannels.push(id);
    }
  } else {
    selectedChannels = selectedChannels.filter(c=>c!==id);
  }
}

// ---------- CREATE ----------
async function create(){
  if(!selectedChannels.length){
    return tg.showAlert('❌ Обери канал');
  }

  await fetch('/create',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      user_id:user,
      text:document.getElementById('text').value,
      winners:Number(document.getElementById('winners').value),
      time:new Date(document.getElementById('date').value).getTime(),
      button:document.getElementById('button').value,
      channels:selectedChannels
    })
  });

  tg.showAlert('✅ Розіграш створено');

  load();
}

// ---------- DELETE ----------
async function del(id){
  await fetch('/delete',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({id})
  });

  load();
}

// ---------- REROLL ----------
async function reroll(id){
  await fetch('/reroll',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({id})
  });

  tg.showAlert('🔄 Новий переможець обраний');
}

// ---------- INIT ----------
load();
loadChannels();
