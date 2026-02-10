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
  const btnExportHtml = document.getElementById('btn-export-html');
  const split = document.getElementById('split');
  const splitter = document.getElementById('splitter');
  const editorPane = document.querySelector('.editor-pane');
  const previewPane = document.querySelector('.preview-pane');

  marked.setOptions({ breaks: true, gfm: true, smartLists: true, smartypants: false });

  const STORAGE_KEY = 'markdown_editor_content_v1';
  const SPLIT_KEY = 'markdown_editor_split_ratio_v1';
  const THEME_KEY = 'markdown_editor_theme';
  const ZOOM_KEY = 'markdown_editor_content_font_px';

  // Theme setup
  (function initTheme() {
    let theme = localStorage.getItem(THEME_KEY) || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    document.documentElement.setAttribute('data-theme', theme);
    if (btnTheme) btnTheme.textContent = theme === 'light' ? '深色' : '浅色';
  })();
  btnTheme?.addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem(THEME_KEY, next);
    btnTheme.textContent = next === 'light' ? '深色' : '浅色';
  });

  // Content font size (zoom) — affects editor + preview only
  (function initZoom() {
    const saved = Number(localStorage.getItem(ZOOM_KEY));
    const base = isFinite(saved) && saved > 8 ? saved : 16;
    setContentFont(base);
  })();
  function setContentFont(px) {
    const clamped = Math.min(22, Math.max(12, Math.round(px)));
    document.documentElement.style.setProperty('--content-font-size', clamped + 'px');
    localStorage.setItem(ZOOM_KEY, String(clamped));
  }
  function currentContentFont() {
    return Number(getComputedStyle(document.documentElement).getPropertyValue('--content-font-size').replace('px','')) || 16;
  }
  btnFontDec?.addEventListener('click', () => setContentFont(currentContentFont() - 1));
  btnFontInc?.addEventListener('click', () => setContentFont(currentContentFont() + 1));
  document.addEventListener('keydown', (e) => {
    const isCtrl = e.ctrlKey || e.metaKey;
    if (!isCtrl) return;
    if (e.key === '+') { setContentFont(currentContentFont() + 1); e.preventDefault(); }
    else if (e.key === '-') { setContentFont(currentContentFont() - 1); e.preventDefault(); }
    else if (e.key === '0') { setContentFont(16); e.preventDefault(); }
  });

  // Load content
  const saved = localStorage.getItem(STORAGE_KEY); if (saved) editor.value = saved;

  // Split ratio
  let ratio = Number(localStorage.getItem(SPLIT_KEY) || '0.5'); ratio = isFinite(ratio) ? ratio : 0.5; applySplit(ratio);
  function applySplit(r) {
    const clamped = Math.min(2/3, Math.max(1/3, r));
    editorPane.style.flexBasis = `${clamped * 100}%`;
    previewPane.style.flexBasis = `${(1 - clamped) * 100}%`;
    splitter?.setAttribute('aria-valuenow', String(Math.round(clamped * 100)));
  }

  // Render preview + enhancements
  function slugify(s) {
    return s.toLowerCase().trim().replace(/[^a-z0-9\u4e00-\u9fa5\s-]/g, '').replace(/\s+/g, '-');
  }
  function enhancePreview() {
    // headings id for anchors
    preview.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(h => {
      if (!h.id) h.id = slugify(h.textContent || '');
    });
    // syntax highlight
    if (window.hljs) preview.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));
  }
  function render() {
    try {
      const raw = editor.value || '';
      const html = marked.parse(raw);
      const clean = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
      preview.innerHTML = clean;
      enhancePreview();
    } catch (e) {
      preview.innerHTML = `<pre style=\"color:#ff6b6b\">渲染错误: ${e.message}</pre>`;
    }
  }
  function persist() { localStorage.setItem(STORAGE_KEY, editor.value || ''); }

  // Initial render
  render();

  // Live preview
  editor.addEventListener('input', () => { render(); persist(); });

  // Import file
  fileInput.addEventListener('change', async (e) => {
    const f = e.target.files?.[0]; if (!f) return; const text = await f.text(); editor.value = text; render(); persist(); fileInput.value='';
  });
  document.addEventListener('dragover', (e) => { e.preventDefault(); });
  document.addEventListener('drop', async (e) => { e.preventDefault(); const f = e.dataTransfer?.files?.[0]; if (!f) return; const text = await f.text(); editor.value = text; render(); persist(); });

  // Export markdown
  btnExport.addEventListener('click', () => {
    const blob = new Blob([editor.value || ''], { type: 'text/markdown' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    const suggested = (editor.value.match(/^#\s*(.+)$/m)?.[1] || 'untitled').trim().replace(/\s+/g, '_');
    a.download = `${suggested}.md`; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  });

  // Export HTML (single file)
  btnExportHtml?.addEventListener('click', () => {
    const title = (editor.value.match(/^#\s*(.+)$/m)?.[1] || 'Document').trim();
    const html = `<!doctype html><html lang=\"zh-CN\"><meta charset=\"utf-8\"/><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"/><title>${title}</title><style>
      body{font:16px/1.8 -apple-system,BlinkMacSystemFont,'SF Pro Text','SF Pro Display',Segoe UI,Roboto,Helvetica,Arial,sans-serif;margin:0;padding:24px;color:#111}
      .content{max-width:900px;margin:0 auto}
      pre{background:#0b1220;color:#e6eefb;border:1px solid #16233a;padding:12px;border-radius:10px;overflow:auto}
      code{background:#f4f7ff;padding:2px 6px;border-radius:6px}
      blockquote{border-left:3px solid #305188;margin:12px 0;padding-left:12px;color:#334}
      a{color:#0a84ff;text-decoration:none}a:hover{text-decoration:underline}
    </style><div class=\"content\">${preview.innerHTML}</div></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${title.replace(/\s+/g,'_')}.html`; document.body.appendChild(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(a.href); a.remove();},0);
  });

  // Copy to clipboard
  btnCopy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(editor.value || ''); toast('已复制到剪贴板'); } catch { toast('复制失败，请手动 Ctrl/Cmd+C'); } });

  // Swap sides
  btnSwap.addEventListener('click', () => { const reversed = split.style.flexDirection === 'row-reverse'; split.style.flexDirection = reversed ? 'row' : 'row-reverse'; });

  // Reader mode
  async function enterFullscreen() { try { await document.documentElement.requestFullscreen?.(); } catch {} }
  async function exitFullscreen() { try { await document.exitFullscreen?.(); } catch {} }
  function toggleReader() { const on = document.body.classList.toggle('reader'); if (on) { enterFullscreen(); toast('已进入阅读模式（Esc 或再点按钮退出）'); } else { exitFullscreen(); } }
  btnReader?.addEventListener('click', toggleReader);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.body.classList.contains('reader')) { document.body.classList.remove('reader'); exitFullscreen(); }
    if ((e.key === 'f' || e.key === 'F') && e.shiftKey) { toggleReader(); }
  });

  // Resizable splitter
  let dragging = false;
  splitter?.addEventListener('pointerdown', (e) => { if (window.matchMedia('(max-width: 900px)').matches) return; dragging = true; document.body.classList.add('resizing'); splitter.setPointerCapture(e.pointerId); });
  splitter?.addEventListener('pointermove', (e) => { if (!dragging) return; const rect = split.getBoundingClientRect(); const x = e.clientX - rect.left; let r = x / rect.width; r = Math.min(2/3, Math.max(1/3, r)); applySplit(r); });
  const endDrag = (e) => { if (!dragging) return; dragging = false; document.body.classList.remove('resizing'); const leftPct = parseFloat(editorPane.style.flexBasis) / 100; const clamped = Math.min(2/3, Math.max(1/3, leftPct || 0.5)); localStorage.setItem(SPLIT_KEY, String(clamped)); try { splitter.releasePointerCapture(e.pointerId); } catch {} };
  splitter?.addEventListener('pointerup', endDrag); splitter?.addEventListener('pointercancel', endDrag);
  splitter?.addEventListener('keydown', (e) => { const step = 0.02; if (e.key === 'ArrowLeft') { ratio = Math.max(1/3, (parseFloat(editorPane.style.flexBasis)/100 || 0.5) - step); applySplit(ratio); localStorage.setItem(SPLIT_KEY, String(ratio)); e.preventDefault(); } else if (e.key === 'ArrowRight') { ratio = Math.min(2/3, (parseFloat(editorPane.style.flexBasis)/100 || 0.5) + step); applySplit(ratio); localStorage.setItem(SPLIT_KEY, String(ratio)); e.preventDefault(); } });

  // Clear content
  document.getElementById('btn-clear')?.addEventListener('click', () => { if (!editor.value) return; if (confirm('确定清空当前内容吗？该操作不可撤销。')) { editor.value=''; render(); persist(); } });

  function toast(msg) { const el = document.createElement('div'); el.textContent = msg; el.className = 'toast'; document.body.appendChild(el); setTimeout(() => el.classList.add('show')); setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 200); }, 1600); }
})();
