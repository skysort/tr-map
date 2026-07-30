// Общая логика для страниц: courses.html, meetups.html, clubs.html
// Секция задаётся атрибутом data-section на <body> ("courses" | "meetups" | "clubs")

document.addEventListener('DOMContentLoaded', () => {
  const section = document.body.dataset.section;
  const listEl = document.getElementById('itemsList');
  const form = document.getElementById('addItemForm');
  const modal = document.getElementById('addModal');
  const openBtn = document.getElementById('openModalBtn');
  const closeBtn = document.getElementById('closeModalBtn');
  const cancelBtn = document.getElementById('cancelBtn');

  function showToast(message, isError) {
    const container = document.getElementById('toastContainer');
    if (!container) return alert(message);
    const toast = document.createElement('div');
    toast.className = 'toast ' + (isError ? 'error' : 'success');
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
  }

  function openModal() { modal.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
  function closeModal() { modal.style.display = 'none'; document.body.style.overflow = ''; form.reset(); }

  openBtn?.addEventListener('click', openModal);
  closeBtn?.addEventListener('click', closeModal);
  cancelBtn?.addEventListener('click', closeModal);
  modal?.querySelector('.modal-overlay')?.addEventListener('click', closeModal);

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function renderItem(item) {
    const card = document.createElement('div');
    card.className = 'place-card';
    card.innerHTML = `
      <div class="place-card-header">
        <h4>${escapeHtml(item.title)}</h4>
      </div>
      ${item.dateText ? `<p class="address"><i class="fas fa-calendar"></i> ${escapeHtml(item.dateText)}</p>` : ''}
      ${item.city || item.address ? `<p class="address"><i class="fas fa-map-marker-alt"></i> ${escapeHtml([item.city, item.address].filter(Boolean).join(', '))}</p>` : ''}
      ${item.description ? `<p class="desc">${escapeHtml(item.description)}</p>` : ''}
      <div class="place-card-footer">
        ${item.phone ? `<a href="tel:${escapeHtml(item.phone)}"><i class="fas fa-phone"></i> ${escapeHtml(item.phone)}</a>` : ''}
        ${item.website ? `<a href="${escapeHtml(item.website)}" target="_blank" rel="noopener"><i class="fas fa-globe"></i> Сайт</a>` : ''}
      </div>
    `;
    return card;
  }

  async function loadItems() {
    listEl.innerHTML = '<div class="loading-state"><i class="fas fa-circle-notch fa-spin"></i><p>Загрузка...</p></div>';
    try {
      const res = await fetch(`/api/${section}`);
      if (!res.ok) throw new Error('Ошибка загрузки');
      const items = await res.json();
      listEl.innerHTML = '';
      if (!items.length) {
        listEl.innerHTML = '<div class="loading-state"><p>Пока ничего не добавлено. Будьте первым!</p></div>';
        return;
      }
      items.forEach(item => listEl.appendChild(renderItem(item)));
    } catch (err) {
      listEl.innerHTML = '<div class="loading-state"><p>Не удалось загрузить данные. Попробуйте обновить страницу.</p></div>';
    }
  }

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      title: document.getElementById('title').value,
      city: document.getElementById('city').value,
      address: document.getElementById('address').value,
      dateText: document.getElementById('dateText').value,
      description: document.getElementById('description').value,
      phone: document.getElementById('phone').value,
      website: document.getElementById('website').value
    };
    const submitBtn = document.getElementById('submitBtn');
    submitBtn.disabled = true;
    try {
      const res = await fetch(`/api/${section}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error();
      showToast('Добавлено! Спасибо.');
      closeModal();
      loadItems();
    } catch (err) {
      showToast('Не получилось сохранить. Проверьте поля.', true);
    } finally {
      submitBtn.disabled = false;
    }
  });

  loadItems();
});
