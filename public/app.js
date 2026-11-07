const $ = (selector) => document.querySelector(selector);

const els = {
  rows: $('#rows'),
  empty: $('#empty'),
  bars: $('#bars'),
  search: $('#search'),
  categoryFilter: $('#categoryFilter'),
  statusFilter: $('#statusFilter'),
  modal: $('#modal'),
  form: $('#form'),
  title: $('#modalTitle'),
  error: $('#formError'),
  save: $('#saveBtn'),
  confirmModal: $('#confirmModal'),
  confirmText: $('#confirmText'),
  toast: $('#toast'),
};

let editingId = null;
let deletingId = null;
let toastTimer;

async function api(url, options = {}) {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function showToast(message, isError = false) {
  els.toast.textContent = message;
  els.toast.classList.toggle('error', isError);
  els.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), 4200);
}

function formatDate(value) {
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

async function loadStats() {
  const stats = await api('/api/stats');
  $('#mTotal').textContent = stats.total;
  $('#mConfirmed').textContent = stats.confirmed;
  $('#mPending').textContent = stats.pending;
  $('#mCancelled').textContent = stats.cancelled;

  const max = Math.max(1, ...stats.byCategory.map((c) => c.participants));
  els.bars.innerHTML = stats.byCategory.map((c) => `
    <li class="bar-row">
      <b>${esc(c.category)}</b>
      <div class="track"><i style="width:${(c.participants / max) * 100}%"></i></div>
      <span>${c.participants}</span>
    </li>`).join('');
}

async function loadParticipants() {
  const params = new URLSearchParams();
  if (els.search.value.trim()) params.set('search', els.search.value.trim());
  if (els.categoryFilter.value) params.set('category', els.categoryFilter.value);
  if (els.statusFilter.value) params.set('status', els.statusFilter.value);

  const participants = await api('/api/participants?' + params);
  els.empty.hidden = participants.length > 0;
  els.rows.innerHTML = participants.map((p) => `
    <tr>
      <td class="name">${esc(p.fullName)}<small>${esc(p.email)}</small></td>
      <td>${esc(p.contact)}</td>
      <td class="num">${p.age}</td>
      <td><span class="tag">${esc(p.category)}</span></td>
      <td>${esc(p.shirtSize)}</td>
      <td><span class="badge ${esc(p.status)}">${esc(p.status)}</span></td>
      <td>${formatDate(p.registeredAt)}</td>
      <td>
        <div class="row-actions">
          <button class="btn small" data-edit="${p.id}">Edit</button>
          <button class="btn small danger-outline" data-delete="${p.id}" data-name="${esc(p.fullName)}">Delete</button>
        </div>
      </td>
    </tr>`).join('');
}

async function refresh() {
  try {
    await Promise.all([loadStats(), loadParticipants()]);
  } catch (err) {
    showToast(err.message, true);
  }
}

function openForm(participant) {
  editingId = participant ? participant.id : null;
  els.title.textContent = participant ? 'Edit participant' : 'Add participant';
  els.form.reset();
  els.error.hidden = true;
  if (participant) {
    els.form.fullName.value = participant.fullName;
    els.form.email.value = participant.email;
    els.form.contact.value = participant.contact;
    els.form.age.value = participant.age;
    els.form.gender.value = participant.gender;
    els.form.category.value = participant.category;
    els.form.shirtSize.value = participant.shirtSize;
    els.form.status.value = participant.status;
  }
  els.modal.showModal();
  els.form.fullName.focus();
}

els.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  els.error.hidden = true;
  const body = JSON.stringify({
    fullName: els.form.fullName.value,
    email: els.form.email.value,
    contact: els.form.contact.value,
    age: els.form.age.value,
    gender: els.form.gender.value,
    category: els.form.category.value,
    shirtSize: els.form.shirtSize.value,
    status: els.form.status.value,
  });

  els.save.disabled = true;
  try {
    if (editingId) {
      await api(`/api/participants/${editingId}`, { method: 'PUT', body });
      showToast('Participant updated');
    } else {
      await api('/api/participants', { method: 'POST', body });
      showToast('Participant added');
    }
    els.modal.close();
    refresh();
  } catch (err) {
    els.error.textContent = err.message;
    els.error.hidden = false;
  } finally {
    els.save.disabled = false;
  }
});

