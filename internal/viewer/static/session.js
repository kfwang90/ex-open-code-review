// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 alibaba/open-code-review Contributors

// The token breakdown table overflows its scroll wrapper on narrow screens;
// make that wrapper an arrow-key reachable region like the list-page tables.
ocrArrowScroll(document.querySelector(".token-breakdown-body"));

document.querySelectorAll('.response-text').forEach(function(el) {
    const text = el.textContent;
    const esc = function(s) {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    };
    const codeBlocks = [];
    let html = esc(text);
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, function(_, lang, code) {
        codeBlocks.push(code.replace(/^\n|\n$/g, ''));
        return '%%CODEBLOCK_' + (codeBlocks.length - 1) + '%%';
    });
    html = html
        .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/^### (.+)$/gm, '<div class="md-h3">$1</div>')
        .replace(/^## (.+)$/gm, '<div class="md-h2">$1</div>')
        .replace(/^# (.+)$/gm, '<div class="md-h1">$1</div>')
        .replace(/^[-*] (.+)$/gm, '<div class="md-li">&bull; $1</div>')
        .replace(/\n{2,}/g, '<br><br>')
        .replace(/\n/g, '<br>');
    codeBlocks.forEach(function(code, i) {
        html = html.replace('%%CODEBLOCK_' + i + '%%',
            '<pre class="code-block"><code>' + code + '</code></pre>');
    });
    el.innerHTML = html;
});

(function() {
    const filters = Array.from(document.querySelectorAll('.comment-filter-chip[data-filter-kind]'));
    const groups = Array.from(document.querySelectorAll('.comment-file-group'));
    const cards = Array.from(document.querySelectorAll('[data-comment-card]'));
    const pager = document.getElementById('comments-pagination');
    const pageNumbers = document.getElementById('comments-page-numbers');
    const emptyState = document.querySelector('[data-comment-filter-empty]');
    const hideMarkedToggle = document.querySelector('[data-hide-marked]');
    const marksCount = document.querySelector('[data-marks-count]');
    const clearAllButton = document.querySelector('[data-clear-all-marks]');
    let commentsPager;

    if (filters.length === 0 || groups.length === 0 || cards.length === 0 || !pager || !pageNumbers) {
        return;
    }

    let activeSeverity = 'all';
    let activeCategory = 'all';
    let activePath = '';

    const pathFilterRow = document.querySelector('[data-path-filter-row]');
    const pathFilterValue = document.querySelector('[data-path-filter-value]');
    const clearPathButton = document.querySelector('[data-clear-path-filter]');

    // localStorage throws when storage is unavailable (private browsing with
    // quota exceeded, storage disabled by policy); the toggle then just uses
    // its default instead of taking the whole feature down.
    function storedHideMarked() {
        try {
            return (localStorage.getItem('ocr-viewer-hide-marked') || '1') === '1';
        } catch (_) {
            return true;
        }
    }

    function storeHideMarked(value) {
        try {
            localStorage.setItem('ocr-viewer-hide-marked', value ? '1' : '0');
        } catch (_) {
            // Nothing to persist without storage; the in-page toggle still works.
        }
    }

    // Hide-marked is presentation, not data: the default (on) matches the
    // mark-and-hide workflow, and the choice persists per browser only.
    let hideMarked = hideMarkedToggle ? storedHideMarked() : false;

    function normalizePathFilter(value) {
        return (value || '').replace(/\\/g, '/').trim().toLowerCase();
    }

    function matchesFilters(card) {
        const filePath = normalizePathFilter(card.dataset.filePath);
        return (activePath === '' || filePath.indexOf(activePath) !== -1) &&
            (activeSeverity === 'all' || card.dataset.severity === activeSeverity) &&
            (activeCategory === 'all' || card.dataset.category === activeCategory);
    }

    function cardMatches(card) {
        const marked = Boolean(card.dataset.mark);
        return (!hideMarked || !marked) && matchesFilters(card);
    }

    function updateFilterState() {
        filters.forEach(function(filter) {
            const kind = filter.dataset.filterKind;
            const activeValue = kind === 'severity' ? activeSeverity : activeCategory;
            const isActive = activeValue === filter.dataset.filterValue;
            filter.classList.toggle('is-active', isActive);
            filter.setAttribute('aria-pressed', String(isActive));
        });

        if (commentsPager) {
            commentsPager.reset();
        }
    }

    function refreshComments() {
        if (commentsPager) {
            commentsPager.refresh();
        }
    }

    function setPathFilter(value) {
        activePath = normalizePathFilter(value);
        if (pathFilterRow) {
            pathFilterRow.hidden = activePath === '';
        }
        if (pathFilterValue) {
            pathFilterValue.textContent = value || '';
        }
        updateFilterState();
    }

    window.ocrSessionComments = { setPathFilter: setPathFilter };

    if (clearPathButton) {
        clearPathButton.addEventListener('click', function() {
            if (window.ocrSessionIndex) {
                window.ocrSessionIndex.apply('');
            } else {
                setPathFilter('');
            }
        });
    }

    function renderCommentState(state) {
        const visibleCards = new Set(state.visible);
        const matchingCards = new Set(state.filtered);

        groups.forEach(function(group) {
            const cards = Array.from(group.querySelectorAll('[data-comment-card]'));
            const groupMatchingCount = cards.reduce(function(count, card) {
                return count + (matchingCards.has(card) ? 1 : 0);
            }, 0);
            group.hidden = !cards.some(function(card) {
                return visibleCards.has(card);
            });
            const count = group.querySelector('[data-comment-count]');
            if (count) {
                count.textContent = groupMatchingCount + ' comment' + (groupMatchingCount === 1 ? '' : 's');
            }
        });

        // Count mark-hidden separately from filter-hidden so the toolbar
        // attributes each hidden card to its cause: "hidden" means hidden by
        // a mark, never crowded out by the severity/category filters.
        let markedCount = 0;
        let hiddenByMarks = 0;
        Array.from(document.querySelectorAll('[data-comment-card]')).forEach(function(card) {
            if (!card.dataset.mark) {
                return;
            }
            markedCount++;
            if (hideMarked && matchesFilters(card)) {
                hiddenByMarks++;
            }
        });

        if (emptyState) {
            emptyState.hidden = state.visible.length !== 0;
            const emptyText = state.filtered.length === 0 && hiddenByMarks > 0
                ? 'All matching comments are hidden by marks.'
                : 'No comments match this filter.';
            // Both live regions below announce on textContent changes, so
            // write only when the sentence actually changed — every filter
            // click runs this code and re-announcing the same sentence is
            // noise for screen reader users.
            if (emptyState.textContent !== emptyText) {
                emptyState.textContent = emptyText;
            }
        }

        if (marksCount) {
            const marksText = markedCount + ' marked, ' + hiddenByMarks + ' hidden' +
                (marksSaveFailed ? ' — not saved (storage unavailable)' : '');
            if (marksCount.textContent !== marksText) {
                marksCount.textContent = marksText;
            }
        }
    }

    filters.forEach(function(filter) {
        filter.addEventListener('click', function() {
            const kind = filter.dataset.filterKind;
            const value = filter.dataset.filterValue;
            if (kind === 'severity') {
                activeSeverity = activeSeverity === value ? 'all' : value;
            } else {
                activeCategory = activeCategory === value ? 'all' : value;
            }
            updateFilterState();
        });
    });

    // Marks: the viewer server is read-only, so marks are presentation state
    // kept in localStorage, keyed by the session page's path — one session,
    // one browser, no writes anywhere near the session JSONL.
    // An array, not an object literal: property lookups on an object literal
    // reach Object.prototype, so "toString" or "constructor" would pass as a
    // mark state. An array has no such surface.
    const knownMarkStates = ['fixed', 'ignored'];

    // Null-prototype maps: ids come back out of localStorage, and a hostile
    // `__proto__` key must replay as inert data, never reach a prototype.
    function emptyMarks() {
        return Object.create(null);
    }

    function marksStorageKey() {
        return 'ocr-viewer-marks:' + window.location.pathname.replace(/\/$/, '');
    }

    function loadStoredMarks() {
        let raw;
        try {
            raw = localStorage.getItem(marksStorageKey());
        } catch (_) {
            return emptyMarks();
        }
        if (!raw) {
            return emptyMarks();
        }
        let parsed;
        try {
            parsed = JSON.parse(raw);
        } catch (_) {
            return emptyMarks();
        }
        const marks = emptyMarks();
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            Object.keys(parsed).forEach(function(id) {
                if (knownMarkStates.indexOf(parsed[id]) !== -1) {
                    marks[id] = parsed[id];
                }
            });
        }
        return marks;
    }

    // Set by saveStoredMarks, read by renderCommentState. Every caller
    // persists before triggering the next render, which is what makes the
    // warning appear at the moment a mark silently stops persisting.
    let marksSaveFailed = false;

    function saveStoredMarks(marks) {
        try {
            if (Object.keys(marks).length === 0) {
                // An empty key would accumulate one entry per visited session
                // on a fixed origin with no reclaim path — remove it instead.
                localStorage.removeItem(marksStorageKey());
            } else {
                localStorage.setItem(marksStorageKey(), JSON.stringify(marks));
            }
            marksSaveFailed = false;
        } catch (err) {
            // Storage full or disabled: the in-page marks still work, they
            // just won't survive a reload — say so in the toolbar.
            marksSaveFailed = true;
            console.error('[ocr viewer] could not persist marks:', err);
        }
    }

    let marks = loadStoredMarks();

    function applyMarkState(card, state) {
        const chip = card.querySelector('[data-mark-chip]');
        if (knownMarkStates.indexOf(state) !== -1) {
            card.dataset.mark = state;
            if (chip) {
                chip.textContent = state;
                chip.className = 'comment-badge mark-chip mark-' + state;
                chip.hidden = false;
            }
        } else {
            delete card.dataset.mark;
            if (chip) {
                // Reset fully so a chip revealed by anything but this function
                // cannot show a stale mark label or color.
                chip.textContent = '';
                chip.className = 'comment-badge mark-chip';
                chip.hidden = true;
            }
        }
    }

    function setMark(markID, state) {
        if (state) {
            marks[markID] = state;
        } else {
            delete marks[markID];
        }
        saveStoredMarks(marks);
    }

    document.querySelectorAll('[data-set-mark]').forEach(function(button) {
        button.addEventListener('click', function() {
            const card = button.closest('[data-comment-card]');
            if (!card || !card.dataset.markId) {
                return;
            }
            setMark(card.dataset.markId, button.dataset.setMark);
            applyMarkState(card, button.dataset.setMark);
            refreshComments();
        });
    });

    if (hideMarkedToggle) {
        hideMarkedToggle.checked = hideMarked;
        hideMarkedToggle.addEventListener('change', function() {
            hideMarked = hideMarkedToggle.checked;
            storeHideMarked(hideMarked);
            refreshComments();
        });
    }

    if (clearAllButton) {
        clearAllButton.addEventListener('click', function() {
            marks = emptyMarks();
            saveStoredMarks(marks);
            document.querySelectorAll('[data-comment-card]').forEach(function(card) {
                applyMarkState(card, '');
            });
            refreshComments();
        });
    }

    // Replay stored marks before the first filter pass so hidden counts and
    // chip states are correct on load.
    cards.forEach(function(card) {
        if (card.dataset.markId && marks[card.dataset.markId]) {
            applyMarkState(card, marks[card.dataset.markId]);
        }
    });

    commentsPager = window.ocrPager({
        rows: cards,
        pager: pager,
        numbers: pageNumbers,
        pageSize: 20,
        filter: cardMatches,
        onRender: renderCommentState
    });
    // Construction already runs the first render; calling refresh/reset
    // here would scan every comment a second time on large sessions.
})();

