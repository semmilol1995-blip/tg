const tg = window.Telegram.WebApp;
const user = tg.initDataUnsafe?.user?.id;

const API = window.location.origin;

async function load(){

  const list = document.getElementById('list');
  list.innerHTML = `<div class="card">Завантаження...</div>`;

  const res = await fetch(`${API}/giveaways/${user}`);
  const data = await res.json();

  list.innerHTML = '';

  if(!data.length){
    list.innerHTML = `<div class="card">Нема розіграшів</div>`;
    return;
  }

  data.forEach(g=>{

    let winnersHTML = '';

    if(g.status === 'finished'){
      let winners = [];

      try{
        winners = JSON.parse(g.winners_data || '[]');
      }catch{}

      if(winners.length){
        winnersHTML = `
          <div style="margin-top:10px;">
            <b>🏆 Переможці:</b>
            ${winners.map(w=>`
              <div class="winner">
                ${w.place}. @${w.username}
                <button type="button" onclick="reroll(${g.id},${w.place})">🔄</button>
              </div>
            `).join('')}
          </div>
        `;
      }
    }

    list.innerHTML += `
      <div class="card">

${g.image ? `
  <div class="thumb-wrap">
    <img src="${API}/file/${g.image}" class="giveaway-thumb">
    <div class="giveaway-id">#${g.id}</div>
  </div>
` : ''}

<div class="meta">
  <span class="winners">🏆 ${g.winners}</span>
  <span class="participants">👤Учасників: ${g.participants || 0}</span>
</div>

          <span class="status ${g.status}">
            ${g.status === 'active' ? '🟢 Активний' : '🔴 Завершено'}
          </span>
        </div>

        <div class="card-body">
          ${g.text || 'Без тексту'}
        </div>

        ${winnersHTML}

        <button type="button" onclick="openParticipants(${g.id})">
          👥 Список учасників
        </button>

        ${g.status === 'finished' ? '' : `
          <button type="button" class="reroll" onclick="reroll(${g.id},1)">
            🔄 Рерол (рандом)
          </button>
        `}

        <button type="button" class="delete" onclick="deleteGiveaway(${g.id})">
          ❌ Видалити
        </button>

      </div>
    `;
  });
}

// ---------- ACTIONS ----------

function openParticipants(id){
  window.open(`${API}/participants/${id}`, '_blank');
}

async function deleteGiveaway(id){
  try{
    await fetch(`${API}/delete`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({id})
    });

    tg.showAlert('❌ Розіграш видалено');
    load();

  }catch{
    tg.showAlert('❌ Помилка видалення');
  }
}

async function reroll(id, place){
  try{
    await fetch(`${API}/reroll`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({id, place})
    });

    tg.showAlert(`🔄 Рерол місця ${place}`);
    load();

  }catch{
    tg.showAlert('❌ Помилка реролу');
  }
}

// ---------- BACK ----------
function goBack(){
  window.location.href = 'index.html';
}

load();