els.rows.addEventListener('click', async (event) => {
  const editBtn = event.target.closest('[data-edit]');
  const deleteBtn = event.target.closest('[data-delete]');

  if (editBtn) {
    try {
      openForm(await api(`/api/participants/${editBtn.dataset.edit}`));
    } catch (err) {
      showToast(err.message, true);
    }
  }

  if (deleteBtn) {
    deletingId = deleteBtn.dataset.delete;
    els.confirmText.textContent = `${deleteBtn.dataset.name} will be removed from the registration list. This can't be undone.`;
    els.confirmModal.showModal();
  }
});

$('#confirmCancel').addEventListener('click', () => els.confirmModal.close());

$('#confirmDelete').addEventListener('click', async () => {
  try {
    await api(`/api/participants/${deletingId}`, { method: 'DELETE' });
    els.confirmModal.close();
    showToast('Participant deleted');
    refresh();
  } catch (err) {
    els.confirmModal.close();
    showToast(err.message, true);
  }
});

$('#addBtn').addEventListener('click', () => openForm(null));
$('#cancelBtn').addEventListener('click', () => els.modal.close());

[els.modal, els.confirmModal].forEach((dialog) => {
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
});

let searchTimer;
els.search.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => loadParticipants().catch((err) => showToast(err.message, true)), 250);
});
[els.categoryFilter, els.statusFilter].forEach((select) => {
  select.addEventListener('change', () => loadParticipants().catch((err) => showToast(err.message, true)));
});

const navLinks = document.querySelectorAll('[data-nav]');
const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      navLinks.forEach((link) => link.classList.toggle('active', link.getAttribute('href') === `#${entry.target.id}`));
    }
  });
}, { rootMargin: '-30% 0px -60% 0px' });
document.querySelectorAll('main section').forEach((section) => observer.observe(section));

refresh();

const eventEls = {
  dateText: $('#eventDateText'),
  countdown: $('#eventCountdown'),
  dateForm: $('#dateForm'),
  dateSave: $('#dateSave'),
  mailNotice: $('#mailNotice'),
  composeBtn: $('#composeBtn'),
  mailModal: $('#mailModal'),
  mailForm: $('#mailForm'),
  mailError: $('#mailError'),
  mailSend: $('#mailSend'),
  wipeBtn: $('#wipeBtn'),
  wipeModal: $('#wipeModal'),
  wipeInput: $('#wipeInput'),
  wipeConfirm: $('#wipeConfirm'),
  wipeCount: $('#wipeCount'),
};

function parseIsoDate(value) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatLongDate(value) {
  return parseIsoDate(value).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}

function countdownText(value) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((parseIsoDate(value) - today) / 86400000);
  if (days > 1) return `${days} days to go`;
  if (days === 1) return 'Tomorrow';
  if (days === 0) return 'Today';
  return 'This date has passed';
}

async function loadEvent() {
  try {
    const event = await api('/api/event');
    eventEls.mailNotice.hidden = event.mailConfigured;
    eventEls.composeBtn.disabled = !event.mailConfigured;
    if (event.eventDate) {
      eventEls.dateText.textContent = formatLongDate(event.eventDate);
      eventEls.countdown.textContent = countdownText(event.eventDate);
      eventEls.dateForm.eventDate.value = event.eventDate;
    } else {
      eventEls.dateText.textContent = 'Not set';
      eventEls.countdown.textContent = 'Pick a date below to set it.';
    }
  } catch (err) {
    showToast(err.message, true);
  }
}

