/**
 * Client-side script for pdf-gate validation UI demo
 */

document.addEventListener('DOMContentLoaded', () => {
  const schemaSelect = document.getElementById('schema-select');
  const skipLayer2Checkbox = document.getElementById('skip-layer2');
  const dragZone = document.getElementById('drag-zone');
  const fileInput = document.getElementById('pdf-file');
  const uploadForm = document.getElementById('upload-form');
  const btnSubmit = document.getElementById('btn-submit');
  
  const uploadSection = document.getElementById('upload-section');
  const loadingSection = document.getElementById('loading-section');
  const resultSection = document.getElementById('result-section');
  
  const fileSelectedInfo = document.getElementById('file-selected-info');
  const dragContent = dragZone.querySelector('.drag-content');
  const selectedFileName = document.getElementById('selected-file-name');
  const btnRemoveFile = document.getElementById('btn-remove-file');
  
  // Results Elements
  const resultStatusCard = document.getElementById('result-status-card');
  const statusIcon = document.getElementById('status-icon');
  const statusText = document.getElementById('status-text');
  const statusDescription = document.getElementById('status-description');
  
  const resFileName = document.getElementById('res-file-name');
  const resFileSize = document.getElementById('res-file-size');
  const resPages = document.getElementById('res-pages');
  const resDuration = document.getElementById('res-duration');
  
  const l1Badge = document.getElementById('l1-badge');
  const heuristicSummary = document.getElementById('heuristic-summary');
  const l1RulesList = document.getElementById('l1-rules-list');
  
  const l2Badge = document.getElementById('l2-badge');
  const l2Body = document.getElementById('l2-body');
  const btnRestart = document.getElementById('btn-restart');

  let selectedFile = null;

  // --- 1. Load Available Schemas ---
  async function loadSchemas() {
    try {
      const response = await fetch('/api/schemas');
      const data = await response.json();
      
      if (data.success && data.schemas.length > 0) {
        schemaSelect.innerHTML = '<option value="" disabled selected>Pilih skema dokumen...</option>';
        data.schemas.forEach(s => {
          const opt = document.createElement('option');
          opt.value = s.name;
          opt.textContent = s.label;
          schemaSelect.appendChild(opt);
        });
      } else {
        schemaSelect.innerHTML = '<option value="" disabled>Gagal memuat skema.</option>';
      }
    } catch (err) {
      console.error('Error loading schemas:', err);
      schemaSelect.innerHTML = '<option value="" disabled>Error memuat skema.</option>';
    }
  }

  loadSchemas();

  // --- 2. File Drag and Drop Handlers ---
  ['dragenter', 'dragover'].forEach(eventName => {
    dragZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dragZone.classList.add('drag-over');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dragZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dragZone.classList.remove('drag-over');
    }, false);
  });

  dragZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0 && files[0].type === 'application/pdf') {
      handleFileSelected(files[0]);
    }
  });

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFileSelected(e.target.files[0]);
    }
  });

  function handleFileSelected(file) {
    selectedFile = file;
    selectedFileName.textContent = file.name;
    
    // Switch view state inside drag zone
    dragContent.style.display = 'none';
    fileSelectedInfo.style.display = 'flex';
    
    validateFormState();
  }

  btnRemoveFile.addEventListener('click', (e) => {
    e.stopPropagation();
    resetFileInput();
  });

  function resetFileInput() {
    selectedFile = null;
    fileInput.value = '';
    
    dragContent.style.display = 'block';
    fileSelectedInfo.style.display = 'none';
    
    validateFormState();
  }

  function validateFormState() {
    const isSchemaSelected = schemaSelect.value !== '';
    const isFileUploaded = selectedFile !== null;
    btnSubmit.disabled = !(isSchemaSelected && isFileUploaded);
  }

  schemaSelect.addEventListener('change', validateFormState);

  // --- 3. Submit Validation Form ---
  uploadForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!selectedFile || !schemaSelect.value) return;

    // Show Loading
    uploadSection.style.display = 'none';
    loadingSection.style.display = 'block';
    resultSection.style.display = 'none';

    const formData = new FormData();
    formData.append('pdf', selectedFile);
    formData.append('schema', schemaSelect.value);
    formData.append('skipLayer2', skipLayer2Checkbox.checked);

    try {
      const response = await fetch('/api/validate', {
        method: 'POST',
        body: formData
      });
      const data = await response.json();

      if (data.success) {
        renderResults(data.result);
      } else {
        alert('Gagal melakukan validasi: ' + data.error);
        showUploadSection();
      }
    } catch (err) {
      console.error(err);
      alert('Terjadi kesalahan jaringan.');
      showUploadSection();
    }
  });

  function showUploadSection() {
    uploadSection.style.display = 'block';
    loadingSection.style.display = 'none';
    resultSection.style.display = 'none';
  }

  // --- 4. Render Validation Results ---
  function renderResults(res) {
    loadingSection.style.display = 'none';
    resultSection.style.display = 'block';

    // Render File Meta
    resFileName.textContent = res.fileName || 'Tidak bernama';
    resFileSize.textContent = `${res.fileSizeKb} KB`;
    resPages.textContent = `${res.pageCount} Halaman`;
    resDuration.textContent = `${res.totalDurationMs} ms`;

    // Render Status Header Card
    resultStatusCard.className = 'result-header-card';
    if (res.status === 'VERIFIED') {
      resultStatusCard.classList.add('state-verified');
      statusText.textContent = 'VERIFIED';
      statusDescription.textContent = 'Seluruh kriteria isi sesuai (Layer 1) dan tanda tangan digital sah (Layer 2).';
      statusIcon.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
        </svg>
      `;
    } else if (res.status === 'PLAUSIBLE') {
      resultStatusCard.classList.add('state-plausible');
      statusText.textContent = 'PLAUSIBLE';
      statusDescription.textContent = res.failReason || 'Isi dokumen sesuai (Layer 1), namun tanda tangan digital (Layer 2) dilewati atau tidak terdeteksi.';
      statusIcon.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      `;
    } else {
      resultStatusCard.classList.add('state-failed');
      statusText.textContent = 'FAILED';
      statusDescription.textContent = res.failReason || 'Validasi gagal. Dokumen terindikasi cacat atau dimodifikasi secara ilegal.';
      statusIcon.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
        </svg>
      `;
    }

    // Render Layer 1 status
    l1Badge.className = 'layer-status-badge';
    if (res.layer1.passed) {
      l1Badge.classList.add('status-ok');
      l1Badge.textContent = 'PASSED';
    } else {
      l1Badge.classList.add('status-fail');
      l1Badge.textContent = 'FAILED';
    }

    // Render Heuristics
    if (res.layer1.heuristics) {
      const h = res.layer1.heuristics;
      const flagsText = h.flags.length > 0 
        ? `<span class="heuristic-desc pc-yellow"> (Bendera: ${h.flags.join(', ')})</span>`
        : '<span class="heuristic-desc"> (Sehat)</span>';
        
      heuristicSummary.className = 'heuristic-summary';
      if (!h.passed) heuristicSummary.classList.add('skipped');
      heuristicSummary.innerHTML = `
        <span class="heuristic-title">Fuzzy Text Analysis (Kepadatan Kata)</span>
        <span class="heuristic-desc">Jumlah Kata: <strong>${h.wordCount}</strong>. Evaluasi: ${h.passed ? 'Lulus' : 'Diabaikan/Gagal'} ${flagsText}</span>
      `;
    } else {
      heuristicSummary.style.display = 'none';
    }

    // Render Layer 1 Rules List
    l1RulesList.innerHTML = '';
    res.layer1.rules.forEach(rule => {
      const li = document.createElement('li');
      li.className = `rule-item ${rule.passed ? 'rule-passed' : rule.required ? 'rule-failed' : 'rule-warning'}`;
      
      const iconSVG = rule.passed
        ? `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" /></svg>`
        : `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M6 18L18 6M6 6l12 12" /></svg>`;

      const requirementLabel = rule.required ? '<span class="badge" style="background:rgba(244,63,94,0.1);color:var(--color-failed);border-color:rgba(244,63,94,0.15);font-size:0.65rem;padding:1px 5px;margin-left:5px;">WAJIB</span>' : '';

      const snippet = rule.found 
        ? `<div class="rule-snippet">Kecocokan: "${rule.found}"</div>` 
        : '<div class="rule-meta-desc">Tidak ditemukan kecocokan kata</div>';

      li.innerHTML = `
        <div class="rule-item-icon">${iconSVG}</div>
        <div class="rule-item-content">
          <div class="rule-label">${rule.label} ${requirementLabel}</div>
          ${snippet}
        </div>
      `;
      l1RulesList.appendChild(li);
    });

    // Render Layer 2
    l2Badge.className = 'layer-status-badge';
    l2Body.innerHTML = '';

    if (res.layer2.hasSignature) {
      if (res.layer2.passed) {
        l2Badge.classList.add('status-ok');
        l2Badge.textContent = 'VERIFIED';
      } else {
        l2Badge.classList.add('status-fail');
        l2Badge.textContent = 'FAILED';
      }

      const sigDetails = `
        <div class="sig-details-container">
          <div class="sig-status-card ${res.layer2.passed ? 'status-verified' : 'status-failed'}">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <span>${res.layer2.passed ? 'Tanda Tangan Digital Kriptografis Sah (Integritas OK)' : 'Tanda Tangan Digital Cacat / Tidak Sah'}</span>
          </div>

          <div class="sig-info-list">
            <div class="sig-info-item">
              <span class="sig-info-label">Penandatangan (Subject)</span>
              <span class="sig-info-value">${res.layer2.issuedTo || '-'}</span>
            </div>
            <div class="sig-info-item">
              <span class="sig-info-label">Otoritas Sertifikat (Issuer)</span>
              <span class="sig-info-value">${res.layer2.issuer || '-'}</span>
            </div>
            <div class="sig-info-item">
              <span class="sig-info-label">Waktu Penandatanganan</span>
              <span class="sig-info-value">${res.layer2.signedAt ? new Date(res.layer2.signedAt).toLocaleString('id-ID') : '-'}</span>
            </div>
            <div class="sig-info-item">
              <span class="sig-info-label">Masa Berlaku Sertifikat</span>
              <span class="sig-info-value">${res.layer2.validFrom ? new Date(res.layer2.validFrom).toLocaleDateString('id-ID') : '-'} s/d ${res.layer2.validTo ? new Date(res.layer2.validTo).toLocaleDateString('id-ID') : '-'}</span>
            </div>
            <div class="sig-info-item">
              <span class="sig-info-label">Sertifikat Kedaluwarsa</span>
              <span class="sig-info-value" style="color:${res.layer2.certExpired ? 'var(--color-failed)' : 'var(--color-verified)'}">${res.layer2.certExpired ? 'Ya (Expired)' : 'Tidak (Aktif)'}</span>
            </div>
            <div class="sig-info-item">
              <span class="sig-info-label">Integritas Dokumen</span>
              <span class="sig-info-value" style="color:${res.layer2.integrityOk ? 'var(--color-verified)' : 'var(--color-failed)'}">${res.layer2.integrityOk ? 'Utuh / Belum Dimodifikasi' : 'Modifikasi Terdeteksi / Rusak'}</span>
            </div>
          </div>
        </div>
      `;
      l2Body.innerHTML = sigDetails;
    } else {
      l2Badge.classList.add('status-warn');
      l2Badge.textContent = 'SKIPPED';
      
      const skippedMsg = skipLayer2Checkbox.checked
        ? 'Verifikasi tanda tangan digital dilewati oleh opsi pengguna.'
        : 'Dokumen tidak memiliki tanda tangan digital kriptografis.';

      l2Body.innerHTML = `
        <div class="sig-details-container">
          <div class="sig-status-card status-skipped">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
            </svg>
            <span>${skippedMsg}</span>
          </div>
        </div>
      `;
    }
  }

  btnRestart.addEventListener('click', () => {
    resetFileInput();
    showUploadSection();
  });
});