// Session sidebar: open/close, a pointer-draggable width, and a comment-file
// tree whose +/- toggles and search box drive the Review Comments filter.
(function() {
    const layout = document.getElementById('session-layout');
    const sidebar = document.getElementById('session-sidebar');
    if (!layout || !sidebar) {
        return;
    }

    const toggle = document.querySelector('[data-sidebar-toggle]');
    const closeButton = document.querySelector('[data-sidebar-close]');
    const resizer = document.querySelector('[data-sidebar-resizer]');
    const filterInput = document.querySelector('[data-index-filter]');
    const emptyState = document.querySelector('[data-index-empty]');
    const fileButtons = Array.from(document.querySelectorAll('[data-index-file]'));
    const roots = Array.from(document.querySelectorAll('.session-index-tree > .index-tree'));

    const MIN_WIDTH = 200;
    const MAX_WIDTH = 520;
    const DEFAULT_WIDTH = 264;
    let width = DEFAULT_WIDTH;

    // Storage is optional: file:// exports and private browsing can refuse it,
    // and the sidebar still works with its defaults when they do.
    function storageGet(key) {
        try {
            return localStorage.getItem(key);
        } catch (_) {
            return null;
        }
    }

    function storageSet(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch (_) {
            // In-memory state remains correct for this page view.
        }
    }

    function applyWidth(px, persist) {
        width = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(px)));
        layout.style.setProperty('--sidebar-width', width + 'px');
        if (resizer) {
            resizer.setAttribute('aria-valuenow', String(width));
        }
        if (persist) {
            storageSet('ocr-viewer-sidebar-width', String(width));
        }
    }

    function setOpen(open, persist) {
        layout.dataset.sidebarOpen = open ? 'true' : 'false';
        sidebar.hidden = !open;
        if (resizer) {
            resizer.hidden = !open;
        }
        if (toggle) {
            toggle.setAttribute('aria-expanded', String(open));
            toggle.classList.toggle('is-active', open);
        }
        if (persist) {
            storageSet('ocr-viewer-sidebar-open', open ? '1' : '0');
        }
    }

    const storedWidth = parseInt(storageGet('ocr-viewer-sidebar-width') || '', 10);
    applyWidth(Number.isFinite(storedWidth) ? storedWidth : DEFAULT_WIDTH, false);
    setOpen(storageGet('ocr-viewer-sidebar-open') !== '0', false);

    if (toggle) {
        toggle.addEventListener('click', function() {
            setOpen(sidebar.hidden, true);
        });
    }
    if (closeButton) {
        closeButton.addEventListener('click', function() {
            setOpen(false, true);
            if (toggle) {
                toggle.focus();
            }
        });
    }
    sidebar.addEventListener('keydown', function(event) {
        if (event.key === 'Escape' && !event.target.matches('[data-index-filter]')) {
            setOpen(false, true);
            if (toggle) {
                toggle.focus();
            }
        }
    });

    if (resizer) {
        resizer.setAttribute('aria-valuemin', String(MIN_WIDTH));
        resizer.setAttribute('aria-valuemax', String(MAX_WIDTH));
        resizer.addEventListener('pointerdown', function(event) {
            if (event.button !== 0) {
                return;
            }
            event.preventDefault();
            const startX = event.clientX;
            const startWidth = width;
            try {
                resizer.setPointerCapture(event.pointerId);
            } catch (_) {
                // Capture is an optimization: the listeners below still track
                // the drag while the pointer stays over the handle.
            }
            resizer.classList.add('is-dragging');

            function move(moveEvent) {
                applyWidth(startWidth + moveEvent.clientX - startX, false);
            }

            function finish() {
                resizer.classList.remove('is-dragging');
                storageSet('ocr-viewer-sidebar-width', String(width));
                resizer.removeEventListener('pointermove', move);
                resizer.removeEventListener('pointerup', finish);
                resizer.removeEventListener('pointercancel', finish);
            }

            resizer.addEventListener('pointermove', move);
            resizer.addEventListener('pointerup', finish);
            resizer.addEventListener('pointercancel', finish);
        });
        resizer.addEventListener('keydown', function(event) {
            if (event.key === 'ArrowLeft') {
                applyWidth(width - 16, true);
                event.preventDefault();
            } else if (event.key === 'ArrowRight') {
                applyWidth(width + 16, true);
                event.preventDefault();
            }
        });
    }

    function childNodes(node) {
        const list = node.querySelector(':scope > .index-tree');
        return list ? Array.from(list.children).filter(function(child) {
            return child.hasAttribute('data-index-node');
        }) : [];
    }

    function normalizeFilterPath(value) {
        return (value || '').replace(/\\/g, '/').trim().toLowerCase();
    }

    function setExpanded(node, expanded) {
        node.classList.toggle('is-collapsed', !expanded);
        const button = node.querySelector(':scope > .index-row > [data-index-toggle]');
        if (!button) {
            return;
        }
        button.textContent = expanded ? '-' : '+';
        button.setAttribute('aria-expanded', String(expanded));
        button.setAttribute('aria-label', (expanded ? 'Collapse ' : 'Expand ') + (node.dataset.indexPath || ''));
    }

    function showSubtree(node) {
        childNodes(node).forEach(function(child) {
            child.hidden = false;
            if (child.dataset.indexDir === '1') {
                // A collapsed directory would keep the files this match is
                // meant to reveal behind `display: none`, so open it too.
                setExpanded(child, true);
                showSubtree(child);
            }
        });
    }

    function filterNode(node, query) {
        if (!query) {
            node.hidden = false;
            childNodes(node).forEach(function(child) {
                filterNode(child, query);
            });
            return true;
        }

        const isDir = node.dataset.indexDir === '1';
        const selfMatch = normalizeFilterPath(node.dataset.indexPath).indexOf(query) !== -1;
        let childMatch = false;
        childNodes(node).forEach(function(child) {
            if (filterNode(child, query)) {
                childMatch = true;
            }
        });

        // A directory that matches by name/path reveals its whole subtree;
        // otherwise only the branches containing a matching file stay visible.
        if (isDir && selfMatch) {
            setExpanded(node, true);
            showSubtree(node);
        }
        const show = selfMatch || childMatch;
        node.hidden = !show;
        if (isDir && childMatch) {
            setExpanded(node, true);
        }
        return show;
    }

    function applyFilter(value, scrollToComments) {
        const raw = value || '';
        const query = normalizeFilterPath(raw);
        if (filterInput && filterInput.value !== raw) {
            filterInput.value = raw;
        }

        roots.forEach(function(root) {
            Array.from(root.children).forEach(function(child) {
                if (child.hasAttribute('data-index-node')) {
                    filterNode(child, query);
                }
            });
        });

        fileButtons.forEach(function(button) {
            button.classList.toggle('is-active',
                query !== '' && normalizeFilterPath(button.dataset.indexFile) === query);
        });

        if (emptyState) {
            const anyVisible = fileButtons.some(function(button) {
                return !button.closest('[data-index-node]').hidden;
            });
            emptyState.hidden = query === '' || anyVisible;
        }

        if (window.ocrSessionComments) {
            window.ocrSessionComments.setPathFilter(raw);
        }
        if (scrollToComments) {
            const comments = document.getElementById('review-comments');
            if (comments) {
                comments.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    }

    document.querySelectorAll('[data-index-toggle]').forEach(function(button) {
        button.addEventListener('click', function() {
            const node = button.closest('.index-dir');
            if (node) {
                setExpanded(node, node.classList.contains('is-collapsed'));
            }
        });
    });

    fileButtons.forEach(function(button) {
        button.addEventListener('click', function() {
            applyFilter(button.dataset.indexFile || '', true);
        });
    });

    if (filterInput) {
        filterInput.addEventListener('input', function() {
            applyFilter(filterInput.value, false);
        });
        filterInput.addEventListener('keydown', function(event) {
            if (event.key === 'Escape' && filterInput.value) {
                event.preventDefault();
                event.stopPropagation();
                applyFilter('', false);
            }
        });
    }

    window.ocrSessionIndex = {
        apply: applyFilter,
        clear: function() {
            applyFilter('', false);
        }
    };
})();