function describeDateResult(result, notify) {
  if (!notify || !result.email) return { message: 'Event date saved', isError: false };
  if (result.email.error) {
    return { message: `Date saved, but no emails were sent. ${result.email.error}`, isError: true };
  }
  if (result.email.failed.length) {
    return {
      message: `Date saved. Emailed ${result.email.sent} of ${result.email.total}. ${result.email.failed.length} failed: ${result.email.failed[0].reason}`,
      isError: true,
    };
  }
  return { message: `Date saved. Emailed ${result.email.sent} ${result.email.sent === 1 ? 'participant' : 'participants'}`, isError: false };
}

eventEls.dateForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = eventEls.dateForm;
  const notify = form.notify.checked;
  if (!form.eventDate.value) {
    showToast('Choose a date first', true);
    return;
  }
  eventEls.dateSave.disabled = true;
  eventEls.dateSave.textContent = notify ? 'Saving and emailing' : 'Saving';
  try {
    const result = await api('/api/event', {
      method: 'PUT',
      body: JSON.stringify({ eventDate: form.eventDate.value, notify }),
    });
    form.notify.checked = false;
    await loadEvent();
    const outcome = describeDateResult(result, notify);
    showToast(outcome.message, outcome.isError);
  } catch (err) {
    showToast(err.message, true);
  } finally {
    eventEls.dateSave.disabled = false;
    eventEls.dateSave.textContent = 'Save date';
  }
});

eventEls.composeBtn.addEventListener('click', () => {
  eventEls.mailForm.reset();
  eventEls.mailError.hidden = true;
  eventEls.mailModal.showModal();
  eventEls.mailForm.subject.focus();
});

$('#mailCancel').addEventListener('click', () => eventEls.mailModal.close());

eventEls.mailForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = eventEls.mailForm;
  eventEls.mailError.hidden = true;
  eventEls.mailSend.disabled = true;
  eventEls.mailSend.textContent = 'Sending';
  try {
    const result = await api('/api/email', {
      method: 'POST',
      body: JSON.stringify({
        audience: form.audience.value,
        subject: form.subject.value,
        message: form.message.value,
      }),
    });
    if (result.failed.length) {
      eventEls.mailError.textContent =
        `Sent to ${result.sent} of ${result.total}. ${result.failed.length} failed. First error: ${result.failed[0].reason}`;
      eventEls.mailError.hidden = false;
    } else {
      eventEls.mailModal.close();
      showToast(`Email sent to ${result.sent} ${result.sent === 1 ? 'person' : 'people'}`);
    }
  } catch (err) {
    eventEls.mailError.textContent = err.message;
    eventEls.mailError.hidden = false;
  } finally {
    eventEls.mailSend.disabled = false;
    eventEls.mailSend.textContent = 'Send email';
  }
});

eventEls.wipeBtn.addEventListener('click', () => {
  eventEls.wipeCount.textContent = $('#mTotal').textContent;
  eventEls.wipeInput.value = '';
  eventEls.wipeConfirm.disabled = true;
  eventEls.wipeModal.showModal();
  eventEls.wipeInput.focus();
});

eventEls.wipeInput.addEventListener('input', () => {
  eventEls.wipeConfirm.disabled = eventEls.wipeInput.value.trim() !== 'DELETE ALL';
});

$('#wipeCancel').addEventListener('click', () => eventEls.wipeModal.close());

eventEls.wipeConfirm.addEventListener('click', async () => {
  eventEls.wipeConfirm.disabled = true;
  try {
    const result = await api('/api/participants', {
      method: 'DELETE',
      body: JSON.stringify({ confirm: 'DELETE ALL' }),
    });
    eventEls.wipeModal.close();
    showToast(`Deleted ${result.deleted} ${result.deleted === 1 ? 'participant' : 'participants'}`);
    refresh();
  } catch (err) {
    eventEls.wipeModal.close();
    showToast(err.message, true);
  }
});

[eventEls.mailModal, eventEls.wipeModal].forEach((dialog) => {
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
});

loadEvent();
