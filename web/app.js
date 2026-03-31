const tg = window.Telegram.WebApp;
tg.expand();

const user = tg.initDataUnsafe?.user?.id || 0;

let selectedChannels = [];
let imageFile = null;

// ---------- IMAGE ----------
const imageInput = document.getElementById('image');

if(imageInput){
  imageInput.addEventListener('change', e=>{
    const file = e.target.files[0];
    if(!file) return;

    imageFile = file;

    const reader = new FileReader();
    reader.onload = ()=>{
      const img = document.getElementById('preview');
      img.src = reader.result;
      img.style.display = 'block';

      renderPreview();
    };
    reader.readAsDataURL(file);
  });
}

// ---------- TELEGRAM PREVIEW ----------
function renderPreview(){
  const text = document.getElementById('text')?.value || '';
  const button = document.getElementById('button')?.value || 'Взяти участь';

  const preview = document.getElementById('previewPost');
  if(!preview) return;

  preview.innerHTML = `
    <div class="tg-post">
      ${imageFile ? `<img src="${document.getElementById('preview').src}">` : ''}

      <div class="tg-text">${text || 'Тут буде текст розіграшу'}</div>

      <div class="tg-btn">${button}</div>
    </div>
  `;
}

// ---------- LOAD GIVEAWAYS ----------
async function load(){
  const res = await fetch(`/giveaways/${user}`);
  const data = await res.json();

  const list = document.getElementById('list');
  list.innerHTML = '';

  if(!data.length){
    list.innerHTML = `<div class="card">Нема розіграшів</div>`;
    return;
  }

  data.forEach(g=>{
    list.innerHTML += `
      <div class="card">

        ${g.image ? `<img src="/uploads/${g.image}" class="giveaway-thumb">` : ''}

        <div class="card-header">
          <b>#${g.id}</b>
          <span class="status ${g.status}">
            ${g.status === 'active' ? '🟢 Активний' : '🔴 Завершено'}
          </span>
        </div>

        <div class="card-body">
          ${g.text || 'Без тексту'}
        </div>

        <div class="card-footer">
          🏆 ${g.winners}
        </div>

        <button class="reroll" onclick="reroll(${g.id})">🔄 Рерол</button>
        <button class="delete" onclick="del(${g.id})">❌ Видалити</button>

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

  if(!data.length){
    box.innerHTML = `<div class="card">Нема каналів</div>`;
    return;
  }

  data.forEach(ch=>{
    box.innerHTML += `
      <div class="channel-card">

        <label>
          <input type="checkbox" value="${ch.chat_id}" onchange="toggleChannel(this)">

          <div class="channel-info">

            <img 
              src="${ch.photo 
                ? `https://api.telegram.org/file/bot${tg.initDataUnsafe?.bot_token}/${ch.photo}`
                : 'https://via.placeholder.com/40'}"
              class="avatar"
            >

            <div>
              <div class="channel-title">${ch.title || ch.username || 'Канал'}</div>
              <div class="channel-username">@${ch.username || ''}</div>
            </div>

          </div>

        </label>

      </div>
    `;
  });
}

// ---------- SELECT CHANNEL ----------
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

  const text = document.getElementById('text').value;
  const winners = document.getElementById('winners').value;
  const date = document.getElementById('date').value;
  const button = document.getElementById('button').value;

  if(!text || !winners || !date || !button){
    return tg.showAlert('❌ Заповни всі поля');
  }

  const formData = new FormData();

  formData.append('user_id', user);
  formData.append('text', text);
  formData.append('winners', winners);
  formData.append('time', new Date(date).getTime());
  formData.append('button', button);

  formData.append('channels', JSON.stringify(selectedChannels));

  if(imageFile){
    formData.append('image', imageFile);
  }

  try{
    await fetch('/create',{
      method:'POST',
      body:formData
    });

    tg.showAlert('✅ Розіграш створено');

    // reset
    imageFile = null;
    document.getElementById('preview').style.display = 'none';

    load();

  }catch(e){
    tg.showAlert('❌ Помилка створення');
  }
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

// ---------- LIVE PREVIEW INPUTS ----------
document.getElementById('text')?.addEventListener('input', renderPreview);
document.getElementById('button')?.addEventListener('input', renderPreview);
