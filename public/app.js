const CONFIG = {
  API_URL: '/api/places',
  DEFAULT_CENTER: [55.7558, 37.6173],
  DEFAULT_ZOOM: 12,
  DEBOUNCE_DELAY: 300
};

const CATEGORY_ICONS = {
  'sober-bar': 'fa-glass-water', 'cafe': 'fa-mug-hot', 'coffee': 'fa-coffee',
  'restaurant': 'fa-utensils', 'loft': 'fa-building', 'activity': 'fa-puzzle-piece', 'all': 'fa-layer-group'
};
const CATEGORY_LABELS = {
  'sober-bar': 'Бар', 'cafe': 'Кафе', 'coffee': 'Кофейня',
  'restaurant': 'Ресторан', 'loft': 'Лофт', 'activity': 'Развлечения'
};

/* ---------- Утилиты ---------- */
const debounce = (fn, delay) => {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
};
const formatDate = (d) => d ? new Date(d).toLocaleDateString('ru-RU') : '';

function getGeoCache(q) {
  try { return JSON.parse(localStorage.getItem('geo_' + q)); } catch { return null; }
}
function setGeoCache(q, val) {
  try {
    const prefix = 'geo_';
    const keys = Object.keys(localStorage).filter(k => k.startsWith(prefix));
    if (keys.length > 60) keys.slice(0, 10).forEach(k => localStorage.removeItem(k));
    localStorage.setItem(prefix + q, JSON.stringify(val));
  } catch {}
}

/* ---------- Геокодинг: Photon → Nominatim ---------- */
async function geocodeAddress(query) {
  const q = query.toLowerCase().trim();
  const cached = getGeoCache(q);
  if (cached) return cached;

  try {
    const res = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5&lang=ru`);
    const data = await res.json();
    if (data.features?.length) {
      const f = data.features[0];
      const [lng, lat] = f.geometry.coordinates;
      const p = f.properties;
      const name = [p.name, p.street, p.district, p.city, p.state, p.country].filter(Boolean).join(', ');
      const result = { lat, lng, displayName: name || query };
      setGeoCache(q, result);
      return result;
    }
  } catch (e) { console.log('Photon miss', e.message); }

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&accept-language=ru`,
      { headers: { 'User-Agent': 'SoberMap/1.0 (contact@sobermap.local)' } }
    );
    const data = await res.json();
    if (data?.length) {
      const match = data.find(i => i.category === 'amenity' && ['cafe','restaurant','fast_food','coffee_shop'].includes(i.type));
      const t = match || data[0];
      const result = { lat: parseFloat(t.lat), lng: parseFloat(t.lon), displayName: t.display_name };
      setGeoCache(q, result);
      return result;
    }
  } catch (e) { console.error('Nominatim miss', e); }

  return null;
}

/* ---------- Toast ---------- */
class Toast {
  static container = document.getElementById('toastContainer');
  static show(msg, type = 'success') {
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `<i class="fas fa-${type==='success'?'check-circle':'exclamation-circle'}"></i><span>${msg}</span>`;
    this.container.appendChild(t);
    setTimeout(() => { t.style.opacity='0'; t.style.transform='translateX(100%)'; setTimeout(()=>t.remove(),300); }, 4000);
  }
}

/* ---------- Приложение ---------- */
class SoberMapApp {
  constructor() { this.map=null; this.cluster=null; this.allPlaces=[]; this.currentMarkers=[]; this.currentFilter='all'; this.searchQuery=''; this.userMarker=null; this.init(); }
  
  init() { this.initMap(); this.initEvents(); this.loadPlaces(); }
  
