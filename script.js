(() => {
  const editor = document.getElementById('editor');
  const preview = document.getElementById('preview');
  const fileInput = document.getElementById('file-input');
  const btnExport = document.getElementById('btn-export');
  const btnCopy = document.getElementById('btn-copy');
  const btnSwap = document.getElementById('btn-swap');
  const btnClear = document.getElementById('btn-clear');
  const split = document.getElementById('split');

  // Configure marked for reasonably safe rendering
  marked.setOptions({
    breaks: true,
    gfm: true,
    smartLists: true,
    smartypants: false,
  });

  const STORAGE_KEY = 'markdown_editor_content_v1';

  // Load from localStorage
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) editor.value = saved;

  function render() {
    try {
      const raw = editor.value || '';
      const html = marked.parse(raw);
      const clean = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
      preview.innerHTML = clean;
    } catch (e) {
      preview.innerHTML = `<pre style="color:#ffb4b4">渲染错误: ${e.message}</pre>`;
    }
  }

  function persist() {
    localStorage.setItem(STORAGE_KEY, editor.value || '');
  }

  // Initial render
  render();

  // Live preview
  editor.addEventListener('input', () => { render(); persist(); });

  // Import file
  fileInput.addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const text = await f.text();
    editor.value = text;
    render();
    persist();
    fileInput.value = '';
  });

  // Drag and drop import
  document.addEventListener('dragover', (e) => { e.preventDefault(); });
  document.addEventListener('drop', async (e) => {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0];
    if (!f) return;
    const text = await f.text();
    editor.value = text;
    render();
    persist();
  });

  // Export markdown
  btnExport.addEventListener('click', () => {
    const blob = new Blob([editor.value || ''], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const suggested = (editor.value.match(/^#\s*(.+)$/m)?.[1] || 'untitled').trim().replace(/\s+/g, '_');
    a.download = `${suggested}.md`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 0);
  });

  // Copy to clipboard
  btnCopy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(editor.value || '');
      toast('已复制到剪贴板');
    } catch (e) {
      toast('复制失败，请手动 Ctrl/Cmd+C');
    }
  });

  // Swap editor and preview sides
  btnSwap.addEventListener('click', () => {
    const reversed = split.style.flexDirection === 'row-reverse';
    split.style.flexDirection = reversed ? 'row' : 'row-reverse';
  });

  // Clear content
  btnClear.addEventListener('click', () => {
    if (!editor.value) return;
    if (confirm('确定清空当前内容吗？该操作不可撤销。')) {
      editor.value = '';
      render();
      persist();
    }
  });

  // Simple toast
  function toast(msg) {
    const el = document.createElement('div');
    el.textContent = msg;
    el.className = 'toast';
    document.body.appendChild(el);
    setTimeout(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 200);
    }, 1600);
  }
})();
