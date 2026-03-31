const tg = window.Telegram.WebApp;
const user = tg.initDataUnsafe?.user?.id;

const API = window.location.origin;

async function load(){
  const res = await fetch(`${API}/giveaways/${user}`);
  const data = await res.json();

  const list = document.getElementById('list');
  list.innerHTML = '';

  data.forEach(g=>{

    let winnersHTML = '';

    if(g.winners_data){
      const winners = JSON.parse(g.winners_data);

      winnersHTML = winners.map(w=>`
        <div class="winner">
          ${w.place}. @${w.username}
          <button onclick="reroll(${g.id},${w.place})">🔄</button>
        </div>
      `).join('');
    }

    list.innerHTML += `
      <div class="card">
        <b>#${g.id}</b>
        <div>${g.text}</div>
        ${winnersHTML}
      </div>
    `;
  });
}

async function reroll(id, place){
  await fetch(`${API}/reroll`,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({id, place})
  });

  tg.showAlert('🔄 Рерол');
  load();
}

load();

function goBack(){
  window.location.href = 'index.html';
}