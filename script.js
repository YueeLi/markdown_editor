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
  const btnExportPdf = document.getElementById('btn-export-pdf');
  const btnToc = document.getElementById('btn-toc');
  const tocDepthSel = document.getElementById('toc-depth');
  const toc = document.getElementById('toc');
  const split = document.getElementById('split');
  const splitter = document.getElementById('splitter');
  const editorPane = document.querySelector('.editor-pane');
  const previewPane = document.querySelector('.preview-pane');

  marked.setOptions({ breaks: true, gfm: true, smartLists: true, smartypants: false });

  const STORAGE_KEY = 'markdown_editor_content_v1';
  const SPLIT_KEY = 'markdown_editor_split_ratio_v1';
  const THEME_KEY = 'markdown_editor_theme';
  const ZOOM_KEY = 'markdown_editor_content_font_px';
  let MAX_TOC_LEVEL = Number(tocDepthSel?.value || 4);

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
    render();
  });

  // Content font size (zoom) — affects editor + preview only
  (function initZoom() {
    const saved = Number(localStorage.getItem(ZOOM_KEY));
    const base = isFinite(saved) && saved > 8 ? saved : 16;
    setContentFont(base);
  })();
  function setContentFont(px) {
    const clamped = Math.min(26, Math.max(12, Math.round(px)));
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

  // Helpers
  function slugify(s) { return s.toLowerCase().trim().replace(/[^a-z0-9\u4e00-\u9fa5\s-]/g, '').replace(/\s+/g, '-'); }
  function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function fileToDataURL(file) { return new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(file); }); }
  function insertAtCursor(textarea, text) { const start = textarea.selectionStart ?? textarea.value.length; const end = textarea.selectionEnd ?? textarea.value.length; const before = textarea.value.slice(0, start); const after = textarea.value.slice(end); textarea.value = before + text + after; const pos = start + text.length; textarea.setSelectionRange(pos, pos); }

  // Sections map for collapse
  let sections = [];
  function buildSections() {
    const hs = Array.from(preview.querySelectorAll('h1,h2,h3,h4,h5,h6'));
    sections = [];
    for (let i = 0; i < hs.length; i++) {
      const h = hs[i]; const level = Number(h.tagName.substring(1));
      let end = preview.lastElementChild?.nextSibling || null;
      for (let j = i + 1; j < hs.length; j++) {
        const h2 = hs[j]; const level2 = Number(h2.tagName.substring(1));
        if (level2 <= level) { end = h2; break; }
      }
      sections.push({ id: h.id || (h.id = slugify(h.textContent || '')), start: h, end, level });
    }
  }
  const collapsed = new Set();
  function toggleCollapse(id) {
    const sec = sections.find(s => s.id === id); if (!sec) return;
    const isCollapsed = collapsed.has(id);
    if (isCollapsed) collapsed.delete(id); else collapsed.add(id);
    // hide elements between start.next and end.prev
    let cur = sec.start.nextElementSibling;
    while (cur && cur !== sec.end) { const next = cur.nextElementSibling; cur.style.display = isCollapsed ? '' : 'none'; cur = next; }
    // mark in TOC
    toc.querySelectorAll('a').forEach(a => { if (a.dataset.id === id) a.classList.toggle('collapsed', !isCollapsed); });
  }

  // TOC build + scrollspy + collapse + depth filter + thumb preview
  let activeTocId = null;
  let tipEl = null;
  function ensureTip() { if (!tipEl) { tipEl = document.createElement('div'); tipEl.id = 'toc-tip'; document.body.appendChild(tipEl); } }
  function buildTOC() {
    if (!toc) return;
    buildSections();
    const items = sections.filter(s => s.level <= MAX_TOC_LEVEL);
    toc.innerHTML = items.map(it => `<div class=\"toc-item\"><a href=\"#${it.id}\" data-id=\"${it.id}\" style=\"--depth:${it.level-1}\">${it.text || it.id}</a><button class=\"btn ghost\" data-collapse=\"${it.id}\" title=\"折叠/展开\">▾</button></div>`).join('');
    // click jump
    toc.querySelectorAll('a').forEach(a => a.addEventListener('click', (e) => { e.preventDefault(); const id = a.getAttribute('data-id'); const el = document.getElementById(id); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }));
    // collapse
    toc.querySelectorAll('button[data-collapse]').forEach(b => b.addEventListener('click', (e) => { const id = b.getAttribute('data-collapse'); toggleCollapse(id); }));
    // preview tooltip
    ensureTip();
    toc.querySelectorAll('a').forEach(a => {
      a.addEventListener('mouseenter', (e) => {
        const id = a.getAttribute('data-id'); const sec = sections.find(s => s.id === id); if (!sec) return;
        let html = '';
        let cur = sec.start.nextElementSibling; let count = 0;
        while (cur && cur !== sec.end && count < 4) { html += cur.outerHTML || ''; cur = cur.nextElementSibling; count++; }
        tipEl.innerHTML = html || '<span style="color:var(--muted)">（空段落）</span>';
        const rect = a.getBoundingClientRect(); tipEl.style.top = (rect.top + 8) + 'px'; tipEl.style.left = (rect.right + 8) + 'px'; tipEl.classList.add('show');
      });
      a.addEventListener('mouseleave', () => { tipEl.classList.remove('show'); });
    });
    // spy
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(ent => { if (ent.isIntersecting) { activeTocId = ent.target.id; toc.querySelectorAll('a').forEach(a => a.classList.toggle('active', a.getAttribute('data-id') === activeTocId)); } });
    }, { root: preview, threshold: 0.2 });
    sections.forEach(s => obs.observe(s.start));
  }
  btnToc?.addEventListener('click', () => toc?.classList.toggle('show'));
  tocDepthSel?.addEventListener('change', () => { MAX_TOC_LEVEL = Number(tocDepthSel.value || 4); buildTOC(); });

  // Render preview + enhancements
  async function enhancePreview() {
    preview.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(h => { if (!h.id) h.id = slugify(h.textContent || ''); });
    // syntax highlight
    if (window.hljs) preview.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));
    // Mermaid
    if (window.mermaid) {
      try {
        const theme = (document.documentElement.getAttribute('data-theme') || 'dark') === 'light' ? 'default' : 'dark';
        mermaid.initialize({ startOnLoad: false, theme });
        const merBlocks = preview.querySelectorAll('pre code.language-mermaid');
        for (const codeEl of merBlocks) {
          const code = codeEl.textContent || ''; const pre = codeEl.closest('pre'); const container = document.createElement('div'); container.className = 'mermaid'; container.textContent = code; pre?.replaceWith(container);
        }
        await mermaid.run({ querySelector: '.mermaid' });
      } catch (e) {}
    }
    // KaTeX auto-render
    if (window.renderMathInElement) { try { renderMathInElement(preview, { delimiters: [ {left: '$$', right: '$$', display: true}, {left: '$', right: '$', display: false} ], throwOnError: false }); } catch {} }
    buildTOC();
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

  // Sync scroll (editor <-> preview)
  let syncing = false;
  editor.addEventListener('scroll', () => { if (syncing) return; syncing = true; const r = editor.scrollTop / Math.max(1, editor.scrollHeight - editor.clientHeight); preview.scrollTop = r * Math.max(1, preview.scrollHeight - preview.clientHeight); syncing = false; });
  preview.addEventListener('scroll', () => { if (syncing) return; syncing = true; const r = preview.scrollTop / Math.max(1, preview.scrollHeight - preview.clientHeight); editor.scrollTop = r * Math.max(1, editor.scrollHeight - editor.clientHeight); syncing = false; });

  // Import file + image handling
  fileInput.addEventListener('change', async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    if (f.type.startsWith('image/')) { const dataUrl = await fileToDataURL(f); insertAtCursor(editor, `\n![${f.name}](${dataUrl})\n`); }
    else { const text = await f.text(); editor.value = text; }
    render(); persist(); fileInput.value='';
  });
  document.addEventListener('dragover', (e) => { e.preventDefault(); });
  document.addEventListener('drop', async (e) => { e.preventDefault(); const f = e.dataTransfer?.files?.[0]; if (!f) return; if (f.type && f.type.startsWith('image/')) { const dataUrl = await fileToDataURL(f); insertAtCursor(editor, `\n![${f.name}](${dataUrl})\n`); render(); persist(); } else { const text = await f.text(); editor.value = text; render(); persist(); } });
  editor.addEventListener('paste', async (e) => { const items = e.clipboardData?.items; if (!items) return; for (const it of items) { if (it.kind === 'file') { const file = it.getAsFile(); if (file && file.type.startsWith('image/')) { e.preventDefault(); const dataUrl = await fileToDataURL(file); insertAtCursor(editor, `\n![${file.name || 'image'}](${dataUrl})\n`); render(); persist(); return; } } } });

  // Export markdown
  btnExport.addEventListener('click', () => { const blob = new Blob([editor.value || ''], { type: 'text/markdown' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); const suggested = (editor.value.match(/^#\s*(.+)$/m)?.[1] || 'untitled').trim().replace(/\s+/g, '_'); a.download = `${suggested}.md`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0); });

  // Export HTML (single file)
  btnExportHtml?.addEventListener('click', () => { const title = (editor.value.match(/^#\s*(.+)$/m)?.[1] || 'Document').trim(); const html = `<!doctype html><html lang=\"zh-CN\"><meta charset=\"utf-8\"/><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"/><title>${title}</title><style>body{font:16px/1.8 -apple-system,BlinkMacSystemFont,'SF Pro Text','SF Pro Display',Segoe UI,Roboto,Helvetica,Arial,sans-serif;margin:0;padding:24px;color:#111}.content{max-width:900px;margin:0 auto}pre{background:#0b1220;color:#e6eefb;border:1px solid #16233a;padding:12px;border-radius:10px;overflow:auto}code{background:#f4f7ff;padding:2px 6px;border-radius:6px}blockquote{border-left:3px solid #305188;margin:12px 0;padding-left:12px;color:#334}a{color:#0a84ff;text-decoration:none}a:hover{text-decoration:underline}img{max-width:100%;}table{width:100%;border-collapse:collapse;margin:12px 0}th,td{border:1px solid #d0d6e1;padding:8px 10px;text-align:left}thead th{background:#ecf3ff}</style><div class=\"content\">${preview.innerHTML}</div></html>`; const blob = new Blob([html], { type: 'text/html' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${title.replace(/\s+/g,'_')}.html`; document.body.appendChild(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(a.href); a.remove();},0); });

  // Export PDF via print (no watermark)
  btnExportPdf?.addEventListener('click', () => { window.print(); });

  // Copy to clipboard
  btnCopy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(editor.value || ''); toast('已复制到剪贴板'); } catch { toast('复制失败，请手动 Ctrl/Cmd+C'); } });

  // Swap sides
  btnSwap.addEventListener('click', () => { const reversed = split.style.flexDirection === 'row-reverse'; split.style.flexDirection = reversed ? 'row' : 'row-reverse'; });

  // Reader mode
  async function enterFullscreen() { try { await document.documentElement.requestFullscreen?.(); } catch {} }
  async function exitFullscreen() { try { await document.exitFullscreen?.(); } catch {} }
  function toggleReader() { const on = document.body.classList.toggle('reader'); if (on) { enterFullscreen(); toast('已进入阅读模式（Esc 或再点按钮退出）'); } else { exitFullscreen(); } }
  btnReader?.addEventListener('click', toggleReader);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.body.classList.contains('reader')) { document.body.classList.remove('reader'); exitFullscreen(); } if ((e.key === 'f' || e.key === 'F') && e.shiftKey) { toggleReader(); } });

  // Resizable splitter
  let dragging = false;
  splitter?.addEventListener('pointerdown', (e) => { if (window.matchMedia('(max-width: 900px)').matches) return; dragging = true; document.body.classList.add('resizing'); splitter.setPointerCapture(e.pointerId); });
  splitter?.addEventListener('pointermove', (e) => { if (!dragging) return; const rect = split.getBoundingClientRect(); const x = e.clientX - rect.left; let r = x / rect.width; r = Math.min(2/3, Math.max(1/3, r)); applySplit(r); });
  const endDrag = (e) => { if (!dragging) return; dragging = false; document.body.classList.remove('resizing'); const leftPct = parseFloat(editorPane.style.flexBasis) / 100; const clamped = Math.min(2/3, Math.max(1/3, leftPct || 0.5)); localStorage.setItem(SPLIT_KEY, String(clamped)); try { splitter.releasePointerCapture(e.pointerId); } catch {} }; splitter?.addEventListener('pointerup', endDrag); splitter?.addEventListener('pointercancel', endDrag);

  // Task list toggle
  preview.addEventListener('change', (e) => { const t = e.target; if (!(t instanceof HTMLInputElement) || t.type !== 'checkbox') return; const li = t.closest('li'); if (!li) return; const label = (li.textContent || '').trim(); const src = editor.value; const unchecked = new RegExp(`(^|\n)[\t\s]*[-*+] \[ \] ${escapeRegExp(label)}(\n|$)`); const checked = new RegExp(`(^|\n)[\t\s]*[-*+] \[x\] ${escapeRegExp(label)}(\n|$)`, 'i'); let next = src; if (t.checked) { if (unchecked.test(src)) next = src.replace(unchecked, (m, p1, p2) => `${p1}- [x] ${label}${p2}`); } else { if (checked.test(src)) next = src.replace(checked, (m, p1, p2) => `${p1}- [ ] ${label}${p2}`); } if (next !== src) { editor.value = next; render(); persist(); } });

  // Utils
  function toast(msg) { const el = document.createElement('div'); el.textContent = msg; el.className = 'toast'; document.body.appendChild(el); setTimeout(() => el.classList.add('show')); setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 200); }, 1600); }
})();
