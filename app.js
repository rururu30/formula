(() => {
  const app = document.getElementById("app");
  const connection = window.FORMULA_SUPABASE_CONFIG || {};
  const state = {
    formulas: [],
    page: "home",
    search: "",
    selectedTags: [],
    cardTags: [],
    cardIndex: 0,
    flipped: false,
    editingId: null,
    editorTags: [],
    tagDraft: "",
    authReady: false,
    authConfigured: false,
    authError: "",
    session: null,
    supabaseClient: null,
    dataReady: false,
    dataLoading: false,
    dataError: ""
  };

  function escapeHtml(value = "") {
    return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  }

  function normalizeTag(value) {
    return String(value).normalize("NFC").trim().replace(/\s+/g, " ");
  }

  function allTags() {
    return [...new Set(state.formulas.flatMap((formula) => formula.tags || []).map(normalizeTag).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ja"));
  }

  function byId(id) { return state.formulas.find((formula) => formula.id === id); }

  function initialsFor(formula) {
    const source = formula.name.replace(/[「」『』（）()]/g, "");
    return source.length > 1 ? source.slice(0, 1) : "∑";
  }

  function dateLabel(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "short", day: "numeric" }).format(date);
  }

  function tagsHtml(tags = []) {
    return tags.map((tag) => `<span class="tag-mini">${escapeHtml(tag)}</span>`).join("");
  }

  function filteredFormulas(tags = state.selectedTags) {
    const needle = state.search.trim().toLocaleLowerCase("ja");
    return state.formulas.filter((formula) => {
      const textMatch = !needle || `${formula.name} ${formula.content}`.toLocaleLowerCase("ja").includes(needle);
      const tagMatch = tags.every((tag) => (formula.tags || []).includes(tag));
      return textMatch && tagMatch;
    }).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  }

  function withTagFilters(selected, callbackName) {
    const tags = allTags();
    if (!tags.length) return "";
    return `<div class="filter-area"><span class="filter-caption">タグ</span>${tags.map((tag) => `<button class="tag-filter ${selected.includes(tag) ? "selected" : ""}" data-action="${callbackName}" data-tag="${escapeHtml(tag)}" type="button"><span class="check">${selected.includes(tag) ? "✓" : "+"}</span>${escapeHtml(tag)}</button>`).join("")}${selected.length ? `<button class="text-link" data-action="clear-${callbackName}">解除</button>` : ""}</div>`;
  }

  function shell(content, active = "home") {
    return `<header class="topbar"><div class="topbar-inner">
      <button class="brand" data-action="go" data-page="home" aria-label="ホームへ">
        <span class="brand-mark">∑</span><span><span class="brand-name">FORMULA</span><span class="brand-caption">公式を、自分のものに。</span></span>
      </button>
      <nav class="top-nav" aria-label="メインメニュー">${navItems(active)}</nav>
      <div class="top-actions"><span class="demo-pill" title="ログイン中">${escapeHtml(state.session?.user?.email || "SIGNED IN")}</span><button class="icon-button" data-action="logout" title="ログアウト" aria-label="ログアウト">↗</button></div>
    </div></header>
    <main class="page-shell">${content}</main>
    <nav class="bottom-nav" aria-label="メインメニュー">${navItems(active)}</nav>
    <div class="toast" role="status" aria-live="polite"></div>`;
  }

  function navItems(active) {
    return [
      ["home", "⌂", "ホーム"],
      ["list", "▤", "公式一覧"],
      ["cards", "▱", "単語帳"]
    ].map(([page, icon, label]) => `<button class="nav-link ${active === page ? "active" : ""}" data-action="go" data-page="${page}" type="button"><span class="nav-icon">${icon}</span>${label}</button>`).join("");
  }

  function homeView() {
    const recent = [...state.formulas].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 3);
    const tagCount = allTags().length;
    const formulaCount = String(state.formulas.length).padStart(2, "0");
    return shell(`<section class="hero">
      <div class="hero-content"><p class="page-eyebrow"><span class="eyebrow-line"></span>YOUR PERSONAL FORMULA BOOK</p>
      <h1>公式を、<br /><em>自分のものに。</em></h1>
      <p class="hero-copy">公式を集めて、意味をつかんで、何度でも思い出す。<br />自分のペースで育てる、数学のための小さなノート。</p>
      <div class="hero-actions"><button class="btn btn-primary" data-action="go" data-page="list"><span>公式一覧を見る</span><span>↗</span></button><button class="btn btn-secondary" data-action="go" data-page="cards"><span>カードで復習</span><span>→</span></button></div></div>
      <div class="hero-art" aria-hidden="true"><span class="hero-equation">x² + y²</span></div>
    </section>
    <section class="home-grid">
      <div class="panel"><div class="panel-title-row"><h2>最近の公式</h2><button class="text-link" data-action="go" data-page="list">すべて見る　→</button></div>
        <div class="recent-list">${recent.length ? recent.map((formula) => `<div class="recent-item" data-action="detail" data-id="${escapeHtml(formula.id)}"><span class="item-symbol">${escapeHtml(initialsFor(formula))}</span><div class="item-main"><div class="item-title">${escapeHtml(formula.name)}</div><div class="item-meta">${tagsHtml(formula.tags || [])}</div></div><span class="item-arrow">›</span></div>`).join("") : emptyRecent()}</div>
      </div>
      <div class="panel stat-wrap"><div class="stat-highlight"><div class="stat-number">${formulaCount}</div><div class="stat-caption">登録している公式</div></div><div class="stat-rule"></div><div class="stat-foot"><span>使っているタグ</span><span>${tagCount} 個</span></div><div class="stat-foot" style="margin-top:13px"><span>次の一枚をめくろう</span><button class="text-link" data-action="go" data-page="cards">復習する →</button></div></div>
    </section>`, "home");
  }

  function emptyRecent() {
    return `<div class="recent-item"><span class="item-symbol">＋</span><div class="item-main"><div class="item-title">まだ公式がありません</div><div class="item-meta">最初の一件を追加しましょう</div></div></div>`;
  }

  function listView() {
    const formulas = filteredFormulas();
    const rows = formulas.map((formula) => `<article class="formula-row" data-action="detail" data-id="${escapeHtml(formula.id)}" tabindex="0" role="button" aria-label="${escapeHtml(formula.name)}の詳細">
      <span class="item-symbol">${escapeHtml(initialsFor(formula))}</span><div class="row-content"><div class="row-title">${escapeHtml(formula.name)}</div><div class="row-preview">${escapeHtml(formula.content.replace(/\\\[|\\\]|\\\(|\\\)/g, ""))}</div><div class="row-tags">${tagsHtml(formula.tags || [])}</div></div><div class="row-actions"><button class="btn btn-quiet btn-small" data-action="detail" data-id="${escapeHtml(formula.id)}" type="button">詳細を見る　→</button></div>
    </article>`).join("");
    return shell(`<div class="section-head"><div><p class="page-eyebrow"><span class="eyebrow-line"></span>LIBRARY</p><h1>公式一覧</h1></div><button class="btn btn-primary" data-action="new"><span class="plus">＋</span>公式を追加</button></div>
      <section class="list-toolbar"><label class="searchbox"><span>⌕</span><input type="search" name="search" placeholder="公式名・公式の内容から探す" value="${escapeHtml(state.search)}" autocomplete="off" /></label>${withTagFilters(state.selectedTags, "list-tag")}</section>
      ${formulas.length ? `<section class="formula-list" aria-label="公式一覧">${rows}</section>` : `<section class="empty-state"><div class="empty-mark">${state.formulas.length ? "⌕" : "∑"}</div><h2>${state.formulas.length ? "見つかりませんでした" : "最初の公式を追加しましょう"}</h2><p>${state.formulas.length ? "検索語やタグを変えると、公式が見つかるかもしれません。" : "公式名・内容・説明を登録すると、ここから整理して復習できます。"}</p>${state.formulas.length ? `<button class="btn btn-secondary" data-action="reset-filters">検索とタグを解除</button>` : `<button class="btn btn-primary" data-action="new">公式を追加</button>`}</section>`}`, "list");
  }

  function extractLatexBlocks(value) {
    const source = String(value || "");
    const pattern = /\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)|\$\$[\s\S]*?\$\$|\\begin\{(equation\*?|align\*?|alignat\*?|gather\*?|CD)\}[\s\S]*?\\end\{\1\}/g;
    return [...source.matchAll(pattern)].map((match) => {
      const raw = match[0];
      if (raw.startsWith("$$")) return { source: raw, tex: raw.slice(2, -2), display: true };
      if (raw.startsWith("\\[")) return { source: raw, tex: raw.slice(2, -2), display: true };
      if (raw.startsWith("\\(")) return { source: raw, tex: raw.slice(2, -2), display: false };
      return { source: raw, tex: raw, display: true };
    });
  }

  function extractLatexExpressions(value) {
    return extractLatexBlocks(value).map((block) => block.source).join("\n");
  }

  function renderMathPreview(value, target) {
    const blocks = extractLatexBlocks(value);
    target.replaceChildren();
    if (!blocks.length) {
      target.textContent = String(value || "").trim()
        ? "LaTeX数式を入力してください。通常の説明文は説明欄に入力します。"
        : "LaTeX数式を入力するとここに表示されます";
      return;
    }
    if (!window.katex?.render) {
      target.textContent = "KaTeXを読み込めませんでした。インターネット接続を確認して再読み込みしてください。";
      return;
    }
    for (const block of blocks) {
      const output = document.createElement("div");
      output.className = "math-preview-expression";
      target.appendChild(output);
      try {
        window.katex.render(block.tex, output, {
          displayMode: block.display,
          throwOnError: false,
          trust: false,
          strict: "warn"
        });
      } catch (error) {
        output.textContent = `数式を描画できませんでした: ${error.message || "LaTeXを確認してください"}`;
        output.classList.add("math-preview-error");
      }
    }
  }

  function formulaContentForDisplay(value) {
    return extractLatexExpressions(value);
  }

  function detailView(id) {
    const formula = byId(id);
    if (!formula) return listView();
    return shell(`<section class="detail-card"><div class="detail-top"><button class="back-link" data-action="go" data-page="list">←　公式一覧へ戻る</button><div class="detail-actions"><button class="btn btn-secondary btn-small" data-action="edit" data-id="${escapeHtml(formula.id)}">編集</button><button class="btn btn-danger btn-small" data-action="delete" data-id="${escapeHtml(formula.id)}">削除</button></div></div>
      <div class="detail-body"><p class="page-eyebrow"><span class="eyebrow-line"></span>FORMULA DETAIL</p><h1 class="detail-title">${escapeHtml(formula.name)}</h1><div class="detail-tags">${tagsHtml(formula.tags || [])}</div>
        <div class="content-block"><div class="content-label">公式の内容</div><div class="math-panel math-content">${escapeHtml(formulaContentForDisplay(formula.content)).replace(/\n/g, "<br>")}</div></div>
        <div class="content-block"><div class="content-label">説明</div><p class="explanation">${escapeHtml(formula.explanation)}</p></div>
      </div><footer class="detail-footer"><span>追加　${dateLabel(formula.createdAt)}</span><span>更新　${dateLabel(formula.updatedAt)}</span></footer></section>`, "list");
  }

  const latexInsertGroups = [
    { label: "数と式・関数", items: [
      ["log", "\\log{}"], ["自然対数 ln", "\\ln{}"], ["指数 e^x", "e^{}"], ["絶対値", "\\left| \\right|"],
      ["不等号 ≤", "\\leq"], ["不等号 ≥", "\\geq"], ["≠", "\\neq"], ["近似 ≈", "\\approx"], ["比例 ∝", "\\propto"],
      ["場合分け", "\\begin{cases} \\end{cases}"], ["二項定理", "\\binom{n}{r}"]
    ]},
    { label: "三角比・三角関数", items: [
      ["sin", "\\sin{}"], ["cos", "\\cos{}"], ["tan", "\\tan{}"], ["逆三角関数 arcsin", "\\arcsin{}"],
      ["角度 °", "^\\circ"], ["ラジアン π", "\\pi"], ["三角関数の恒等式", "\\sin^2{} + \\cos^2{} = 1"]
    ]},
    { label: "集合・論理", items: [
      ["属する ∈", "\\in"], ["逆に含まれる ∋", "\\ni"], ["属さない ∉", "\\notin"], ["含む ⊃", "\\supset"], ["部分集合 ⊂", "\\subset"],
      ["部分集合 ⊆", "\\subseteq"], ["上位集合 ⊇", "\\supseteq"], ["和集合 ∪", "\\cup"], ["共通部分 ∩", "\\cap"],
      ["空集合 ∅", "\\emptyset"], ["全て ∀", "\\forall"], ["存在 ∃", "\\exists"], ["かつ ∧", "\\land"], ["または ∨", "\\lor"]
    ]},
    { label: "図形・ベクトル", items: [
      ["平行 ∥", "\\parallel"], ["垂直 ⊥", "\\perp"], ["角 ∠", "\\angle"], ["三角形 △", "\\triangle"],
      ["ベクトル", "\\vec{}"], ["ベクトル AB", "\\overrightarrow{AB}"], ["内積 ·", "\\cdot"], ["外積 ×", "\\times"],
      ["長さ・ノルム", "\\left\\| \right\\|"], ["円の方程式", "(x-a)^2 + (y-b)^2 = r^2"], ["距離", "\\sqrt{(x_2-x_1)^2+(y_2-y_1)^2}"]
    ]},
    { label: "ギリシャ文字", items: [
      ["α alpha", "\\alpha"], ["β beta", "\\beta"], ["γ gamma", "\\gamma"], ["θ theta", "\\theta"],
      ["Δ delta", "\\Delta"], ["ε epsilon", "\\epsilon"], ["λ lambda", "\\lambda"], ["μ mu", "\\mu"],
      ["σ sigma", "\\sigma"], ["φ phi", "\\phi"], ["ω omega", "\\omega"]
    ]},
    { label: "数列・総和", items: [
      ["総和 Σ", "\\sum_{k=1}^{n}{}"], ["総乗 Π", "\\prod_{k=1}^{n}{}"], ["数列 a_n", "a_{}"],
      ["無限数列", "\\{a_n\\}_{n=1}^{\\infty}"], ["階乗 n!", "n!"], ["組合せ nCr", "\\binom{n}{r}"],
      ["順列 nPr", "{}_n\\mathrm{P}_r"]
    ]},
    { label: "微分・積分・極限", items: [
      ["微分 d/dx", "\\frac{d}{dx}{}"], ["導関数 dy/dx", "\\frac{dy}{dx}"], ["2階微分", "\\frac{d^2 y}{dx^2}"],
      ["偏微分", "\\frac{\\partial}{\\partial x}{}"], ["不定積分 ∫", "\\int {} \\, dx"], ["定積分", "\\int_{a}^{b}{} \\, dx"],
      ["極限 x→a", "\\lim_{x \\to a}{}"], ["極限 x→∞", "\\lim_{x \\to \\infty}{}"], ["無限大 ∞", "\\infty"]
    ]},
    { label: "確率・統計", items: [
      ["確率 P(A)", "P(A)"], ["条件付き確率", "P(A\\mid B)"], ["期待値 E(X)", "E(X)"], ["分散 V(X)", "V(X)"],
      ["標準偏差 σ", "\\sigma"], ["平均 x̄", "\\bar{x}"], ["標準化", "\\frac{X-\\mu}{\\sigma}"], ["正規分布", "N(\\mu,\\sigma^2)"],
      ["相関係数 r", "r_{xy}"]
    ]},
    { label: "複素数・行列", items: [
      ["虚数単位 i", "i"], ["複素数 z=a+bi", "z=a+bi"], ["複素共役", "\\overline{z}"], ["絶対値 |z|", "|z|"],
      ["実部 Re", "\\operatorname{Re}(z)"], ["虚部 Im", "\\operatorname{Im}(z)"], ["行列", "\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}"]
    ]}
  ];

  const commonLatexInserts = [
    ["数式枠", "\\[  \\]"], ["分数", "\\frac{}{}"], ["平方根", "\\sqrt{}"], ["累乗", "^{}"], ["添字", "_{}"],
    ["±", "\\pm"], ["sin", "\\sin{}"], ["cos", "\\cos{}"], ["tan", "\\tan{}"], ["log", "\\log{}"]
  ];

  function latexInsertControls() {
    const common = commonLatexInserts.map(([label, snippet]) => `<button class="tag-filter" type="button" data-action="insert-latex" data-snippet="${escapeHtml(snippet)}">${escapeHtml(label)}</button>`).join("");
    const groups = latexInsertGroups.map((group) => `<optgroup label="${escapeHtml(group.label)}">${group.items.map(([label, snippet]) => `<option value="${escapeHtml(snippet)}">${escapeHtml(label)}</option>`).join("")}</optgroup>`).join("");
    return `<div class="latex-insert-tools"><div class="latex-common"><span class="filter-caption">よく使う記号</span><div class="latex-common-buttons">${common}</div></div><label class="latex-select-label">その他の記号<select data-action="insert-latex-select"><option value="">種類から選ぶ…</option>${groups}</select></label></div>`;
  }

  function insertLatexSnippet(snippet) {
    const input = document.getElementById("formula-content");
    if (!input || !snippet) return;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    input.setRangeText(snippet, start, end, "end");
    const firstEmpty = snippet.indexOf("{}");
    const frameSpace = snippet.indexOf("  ");
    const caret = start + (firstEmpty >= 0 ? firstEmpty + 1 : frameSpace >= 0 ? frameSpace + 1 : snippet.length);
    input.focus();
    input.setSelectionRange(caret, caret);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function editorView(id) {
    const formula = id ? byId(id) : null;
    if (id && !formula) return listView();
    state.editingId = id || null;
    const draft = readEditorDraft(id || null);
    state.editorTags = draft?.tags || (formula ? [...(formula.tags || [])] : []);
    const suggestions = allTags().filter((tag) => !state.editorTags.includes(tag));
    return shell(`<div class="section-head"><div><p class="page-eyebrow"><span class="eyebrow-line"></span>${formula ? "EDIT ENTRY" : "NEW ENTRY"}</p><h1>${formula ? "公式を編集" : "公式を追加"}</h1><p class="subhead">あとから見返したとき、思い出せる形で残そう。</p></div></div>
      <form class="editor-card" id="formula-form"><div class="form-grid">
        <div class="field"><label for="formula-name">公式名 <span class="required">必須</span></label><input id="formula-name" name="name" required maxlength="120" placeholder="例：三平方の定理" value="${escapeHtml(draft?.name ?? formula?.name ?? "")}" /></div>
        <div class="field"><label for="formula-content">公式の内容 <span class="required">必須</span></label><textarea class="content-input" id="formula-content" name="content" required maxlength="5000" placeholder="例：\\[x^2 + y^2 = r^2\\]">${escapeHtml(draft?.content ?? formula?.content ?? "")}</textarea>
          <div class="latex-insert">${latexInsertControls()}</div>
          <div class="preview-label" style="margin-top:13px">数式プレビュー</div><div class="preview-box math-preview" id="math-preview">LaTeX数式を入力するとここに表示されます</div></div>
        <div class="field"><label for="formula-explanation">説明 <span class="required">必須</span></label><textarea id="formula-explanation" name="explanation" required maxlength="5000" placeholder="この公式が何を表し、どんなときに使えるかを書きます。">${escapeHtml(draft?.explanation ?? formula?.explanation ?? "")}</textarea></div>
        <div class="field"><label for="tag-draft">タグ <span class="required" style="color:#98a0af">任意・複数可</span></label><div class="tag-input-row"><textarea id="tag-draft" name="tagDraft" rows="1" maxlength="80" placeholder="例：図形、三角比">${escapeHtml(draft?.tagDraft || "")}</textarea><button class="btn btn-secondary btn-small" data-action="add-tag" type="button">追加</button></div><div class="selected-tags" id="selected-tags">${selectedTagsHtml()}</div>${suggestions.length ? `<div class="tag-suggestions"><span class="filter-caption">よく使うタグ</span>${suggestions.slice(0, 6).map((tag) => `<button class="tag-filter" data-action="suggest-tag" data-tag="${escapeHtml(tag)}" type="button">＋ ${escapeHtml(tag)}</button>`).join("")}</div>` : ""}<p class="field-hint">Enterを2回、または「追加」ボタンで登録できます。タグは一覧と単語帳の絞り込みに使います。</p></div>
      </div><div class="form-footer"><button class="btn btn-quiet" data-action="cancel-editor" type="button">キャンセル</button><div class="form-footer-right"><button class="btn btn-secondary" data-action="preview-card" type="button">単語帳を確認</button><button class="btn btn-primary" type="submit">${formula ? "変更を保存" : "公式を保存"}<span>→</span></button></div></div></form>`, "list");
  }

  function selectedTagsHtml() {
    return state.editorTags.map((tag) => `<span class="removable-tag">${escapeHtml(tag)}<button type="button" data-action="remove-editor-tag" data-tag="${escapeHtml(tag)}" aria-label="${escapeHtml(tag)}を削除">×</button></span>`).join("");
  }

  function editorDraftKey(id = state.editingId) {
    const userId = state.session?.user?.id;
    return userId ? `formula-editor-draft:${userId}:${id || "new"}` : null;
  }

  function readEditorDraft(id = state.editingId) {
    const key = editorDraftKey(id);
    if (!key) return null;
    try { return JSON.parse(localStorage.getItem(key) || "null"); }
    catch { return null; }
  }

  function saveEditorDraft() {
    const form = document.getElementById("formula-form");
    const key = editorDraftKey();
    if (!form || !key) return;
    try {
      localStorage.setItem(key, JSON.stringify({
        name: form.elements.name.value,
        content: form.elements.content.value,
        explanation: form.elements.explanation.value,
        tagDraft: form.elements.tagDraft.value,
        tags: [...state.editorTags]
      }));
    } catch { /* Keep editing usable when browser storage is unavailable. */ }
  }

  function clearEditorDraft(id = state.editingId) {
    const key = editorDraftKey(id);
    if (!key) return;
    try { localStorage.removeItem(key); } catch { /* Ignore unavailable browser storage. */ }
  }

  function cardFormulas() {
    return state.formulas.filter((formula) => state.cardTags.every((tag) => (formula.tags || []).includes(tag))).sort((a, b) => a.name.localeCompare(b.name, "ja"));
  }

  function cardsView() {
    const cards = cardFormulas();
    if (state.cardIndex >= cards.length) state.cardIndex = Math.max(0, cards.length - 1);
    const formula = cards[state.cardIndex];
    const content = formula ? `<div class="cards-wrap"><div class="cards-filter"><div><span class="section-label">今日の復習</span><div class="filter-caption">${cards.length}枚のカード</div></div>${withTagFilters(state.cardTags, "card-tag")}</div>
      <button class="study-card ${state.flipped ? "flipped" : ""}" data-action="flip" type="button" aria-label="カードを${state.flipped ? "表" : "裏"}返す"><span class="card-inner">
        <span class="card-face card-front"><span class="card-index">FORMULA　${String(state.cardIndex + 1).padStart(2, "0")}</span><span class="card-stamp">∑</span><h2>${escapeHtml(formula.name)}</h2><span class="flip-hint"><span>↻</span>タップ／クリックして答えを見る</span></span>
        <span class="card-face card-back"><span class="card-index">ANSWER　${String(state.cardIndex + 1).padStart(2, "0")}</span><span class="content-label">公式の内容</span><span class="math-panel math-content">${escapeHtml(formulaContentForDisplay(formula.content)).replace(/\n/g, "<br>")}</span><span class="content-label" style="margin-top:21px">説明</span><span class="explanation">${escapeHtml(formula.explanation)}</span></span>
      </span></button><div class="study-controls"><button class="btn btn-secondary" data-action="prev-card" type="button" ${state.cardIndex === 0 ? "disabled" : ""}>←　前へ</button><div class="progress-info">${state.cardIndex + 1} / ${cards.length}<div class="progress-track"><div class="progress-value" style="width:${((state.cardIndex + 1) / cards.length) * 100}%"></div></div></div><button class="btn btn-secondary" data-action="next-card" type="button" ${state.cardIndex >= cards.length - 1 ? "disabled" : ""}>次へ　→</button></div><p class="keyboard-hint">カードを押すと表と裏が切り替わります</p></div>` : `<section class="empty-state"><div class="empty-mark">▱</div><h2>${state.formulas.length ? "このタグのカードはありません" : "単語帳はまだ空です"}</h2><p>${state.formulas.length ? "選んだタグを解除するか、公式一覧からカードを追加してください。" : "公式を追加すると、すべての公式が自動でカードになります。"}</p>${state.formulas.length ? `<button class="btn btn-secondary" data-action="clear-card-tag">タグを解除</button>` : `<button class="btn btn-primary" data-action="new">最初の公式を追加</button>`}</section>`;
    return shell(`<div class="section-head"><div><p class="page-eyebrow"><span class="eyebrow-line"></span>FLASH CARDS</p><h1>単語帳</h1></div><button class="btn btn-secondary" data-action="go" data-page="list">公式一覧　→</button></div>${content}`, "cards");
  }

  function loginView() {
    const setupNote = state.authConfigured
      ? "このサイトでは新規登録を受け付けていません。Supabaseプロジェクトに登録済みのメールアドレスでログインしてください。"
      : "Supabaseプロジェクトがまだ接続されていません。プロジェクトを作成後、supabase-config.jsにProject URLとPublishable keyを設定してください。";
    const message = state.authError ? `<p class="auth-message" role="alert">${escapeHtml(state.authError)}</p>` : "";
    const disabled = state.authConfigured ? "" : "disabled";
    return `<main class="login-screen"><section class="login-card"><div class="brand"><span class="brand-mark">∑</span><span><span class="brand-name">FORMULA</span><span class="brand-caption">公式を、自分のものに。</span></span></div><p class="page-eyebrow"><span class="eyebrow-line"></span>WELCOME BACK</p><h1>おかえりなさい。</h1><p class="login-note">あなたの公式ノートにログインします。</p><form class="login-form" id="login-form"><div class="field"><label for="login-email">メールアドレス</label><input type="email" id="login-email" required placeholder="you@example.com" autocomplete="username" ${disabled} /></div><div class="field"><label for="login-password">パスワード</label><input type="password" id="login-password" required placeholder="パスワード" autocomplete="current-password" ${disabled} /></div>${message}<button class="btn btn-primary" type="submit" ${disabled}>ログイン　→</button></form><div class="prototype-note">${setupNote}</div></section></main>`;
  }

  function loadingView() {
    return `<main class="login-screen"><section class="login-card auth-loading"><span class="brand-mark">∑</span><p class="login-note">ログイン状態を確認しています…</p></section></main>`;
  }

  function dataLoadingView() {
    return `<main class="login-screen"><section class="login-card auth-loading"><span class="brand-mark">∑</span><p class="login-note">公式を読み込んでいます…</p></section></main>`;
  }

  function dataErrorView() {
    return `<main class="login-screen"><section class="login-card"><div class="brand"><span class="brand-mark">∑</span><span><span class="brand-name">FORMULA</span><span class="brand-caption">公式を、自分のものに。</span></span></div><p class="page-eyebrow"><span class="eyebrow-line"></span>DATA CONNECTION</p><h1>公式を読み込めません。</h1><p class="login-note">Supabaseのテーブル、Data API権限、RLS設定を確認してください。</p><p class="auth-message" role="alert">${escapeHtml(state.dataError)}</p><div class="form-footer-right" style="margin-top:20px"><button class="btn btn-secondary" data-action="logout">ログアウト</button><button class="btn btn-primary" data-action="retry-data">再読み込み　↻</button></div></section></main>`;
  }

  function fromDatabase(row) {
    return {
      id: row.id,
      name: row.name,
      content: row.content,
      explanation: row.explanation,
      tags: Array.isArray(row.tags) ? row.tags : [],
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  function renderMath(scope = app) {
    if (typeof window.renderMathInElement !== "function") return;
    scope.querySelectorAll(".math-content, .explanation").forEach((node) => {
      const source = node.dataset.mathSource;
      if (source) node.textContent = source;
      window.renderMathInElement(node, { throwOnError: false, trust: false, strict: "warn" });
    });
  }

  function render() {
    if (!state.authReady) { app.innerHTML = loadingView(); return; }
    if (!state.authConfigured) { app.innerHTML = loginView(); return; }
    const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
    const [route, id] = parts;
    const page = route || state.page || "home";
    if (!state.session) { app.innerHTML = loginView(); return; }
    if (page === "login") { navigate("home"); return; }
    if (state.dataLoading || !state.dataReady) { app.innerHTML = dataLoadingView(); return; }
    if (state.dataError) { app.innerHTML = dataErrorView(); return; }
    let html;
    if (page === "list") html = listView();
    else if (page === "detail") html = detailView(id);
    else if (page === "editor") html = editorView(id === "new" ? null : id);
    else if (page === "cards") html = cardsView();
    else html = homeView();
    app.innerHTML = html;
    state.page = page;
    renderMath();
    const formulaContent = app.querySelector("#formula-content");
    const mathPreview = app.querySelector("#math-preview");
    if (formulaContent && mathPreview) renderMathPreview(formulaContent.value, mathPreview);
  }

  function navigate(hash) {
    if (location.hash === `#${hash}`) render();
    else location.hash = hash;
  }

  function toast(message) {
    const node = document.querySelector(".toast");
    if (!node) return;
    node.textContent = message;
    node.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => node.classList.remove("show"), 2200);
  }

  async function loadRemoteFormulas(userId = state.session?.user?.id) {
    if (!userId || !state.supabaseClient) return;
    state.dataLoading = true;
    state.dataReady = false;
    state.dataError = "";
    render();
    try {
      const { data, error } = await state.supabaseClient
        .from("formulas")
        .select("id,user_id,name,content,explanation,tags,created_at,updated_at")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      if (state.session?.user?.id !== userId) return;
      state.formulas = (data || []).map(fromDatabase);
      state.dataReady = true;
      state.dataLoading = false;
      state.dataError = "";
      render();
    } catch (error) {
      if (state.session?.user?.id !== userId) return;
      state.dataReady = true;
      state.dataLoading = false;
      if (["42P01", "PGRST205"].includes(error?.code)) {
        state.dataError = "public.formulasテーブルが見つかりません。S5のSQL設定をSupabaseに適用してください。";
      } else if (error?.code === "42501") {
        state.dataError = "authenticatedロールのData API権限を確認してください。テーブルのGRANTとRLSポリシーが必要です。";
      } else {
        state.dataError = "Supabaseから公式を取得できませんでした。接続設定とテーブル権限を確認してください。";
      }
      render();
    }
  }

  async function initializeSupabaseAuth() {
    const url = String(connection.url || "").trim();
    const key = String(connection.publishableKey || "").trim();
    const looksConfigured = /^https:\/\//i.test(url) && Boolean(key) && !/YOUR_PROJECT|YOUR_PUBLISHABLE_KEY/i.test(`${url} ${key}`);
    if (!looksConfigured) {
      state.authConfigured = false;
      state.authReady = true;
      render();
      return;
    }
    if (!window.supabase?.createClient) {
      state.authError = "Supabaseの読み込みに失敗しました。インターネット接続を確認してください。";
      state.authReady = true;
      render();
      return;
    }
    try {
      state.supabaseClient = window.supabase.createClient(url, key, {
        auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
      });
      state.authConfigured = true;
      const { data, error } = await state.supabaseClient.auth.getSession();
      if (error) throw error;
      state.session = data.session;
      state.authReady = true;
      state.supabaseClient.auth.onAuthStateChange((_event, session) => {
        const previousUserId = state.session?.user?.id;
        state.session = session;
        state.authReady = true;
        const route = location.hash.replace(/^#\/?/, "").split("/")[0];
        if (!session) {
          state.formulas = [];
          state.dataReady = false;
          state.dataLoading = false;
          state.dataError = "";
          if (route !== "login") navigate("login");
          else render();
          return;
        }
        if (session.user.id !== previousUserId) {
          state.formulas = [];
          state.dataReady = false;
          state.dataError = "";
          queueMicrotask(() => loadRemoteFormulas(session.user.id));
        }
        if (route === "login") navigate("home");
        else render();
      });
      if (!state.session && !location.hash.startsWith("#login")) navigate("login");
      else if (state.session) await loadRemoteFormulas(state.session.user.id);
      else render();
    } catch {
      state.authConfigured = true;
      state.authReady = true;
      state.authError = "Supabaseに接続できません。Project URLとPublishable keyを確認してください。";
      render();
    }
  }

  async function signIn(event) {
    event.preventDefault();
    if (!state.supabaseClient || !state.authConfigured) return;
    state.authError = "";
    const button = event.currentTarget.querySelector('button[type="submit"]');
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    button.disabled = true;
    button.textContent = "ログイン中…";
    let result;
    try {
      result = await state.supabaseClient.auth.signInWithPassword({ email, password });
    } catch {
      state.authError = "ログインできませんでした。メールアドレスとパスワードを確認してください。";
      render();
      return;
    }
    if (result.error) {
      state.authError = "ログインできませんでした。メールアドレスとパスワードを確認してください。";
      render();
      return;
    }
    state.session = result.data.session;
    navigate("home");
  }

  async function signOut() {
    if (!state.supabaseClient) return;
    const { error } = await state.supabaseClient.auth.signOut({ scope: "local" });
    if (error) toast("ログアウトできませんでした。もう一度お試しください。");
  }

  function addEditorTag(value) {
    const tags = String(value).split(/[、,，]/).map(normalizeTag).filter(Boolean);
    if (!tags.length) return;
    for (const tag of tags) {
      if (!state.editorTags.some((existing) => normalizeTag(existing) === tag)) state.editorTags.push(tag);
    }
    const input = document.getElementById("tag-draft");
    if (input) input.value = "";
    const container = document.getElementById("selected-tags");
    if (container) container.innerHTML = selectedTagsHtml();
    document.querySelectorAll(".tag-suggestions").forEach((node) => node.remove());
    saveEditorDraft();
  }

  async function saveFormula(event) {
    event.preventDefault();
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    const formData = new FormData(form);
    const name = String(formData.get("name") || "").trim();
    const content = String(formData.get("content") || "").trim();
    const explanation = String(formData.get("explanation") || "").trim();
    if (!name || !content || !explanation) { toast("必須項目を入力してください"); return; }
    const now = new Date().toISOString();
    const existing = state.editingId ? byId(state.editingId) : null;
    const userId = state.session?.user?.id;
    if (!userId || !state.supabaseClient) { toast("ログイン状態を確認できません。再読み込みしてください。"); return; }
    const values = {
      name, content, explanation,
      tags: [...new Set(state.editorTags.map(normalizeTag).filter(Boolean))],
      // Database columns use snake_case; PostgREST expects the exact column name.
      updated_at: now
    };
    let result;
    try {
      const query = existing
        ? state.supabaseClient.from("formulas").update(values).eq("id", existing.id).eq("user_id", userId)
        : state.supabaseClient.from("formulas").insert({ ...values, user_id: userId });
      result = await query.select("id,user_id,name,content,explanation,tags,created_at,updated_at").single();
    } catch {
      toast("Supabaseへ保存できませんでした。接続を確認してください。");
      return;
    }
    if (result.error || !result.data) {
      toast("Supabaseへ保存できませんでした。テーブルとData API権限を確認してください。");
      return;
    }
    const formula = fromDatabase(result.data);
    clearEditorDraft();
    if (existing) state.formulas = state.formulas.map((item) => item.id === existing.id ? formula : item);
    else state.formulas.unshift(formula);
    toast(existing ? "公式を更新しました" : "公式を追加しました");
    navigate(`detail/${encodeURIComponent(formula.id)}`);
  }

  async function deleteFormula(id) {
    const formula = byId(id);
    if (!formula) return;
    if (!window.confirm(`「${formula.name}」を削除しますか？\nこの操作は元に戻せません。`)) return;
    const userId = state.session?.user?.id;
    if (!userId || !state.supabaseClient) { toast("ログイン状態を確認できません。再読み込みしてください。"); return; }
    let result;
    try {
      result = await state.supabaseClient.from("formulas").delete().eq("id", id).eq("user_id", userId).select("id").single();
    } catch {
      toast("Supabaseから削除できませんでした。接続を確認してください。");
      return;
    }
    if (result.error || !result.data) {
      toast("Supabaseから削除できませんでした。テーブルとData API権限を確認してください。");
      return;
    }
    state.formulas = state.formulas.filter((item) => item.id !== id);
    toast("公式を削除しました");
    navigate("list");
  }

  app.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    event.stopPropagation();
    const { action, page, id, tag } = target.dataset;
    if (action === "go") navigate(page);
    else if (action === "retry-data") loadRemoteFormulas();
    else if (action === "detail") navigate(`detail/${encodeURIComponent(id)}`);
    else if (action === "new") navigate("editor/new");
    else if (action === "edit") navigate(`editor/${encodeURIComponent(id)}`);
    else if (action === "delete") deleteFormula(id);
    else if (action === "logout") signOut();
    else if (action === "list-tag") {
      state.selectedTags = state.selectedTags.includes(tag) ? state.selectedTags.filter((value) => value !== tag) : [...state.selectedTags, tag];
      render();
    } else if (action === "clear-list-tag" || action === "reset-filters") {
      state.selectedTags = []; state.search = ""; render();
    } else if (action === "card-tag") {
      state.cardTags = state.cardTags.includes(tag) ? state.cardTags.filter((value) => value !== tag) : [...state.cardTags, tag];
      state.cardIndex = 0; state.flipped = false; render();
    } else if (action === "clear-card-tag") {
      state.cardTags = []; state.cardIndex = 0; state.flipped = false; render();
    } else if (action === "flip") {
      state.flipped = !state.flipped; target.classList.toggle("flipped", state.flipped);
    } else if (action === "prev-card") {
      state.cardIndex = Math.max(0, state.cardIndex - 1); state.flipped = false; render();
    } else if (action === "next-card") {
      state.cardIndex = Math.min(cardFormulas().length - 1, state.cardIndex + 1); state.flipped = false; render();
    } else if (action === "add-tag") {
      const input = document.getElementById("tag-draft");
      if (input) addEditorTag(input.value);
    } else if (action === "suggest-tag") addEditorTag(tag);
    else if (action === "insert-latex") insertLatexSnippet(target.dataset.snippet || "");
    else if (action === "remove-editor-tag") {
      state.editorTags = state.editorTags.filter((value) => value !== tag);
      const container = document.getElementById("selected-tags");
      if (container) container.innerHTML = selectedTagsHtml();
      saveEditorDraft();
    } else if (action === "cancel-editor") {
      clearEditorDraft();
      navigate(state.editingId ? `detail/${encodeURIComponent(state.editingId)}` : "list");
    } else if (action === "preview-card") toast("単語帳プレビューは保存後に確認できます");
  });

  app.addEventListener("change", (event) => {
    if (event.target.matches('[data-action="insert-latex-select"]')) {
      insertLatexSnippet(event.target.value);
      event.target.value = "";
    }
  });

  app.addEventListener("submit", (event) => {
    if (event.target.id === "formula-form") saveFormula(event);
    if (event.target.id === "login-form") signIn(event);
  });

  app.addEventListener("input", (event) => {
    if (event.target.closest("#formula-form")) saveEditorDraft();
    if (event.target.name === "search") {
      const position = event.target.selectionStart;
      state.search = event.target.value;
      render();
      const search = app.querySelector('input[name="search"]');
      if (search) { search.focus(); search.setSelectionRange(position, position); }
    }
    if (event.target.id === "formula-content") {
      const preview = document.getElementById("math-preview");
      if (!preview) return;
      renderMathPreview(event.target.value, preview);
    }
  });

  app.addEventListener("keydown", (event) => {
    if (event.target.id === "tag-draft" && event.key === "Enter") {
      if (event.target.value.includes("\n")) {
        event.preventDefault();
        addEditorTag(event.target.value);
      }
    }
    if (event.target.matches(".formula-row") && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault(); navigate(`detail/${encodeURIComponent(event.target.dataset.id)}`);
    }
    if (state.page === "cards" && event.target === document.body) {
      if (event.key === "ArrowRight") { state.cardIndex = Math.min(cardFormulas().length - 1, state.cardIndex + 1); state.flipped = false; render(); }
      if (event.key === "ArrowLeft") { state.cardIndex = Math.max(0, state.cardIndex - 1); state.flipped = false; render(); }
    }
  });

  window.addEventListener("hashchange", () => { state.flipped = false; render(); });
  window.addEventListener("keydown", (event) => {
    if (location.hash.startsWith("#cards") && event.target === document.body) {
      if (event.key === "ArrowRight") { state.cardIndex = Math.min(cardFormulas().length - 1, state.cardIndex + 1); state.flipped = false; render(); }
      if (event.key === "ArrowLeft") { state.cardIndex = Math.max(0, state.cardIndex - 1); state.flipped = false; render(); }
      if (event.key === " ") { event.preventDefault(); state.flipped = !state.flipped; render(); }
    }
  });

  if (!location.hash) location.hash = "login";
  initializeSupabaseAuth();
})();
