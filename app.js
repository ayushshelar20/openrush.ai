const modal = document.querySelector('#auth-modal');
const authForm = document.querySelector('#auth-form');
const authSubmitLabel = document.querySelector('#auth-submit-label');
const formNote = document.querySelector('#form-note');
const roleSelect = document.querySelector('#role-select');
const toast = document.querySelector('#toast');
let authMode = 'signin';
let toastTimer;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('show'), 3600);
}

function setAuthMode(mode) {
  authMode = mode;
  document.querySelectorAll('[data-auth-tab]').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.authTab === mode);
  });
  authSubmitLabel.textContent = mode === 'signin' ? 'Sign in' : 'Create account';
  formNote.textContent = mode === 'signin' ? 'Demo mode: no account is created yet.' : 'Demo mode: this creates a local preview only.';
}

function openAuth(mode = 'signin', role = '') {
  setAuthMode(mode);
  if (role) roleSelect.value = role;
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
  window.setTimeout(() => modal.querySelector('input')?.focus(), 50);
}

function closeAuth() {
  modal.hidden = true;
  document.body.style.overflow = '';
}

document.querySelectorAll('[data-open-auth]').forEach((trigger) => {
  trigger.addEventListener('click', () => openAuth(trigger.dataset.openAuth, trigger.dataset.role));
});

document.querySelectorAll('[data-auth-tab]').forEach((tab) => {
  tab.addEventListener('click', () => setAuthMode(tab.dataset.authTab));
});

document.querySelector('[data-close-auth]').addEventListener('click', closeAuth);
modal.addEventListener('click', (event) => {
  if (event.target === modal) closeAuth();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !modal.hidden) closeAuth();
});

authForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const roleNames = { supplier: 'Supplier', rider: 'Volunteer rider', receiver: 'Receiver / shelter' };
  const roleName = roleNames[roleSelect.value];
  const dashboardPages = { supplier: 'supplier.html', rider: 'rider.html', receiver: 'receiver.html' };
  closeAuth();
  showToast(`${authMode === 'signin' ? 'Signed in' : 'Preview created'} as ${roleName}. Opening your dashboard…`);
  window.setTimeout(() => { window.location.href = dashboardPages[roleSelect.value]; }, 450);
});

document.querySelectorAll('.workflow-step').forEach((step) => {
  step.addEventListener('click', () => {
    document.querySelectorAll('.workflow-step').forEach((item) => item.classList.remove('active'));
    step.classList.add('active');
  });
});

document.querySelectorAll('.small-button').forEach((button) => {
  button.addEventListener('click', () => showToast('The full demand queue will be connected to live data in the next build.'));
});
