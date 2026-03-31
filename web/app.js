const tg = window.Telegram.WebApp;
tg.expand();

const user = tg.initDataUnsafe?.user?.id || 0;

let selectedChannels = [];
let imageFile = null;

// ---------- IMAGE ----------
document.getElementById('image').addEventListener('change', e=>{
  const file = e.target.files[0];
  if(!file) return;

  imageFile = file;

  const reader = new FileReader();
  reader.onload = ()=>{
    const img = document.getElementById('preview');
    img.src = reader.result;
    img.style.display = 'block';
  };
  reader.readAsDataURL(file);
});

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
        🏆 ${g.winners}<br>
        ${g.status}<br>

        <button class="reroll" onclick="reroll(${g.id})">🔄 Рерол</button>
        <button class="delete" onclick="del(${g.id})">❌ Видалити</button>
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
  const id = el.value;

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

  const formData = new FormData();

  formData.append('user_id', user);
  formData.append('text', document.getElementById('text').value);
  formData.append('winners', document.getElementById('winners').value);
  formData.append('time', new Date(document.getElementById('date').value).getTime());
  formData.append('button', document.getElementById('button').value);

  formData.append('channels', JSON.stringify(selectedChannels));

  if(imageFile){
    formData.append('image', imageFile);
  }

  await fetch('/create',{
    method:'POST',
    body:formData
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

// ---------- REROLL ----------
async function reroll(id){
  await fetch('/reroll',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({id})
  });

  tg.showAlert('🔄 Новий переможець');
}

// ---------- INIT ----------
load();
loadChannels();
