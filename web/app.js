const tg = window.Telegram.WebApp;
tg.expand();

const user = tg.initDataUnsafe?.user?.id || 0;

let selectedChannels = [];

// ---------- LOAD ----------
async function load(){
  const res = await fetch(`/giveaways/${user}`);
  const data = await res.json();

  const list = document.getElementById('list');
  list.innerHTML = '';

  data.forEach(g=>{
    list.innerHTML += `
      <div class="card">
        <b>#${g.id}</b><br>
        ${g.text}<br>
        <button onclick="del(${g.id})">❌</button>
      </div>
    `;
  });
}

// ---------- CHANNELS ----------
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

function toggleChannel(el){
  const id = Number(el.value);

  if(el.checked){
    selectedChannels.push(id);
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

  tg.showAlert('✅ Створено');
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

// ---------- INIT ----------
load();
loadChannels();