  initMap() {
    this.map = L.map('map').setView(CONFIG.DEFAULT_CENTER, CONFIG.DEFAULT_ZOOM);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 19, attribution: '© OpenStreetMap, © CARTO'
    }).addTo(this.map);
    
    this.cluster = L.markerClusterGroup({
      spiderfyOnMaxZoom: true,
      showCoverageOnHover: false,
      zoomToBoundsOnClick: true,
      maxClusterRadius: 60,
      iconCreateFunction: (cluster) => {
        return L.divIcon({
          html: `<div>${cluster.getChildCount()}</div>`,
          className: 'marker-cluster marker-cluster-medium',
          iconSize: L.point(36, 36)
        });
      }
    });
    this.map.addLayer(this.cluster);
  }
  
  initEvents() {
    const modal = document.getElementById('addModal');
    const open = () => { modal.style.display='flex'; document.body.style.overflow='hidden'; };
    const close = () => { modal.style.display='none'; document.body.style.overflow=''; document.getElementById('addPlaceForm').reset(); };
    
    document.getElementById('openModalBtn').onclick = open;
    document.getElementById('closeModalBtn').onclick = close;
    document.getElementById('cancelBtn').onclick = close;
    document.querySelector('.modal-overlay').onclick = close;
    
    document.getElementById('addPlaceForm').addEventListener('submit', (e) => this.handleSubmit(e));
    
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        this.currentFilter = e.currentTarget.dataset.category;
        this.render();
      });
    });
    
    const searchInput = document.getElementById('searchInput');
    const clearBtn = document.getElementById('clearSearch');
    searchInput.addEventListener('input', debounce((e) => {
      this.searchQuery = e.target.value.toLowerCase().trim();
      clearBtn.classList.toggle('hidden', !this.searchQuery);
      this.render();
    }, CONFIG.DEBOUNCE_DELAY));
    clearBtn.addEventListener('click', () => { searchInput.value=''; this.searchQuery=''; clearBtn.classList.add('hidden'); this.render(); });
    
    document.getElementById('locateBtn').addEventListener('click', () => this.locateUser());
    
    const sidebar = document.getElementById('sidebar');
    document.getElementById('mobileListBtn').onclick = () => sidebar.classList.add('open');
    document.getElementById('toggleSidebar').onclick = () => sidebar.classList.remove('open');
    sidebar.addEventListener('click', (e) => { if(e.target.closest('.place-card') && window.innerWidth<=768) sidebar.classList.remove('open'); });
  }
  
  async loadPlaces() {
    const list = document.getElementById('placesList');
    list.innerHTML = `<div class="loading-state"><i class="fas fa-circle-notch fa-spin"></i><p>Загрузка...</p></div>`;
    try {
      const res = await fetch(CONFIG.API_URL);
      if(!res.ok) throw new Error('network');
      this.allPlaces = await res.json();
      this.render();
    } catch(err) {
      list.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>Не удалось загрузить данные</p><button onclick="app.loadPlaces()" class="btn-primary" style="margin-top:10px">Повторить</button></div>`;
      Toast.show('Ошибка загрузки данных', 'error');
    }
  }
  
  getFiltered() {
    let f = this.allPlaces;
    if(this.currentFilter!=='all') f = f.filter(p => p.category===this.currentFilter);
    if(this.searchQuery) f = f.filter(p => 
      p.title.toLowerCase().includes(this.searchQuery) ||
      p.address.toLowerCase().includes(this.searchQuery) ||
      (p.description||'').toLowerCase().includes(this.searchQuery)
    );
    return f;
  }
  
  createIcon(cat) {
    const cls = CATEGORY_ICONS[cat] || CATEGORY_ICONS.cafe;
    return L.divIcon({ className:'custom-marker-container', html:`<div class="custom-marker"><i class="fas ${cls}"></i></div>`, iconSize:[36,36], iconAnchor:[18,36], popupAnchor:[0,-36] });
  }
  
  buildContactsHtml(place, compact=false) {
    let html = '';
    if (place.phone) {
      html += `<a href="tel:${place.phone.replace(/\s/g,'')}"><i class="fas fa-phone"></i> ${compact ? '' : place.phone}</a>`;
    }
    if (place.website) {
      const url = place.website.startsWith('http') ? place.website : 'https://' + place.website;
      const short = place.website.replace(/^https?:\/\//, '').replace(/^www\./, '');
      html += `<a href="${url}" target="_blank" rel="noopener"><i class="fas fa-globe"></i> ${compact ? '' : short}</a>`;
    }
    return html;
  }
  
  async sharePlace(place) {
    const shareData = {
      title: place.title,
      text: `${place.title} — ${place.address}${place.description ? '. ' + place.description : ''}`,
      url: window.location.href
    };
    
    if (navigator.share) {
      try { await navigator.share(shareData); return; } catch (e) { if(e.name==='AbortError') return; }
    }
    
    // Fallback: копируем в буфер
    const text = `${shareData.title}\n${shareData.text}\n${shareData.url}`;
    try {
      await navigator.clipboard.writeText(text);
      Toast.show('Ссылка скопирована в буфер обмена!');
    } catch {
      // Ещё один fallback
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      document.execCommand('copy'); document.body.removeChild(ta);
      Toast.show('Ссылка скопирована в буфер обмена!');
    }
  }
  
  render() {
    const filtered = this.getFiltered();
    const cnt = document.querySelector('#placeCount');
    if(cnt) cnt.textContent = this.allPlaces.length;
    
    this.cluster.clearLayers();
    this.currentMarkers = [];
    
    const list = document.getElementById('placesList');
    if(!filtered.length){ list.innerHTML=`<div class="empty-state"><i class="fas fa-search"></i><p>Ничего не найдено</p><p style="font-size:0.85rem">Попробуйте изменить фильтр или поиск</p></div>`; return; }
    
    list.innerHTML = '';
    filtered.forEach(place => {
      const marker = L.marker([place.lat, place.lng], {icon:this.createIcon(place.category)});
      
      const contacts = this.buildContactsHtml(place);
      const popup = `
        <div class="popup-content">
          <span class="category-badge ${place.category}">${CATEGORY_LABELS[place.category]||place.category}</span>
          <h3>${place.title}</h3>
          <div class="address"><i class="fas fa-map-marker-alt"></i> ${place.address}</div>
          ${place.description?`<div class="desc">${place.description}</div>`:''}
          ${contacts?`<div class="popup-contacts">${contacts}</div>`:''}
          <div class="popup-actions">
            <button onclick="app.focusPlace(${place.id})"><i class="fas fa-crosshairs"></i> На карте</button>
            <button class="share-btn" onclick="app.sharePlaceById(${place.id})"><i class="fas fa-share-alt"></i> Поделиться</button>
            
          </div>
        </div>`;
      marker.bindPopup(popup);
      this.cluster.addLayer(marker);
      this.currentMarkers.push(marker);
      
      const card = document.createElement('div');
      card.className='place-card'; card.dataset.id=place.id;
      const cardContacts = this.buildContactsHtml(place, true);
      card.innerHTML = `
        <div class="place-card-header"><h4>${place.title}</h4><span class="category-badge ${place.category}">${CATEGORY_LABELS[place.category]||place.category}</span></div>
        <div class="address"><i class="fas fa-map-marker-alt"></i> ${place.address}</div>
        ${place.description?`<div class="desc">${place.description}</div>`:''}
        ${cardContacts?`<div class="place-contacts">${cardContacts}</div>`:''}
        <div class="place-card-footer">
          <span class="place-meta"><i class="far fa-clock"></i> ${formatDate(place.createdAt)}</span>
          <button class="btn-icon" style="width:32px;height:32px" onclick="event.stopPropagation();app.sharePlaceById('${place.id}')" title="Поделиться"><i class="fas fa-share-alt"></i></button>
        </div>`;
      
      card.addEventListener('click', () => {
        document.querySelectorAll('.place-card').forEach(c=>c.classList.remove('active'));
        card.classList.add('active');
        this.map.setView([place.lat, place.lng], 16);
        marker.openPopup();
      });
      list.appendChild(card);
    });
    
    if (this.currentMarkers.length && !this.searchQuery) {
      const group = new L.featureGroup(this.currentMarkers);
      this.map.fitBounds(group.getBounds().pad(0.1));
    }
  }
  
  focusPlace(id) {
    const p = this.allPlaces.find(x=>x.id===id);
    if(!p) return;
    this.map.setView([p.lat,p.lng],16);
    const m = this.currentMarkers.find(mk => {
      const ll=mk.getLatLng();
      return Math.abs(ll.lat-p.lat)<0.0001 && Math.abs(ll.lng-p.lng)<0.0001;
    });
    if(m) m.openPopup();
  }
  
  sharePlaceById(id) {
    const p = this.allPlaces.find(x=>x.id===id);
    if(p) this.sharePlace(p);
  }
  
  async handleSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('submitBtn');
    btn.disabled=true; btn.innerHTML='<i class="fas fa-circle-notch fa-spin"></i> Сохранение...';
    
    const title = document.getElementById('title').value.trim();
    const addr = document.getElementById('address').value.trim();
    const cat = document.getElementById('category').value;
    const desc = document.getElementById('description').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const website = document.getElementById('website').value.trim();
    
    if(!title||!addr){ Toast.show('Заполните обязательные поля','error'); btn.disabled=false; btn.innerHTML='<i class="fas fa-save"></i> Сохранить'; return; }
    
    const geo = await geocodeAddress(addr);
    if(!geo){ Toast.show('Адрес не найден. Проверьте правильность или укажите город.','error'); btn.disabled=false; btn.innerHTML='<i class="fas fa-save"></i> Сохранить'; return; }
    
    try {
      const res = await fetch(CONFIG.API_URL, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({title, category:cat, address: geo.displayName, lat:geo.lat, lng:geo.lng, description:desc, phone, website})
      });
      if(!res.ok) throw new Error('server');
      const saved = await res.json();
      this.allPlaces.push(saved);
      
      document.getElementById('addModal').style.display='none';
      document.body.style.overflow='';
      document.getElementById('addPlaceForm').reset();
      
      this.currentFilter='all';
      document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
      document.querySelector('[data-category="all"]').classList.add('active');
      this.render();
      this.map.setView([saved.lat, saved.lng], 16);
      Toast.show('Заведение добавлено!');
    } catch(err) {
      Toast.show('Ошибка при сохранении','error');
    } finally {
      btn.disabled=false; btn.innerHTML='<i class="fas fa-save"></i> Сохранить';
    }
  }
  
  
  
  locateUser() {
    if(!navigator.geolocation){ Toast.show('Геолокация не поддерживается','error'); return; }
    Toast.show('Определяем местоположение...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const {latitude,longitude} = pos.coords;
        if(this.userMarker) this.map.removeLayer(this.userMarker);
        this.userMarker = L.marker([latitude,longitude], {
          icon: L.divIcon({className:'user-loc', iconSize:[16,16], iconAnchor:[8,8], html:'<div style="background:#3b82f6;width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 0 0 4px rgba(59,130,246,0.3)"></div>'})
        }).addTo(this.map);
        this.map.setView([latitude,longitude], 14);
        Toast.show('Вы здесь!');
      },
      () => { Toast.show('Не удалось определить местоположение','error'); }
    );
  }
}

const app = new SoberMapApp()

// PWA: офлайн-индикатор
window.addEventListener('online', () => Toast.show('Подключение восстановлено'));
window.addEventListener('offline', () => Toast.show('Нет интернета. Показаны сохранённые данные', 'error'));