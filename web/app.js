const tg = window.Telegram.WebApp;
tg.expand();

// USER
const user = tg.initDataUnsafe?.user?.id;

// AUTO API
const API = (() => {
  const origin = window.location.origin;

  if (origin.includes('railway.app')) return origin;
  if (origin.includes('localhost') || origin.includes('127.0.0.1')) return origin;

  return 'https://tg-production-4d2b.up.railway.app';
})();

console.log('API:', API);
console.log('USER:', user);

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

// ---------- PREVIEW ----------
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
  if(!user){
    document.getElementById('list').innerHTML = `<div class="card">❌ Нема user_id</div>`;
    return;
  }

  try{
    const res = await fetch(`${API}/giveaways/${user}`);
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

          ${g.image ? `<img src="${API}/file/${g.image}" class="giveaway-thumb">` : ''}

          <div class="card-header">
            <b>#${g.id}</b>
            <span class="status ${g.status}">
              ${g.status === 'active' ? 'Активний' : 'Завершено'}
            </span>
          </div>

          <div class="card-body">
            ${g.text || 'Без тексту'}
          </div>

          <div class="card-footer">
            🏆 ${g.winners}
            <br>
            👥 Учасники: ${g.participants || 0}
          </div>

          <button class="btn-participants" data-id="${g.id}">👥 Список учасників</button>
          <button class="reroll btn-reroll" data-id="${g.id}">🔄 Рерол</button>
          <button class="delete btn-delete" data-id="${g.id}">❌ Видалити</button>

        </div>
      `;
    });

  }catch(e){
    console.log('LOAD ERROR:', e);
    document.getElementById('list').innerHTML = `<div class="card">❌ Помилка</div>`;
  }
}

// ---------- EVENTS ----------
document.addEventListener('click', async (e)=>{

  const btn = e.target.closest('[data-id]');
  if(!btn) return;

  const id = btn.dataset.id;

  if(btn.classList.contains('btn-participants')){
    window.open(`${API}/participants/${id}`, '_blank');
  }

  if(btn.classList.contains('btn-delete')){
    await fetch(`${API}/delete`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({id})
    });

    load();
  }

  if(btn.classList.contains('btn-reroll')){
    await fetch(`${API}/reroll`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({id})
    });

    tg.showAlert('🔄 Новий переможець');
  }

});

// ---------- LOAD CHANNELS ----------
async function loadChannels(){
  if(!user){
    document.getElementById('channels').innerHTML = `<div class="card">❌ Нема user_id</div>`;
    return;
  }

  try{
    const res = await fetch(`${API}/channels/${user}`);
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

  <div class="channel-row">

    <input 
      type="checkbox" 
      value="${ch.chat_id}" 
      onchange="toggleChannel(this)"
    >

    <img 
      src="${ch.photo 
        ? `${API}/file/${ch.photo}`
        : 'https://ui-avatars.com/api/?name=' + encodeURIComponent(ch.title || 'TG')}"
      class="avatar"
    >

    <div class="channel-text">
      <div class="channel-title">${ch.title || ch.username || 'Канал'}</div>
      <div class="channel-username">@${ch.username || ''}</div>
    </div>

    <button class="delete-channel" onclick="deleteChannel(${ch.id})">✕</button>

  </div>

</div>
      `;
    });

  }catch(e){
    console.log('CHANNELS ERROR:', e);
  }
}

// ---------- ADD CHANNEL ----------
async function addChannel(){
  const input = document.getElementById('channelInput').value.trim();

  if(!input){
    return tg.showAlert('❌ Введи канал');
  }

  const res = await fetch(`${API}/channels/add`,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      user_id:user,
      input
    })
  });

  const data = await res.json();

  if(data.ok){
    tg.showAlert('✅ Канал додано');
    document.getElementById('channelInput').value = '';
    loadChannels();
  }else{
    tg.showAlert('❌ Помилка');
  }
}

// ---------- DELETE CHANNEL ----------
async function deleteChannel(id){
  await fetch(`${API}/channels/delete`,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({id})
  });

  loadChannels();
}

// ---------- SELECT ----------
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
  const time = document.getElementById('time').value;
  const button = document.getElementById('button').value;

  if(!text || !winners || !date || !time || !button){
    return tg.showAlert('❌ Заповни всі поля');
  }

  const end = new Date(`${date}T${time}`);

  const formData = new FormData();

  formData.append('user_id', user);
  formData.append('text', text);
  formData.append('winners', winners);
  formData.append('time', end.getTime());
  formData.append('button', button);
  formData.append('channels', JSON.stringify(selectedChannels));

  if(imageFile){
    formData.append('image', imageFile, imageFile.name);
  }

  try{
    const res = await fetch(`${API}/create`,{
      method:'POST',
      body:formData
    });

    const data = await res.json();

    if(data.ok){
      tg.showAlert('✅ Розіграш створено');
      load();
    }else{
      tg.showAlert('❌ Помилка створення');
    }

  }catch{
    tg.showAlert('❌ Помилка');
  }
}

// ---------- INIT ----------
load();
loadChannels();

// ---------- FIX DATE PLACEHOLDER ----------
function initDateFix(){
  ['date','time'].forEach(id=>{
    const input = document.getElementById(id);
    const placeholder = document.querySelector(`[data-for="${id}"]`);

    if(!input || !placeholder) return;

    const toggle = ()=>{
      placeholder.classList.toggle('hide', !!input.value);
    };

    input.addEventListener('change', toggle);
    input.addEventListener('input', toggle);

    toggle();
  });
}

initDateFix();

// ---------- LIVE PREVIEW ----------
document.getElementById('text')?.addEventListener('input', renderPreview);
document.getElementById('button')?.addEventListener('input', renderPreview);
