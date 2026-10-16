const productForm = document.querySelector('#product-form');
const adminShell = document.querySelector('#admin-shell');
const menuToggle = document.querySelector('#admin-menu-toggle');
const menuScrim = document.querySelector('#admin-menu-scrim');

if (adminShell && menuToggle && menuScrim) {
  const closeMenu = () => {
    adminShell.classList.remove('menu-open');
    menuToggle.setAttribute('aria-expanded', 'false');
    menuToggle.setAttribute('aria-label', 'Open navigation');
    menuScrim.hidden = true;
  };
  menuToggle.addEventListener('click', () => {
    const isOpen = adminShell.classList.toggle('menu-open');
    menuToggle.setAttribute('aria-expanded', String(isOpen));
    menuToggle.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
    menuScrim.hidden = !isOpen;
  });
  menuScrim.addEventListener('click', closeMenu);
  adminShell.querySelectorAll('.admin-nav a').forEach((link) => link.addEventListener('click', closeMenu));
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closeMenu(); });
}

if (productForm) {
  const unitSelect = document.querySelector('#unit-type');
  const unitGroups = [...document.querySelectorAll('.unit-fields')];
  const imageInput = document.querySelector('#product-image');
  const imageId = document.querySelector('#image-upload-id');
  const imageStatus = document.querySelector('#image-status');
  const uploadError = document.querySelector('#upload-error');
  let uploadPending = false;

  function updateUnitFields() {
    for (const group of unitGroups) {
      const active = group.dataset.unit === unitSelect.value;
      group.hidden = !active;
      for (const field of group.querySelectorAll('input,select')) field.disabled = !active;
    }
  }
  updateUnitFields();
  unitSelect.addEventListener('change', updateUnitFields);

  imageInput.addEventListener('change', async () => {
    imageId.value = '';
    uploadError.hidden = true;
    const file = imageInput.files?.[0];
    if (!file) { imageStatus.textContent = 'No new image selected.'; return; }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 4 * 1024 * 1024) {
      uploadError.textContent = 'Choose a JPEG, PNG, or WebP image no larger than 4 MiB.';
      uploadError.hidden = false;
      imageInput.value = '';
      return;
    }
    uploadPending = true;
    imageStatus.textContent = 'Uploading image securely…';
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('The selected file could not be read.'));
        reader.readAsDataURL(file);
      });
      const response = await fetch('/products/images', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-csrf-token': document.querySelector('meta[name="csrf-token"]').content },
        body: JSON.stringify({ dataUrl }),
      });
      const result = await response.json();
      if (!response.ok || !result.uploadId) throw new Error(result.error?.message || 'Image upload failed.');
      imageId.value = result.uploadId;
      imageStatus.textContent = 'Image uploaded. It will be saved with the product.';
    } catch (error) {
      imageStatus.textContent = 'No replacement image uploaded.';
      uploadError.textContent = error.message || 'Image upload failed.';
      uploadError.hidden = false;
    } finally { uploadPending = false; }
  });

  productForm.addEventListener('submit', (event) => {
    if (uploadPending) {
      event.preventDefault();
      uploadError.textContent = 'Wait for the image upload to finish, then save again.';
      uploadError.hidden = false;
    }
  });
}

document.querySelectorAll('form[data-confirm]').forEach((form) => {
  form.addEventListener('submit', (event) => {
    if (!window.confirm(form.dataset.confirm)) event.preventDefault();
  });
});

document.querySelectorAll('[data-copy-value]').forEach((button) => {
  button.addEventListener('click', async () => {
    const status = button.parentElement.querySelector('[data-copy-status]');
    try {
      await navigator.clipboard.writeText(button.dataset.copyValue);
      if (status) status.textContent = 'Copied.';
    } catch (_error) {
      if (status) status.textContent = 'Copy was unavailable. Select and copy the URL above.';
    }
  });
});
