(() => {
  const editor = document.getElementById('editor');
  const preview = document.getElementById('preview');
  const fileInput = document.getElementById('file-input');
  const btnExport = document.getElementById('btn-export');
  const btnCopy = document.getElementById('btn-copy');
  const btnSwap = document.getElementById('btn-swap');
  const btnTheme = document.getElementById('btn-theme');
  const btnReader = document.getElementById('btn-reader');
  const btnFontDec = document.getElementById('btn-font-dec');
  const btnFontInc = document.getElementById('btn-font-inc');
  const btnClear = document.getElementById('btn-clear');
  const split = document.getElementById('split');
  const splitter = document.getElementById('splitter');
  const editorPane = document.querySelector('.editor-pane');
  const previewPane = document.querySelector('.preview-pane');

  // Configure marked for reasonably safe rendering
  marked.setOptions({ breaks: true, gfm: true, smartLists: true, smartypants: false });

  const STORAGE_KEY = 'markdown_editor_content_v1';
  const SPLIT_KEY = 'markdown_editor_split_ratio_v1'; // 0.33 ~ 0.67
  const THEME_KEY = 'markdown_editor_theme'; // 'dark' | 'light'
  const ZOOM_KEY = 'markdown_editor_base_font_px'; // number

  // Theme setup: prefer stored, fallback to system
  (function initTheme() {
    let theme = localStorage.getItem(THEME_KEY);
    if (!theme) theme = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
    updateThemeButton(theme);
  })();

  function updateThemeButton(theme) { if (btnTheme) btnTheme.textContent = theme === 'light' ? '深色' : '浅色'; }
  btnTheme?.addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem(THEME_KEY, next);
    updateThemeButton(next);
  });

  // Base font size (zoom)
  (function initZoom() {
    const saved = Number(localStorage.getItem(ZOOM_KEY));
    const base = isFinite(saved) && saved > 8 ? saved : 16;
    setBaseFont(base);
  })();
  function setBaseFont(px) {
    const clamped = Math.min(22, Math.max(12, Math.round(px)));
    document.documentElement.style.setProperty('--base-font-size', clamped + 'px');
    localStorage.setItem(ZOOM_KEY, String(clamped));
  }
  btnFontDec?.addEventListener('click', () => { const cur = Number(getComputedStyle(document.documentElement).getPropertyValue('--base-font-size').replace('px','')) || 16; setBaseFont(cur - 1); });
  btnFontInc?.addEventListener('click', () => { const cur = Number(getComputedStyle(document.documentElement).getPropertyValue('--base-font-size').replace('px','')) || 16; setBaseFont(cur + 1); });

  // Keyboard zoom: Ctrl/Cmd +/- and 0
  document.addEventListener('keydown', (e) => {
    const isCtrl = e.ctrlKey || e.metaKey;
    if (!isCtrl) return;
    const cur = Number(getComputedStyle(document.documentElement).getPropertyValue('--base-font-size').replace('px','')) || 16;
    if (e.key === '+') { setBaseFont(cur + 1); e.preventDefault(); }
    else if (e.key === '-') { setBaseFont(cur - 1); e.preventDefault(); }
    else if (e.key === '0') { setBaseFont(16); e.preventDefault(); }
  });

  // Load content from localStorage
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) editor.value = saved;

  // Split ratio
  let ratio = Number(localStorage.getItem(SPLIT_KEY) || '0.5');
  ratio = isFinite(ratio) ? ratio : 0.5;
  applySplit(ratio);
  function applySplit(r) {
    const clamped = Math.min(2/3, Math.max(1/3, r));
    editorPane.style.flexBasis = `${clamped * 100}%`;
    previewPane.style.flexBasis = `${(1 - clamped) * 100}%`;
    splitter?.setAttribute('aria-valuenow', String(Math.round(clamped * 100)));
  }

  // Render preview
  function render() {
    try {
      const raw = editor.value || '';
      const html = marked.parse(raw);
      const clean = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
      preview.innerHTML = clean;
    } catch (e) {
      preview.innerHTML = `<pre style="color:#ff6b6b">渲染错误: ${e.message}</pre>`;
    }
  }
  function persist() { localStorage.setItem(STORAGE_KEY, editor.value || ''); }

  // Initial render
  render();

  // Live preview
  editor.addEventListener('input', () => { render(); persist(); });

  // Import file
  fileInput.addEventListener('change', async (e) => {
    const f = e.target.files?.[0]; if (!f) return; const text = await f.text(); editor.value = text; render(); persist(); fileInput.value = '';
  });

  // Drag and drop import
  document.addEventListener('dragover', (e) => { e.preventDefault(); });
  document.addEventListener('drop', async (e) => {
    e.preventDefault(); const f = e.dataTransfer?.files?.[0]; if (!f) return; const text = await f.text(); editor.value = text; render(); persist();
  });

  // Export markdown
  btnExport.addEventListener('click', () => {
    const blob = new Blob([editor.value || ''], { type: 'text/markdown' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    const suggested = (editor.value.match(/^#\s*(.+)$/m)?.[1] || 'untitled').trim().replace(/\s+/g, '_');
    a.download = `${suggested}.md`; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  });

  // Copy to clipboard
  btnCopy.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(editor.value || ''); toast('已复制到剪贴板'); }
    catch { toast('复制失败，请手动 Ctrl/Cmd+C'); }
  });

  // Swap editor and preview sides
  btnSwap.addEventListener('click', () => {
    const reversed = split.style.flexDirection === 'row-reverse';
    split.style.flexDirection = reversed ? 'row' : 'row-reverse';
  });

  // Reader mode
  async function enterFullscreen() { try { await document.documentElement.requestFullscreen?.(); } catch {} }
  async function exitFullscreen() { try { await document.exitFullscreen?.(); } catch {} }
  function toggleReader() {
    const on = document.body.classList.toggle('reader');
    if (on) { enterFullscreen(); toast('已进入阅读模式（Esc 或再点按钮退出）'); }
    else { exitFullscreen(); }
  }
  btnReader?.addEventListener('click', toggleReader);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('reader')) { document.body.classList.remove('reader'); exitFullscreen(); }
    if ((e.key === 'f' || e.key === 'F') && e.shiftKey) { toggleReader(); }
  });

  // Resizable splitter (desktop only)
  let dragging = false;
  splitter?.addEventListener('pointerdown', (e) => {
    if (window.matchMedia('(max-width: 900px)').matches) return;
    dragging = true; document.body.classList.add('resizing'); splitter.setPointerCapture(e.pointerId);
  });
  splitter?.addEventListener('pointermove', (e) => {
    if (!dragging) return; const rect = split.getBoundingClientRect(); const x = e.clientX - rect.left; let r = x / rect.width; r = Math.min(2/3, Math.max(1/3, r)); applySplit(r);
  });
  const endDrag = (e) => {
    if (!dragging) return; dragging = false; document.body.classList.remove('resizing');
    const leftPct = parseFloat(editorPane.style.flexBasis) / 100; const clamped = Math.min(2/3, Math.max(1/3, leftPct || 0.5));
    localStorage.setItem(SPLIT_KEY, String(clamped)); try { splitter.releasePointerCapture(e.pointerId); } catch {}
  };
  splitter?.addEventListener('pointerup', endDrag);
  splitter?.addEventListener('pointercancel', endDrag);

  // Keyboard accessibility for splitter
  splitter?.addEventListener('keydown', (e) => {
    const step = 0.02; // 2%
    if (e.key === 'ArrowLeft') { ratio = Math.max(1/3, (parseFloat(editorPane.style.flexBasis) / 100 || 0.5) - step); applySplit(ratio); localStorage.setItem(SPLIT_KEY, String(ratio)); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { ratio = Math.min(2/3, (parseFloat(editorPane.style.flexBasis) / 100 || 0.5) + step); applySplit(ratio); localStorage.setItem(SPLIT_KEY, String(ratio)); e.preventDefault(); }
  });

  // Clear content
  btnClear.addEventListener('click', () => {
    if (!editor.value) return;
    if (confirm('确定清空当前内容吗？该操作不可撤销。')) { editor.value = ''; render(); persist(); }
  });

  // Simple toast
  function toast(msg) {
    const el = document.createElement('div'); el.textContent = msg; el.className = 'toast'; document.body.appendChild(el);
    setTimeout(() => el.classList.add('show')); setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 200); }, 1600);
  }
})();
