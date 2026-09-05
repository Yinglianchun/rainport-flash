const { ipcRenderer } = require('electron');
const settings = require('./settings.json');
const webview = document.querySelector('#webview');
const captureCover = document.querySelector('#capture-cover');
const welcome = document.querySelector('#welcome');
const address = document.querySelector('#address');
const addressForm = document.querySelector('#address-form');
const backButton = document.querySelector('#back');
const forwardButton = document.querySelector('#forward');
const reloadButton = document.querySelector('#reload');
const homeButton = document.querySelector('#home');
const bookmarkButton = document.querySelector('#bookmark-current');
const libraryButton = document.querySelector('#library');
const screenshotButton = document.querySelector('#screenshot');
const closeWindowButton = document.querySelector('#close-window');
const minimizeWindowButton = document.querySelector('#minimize-window');
const maximizeWindowButton = document.querySelector('#maximize-window');
const fullscreenButton = document.querySelector('#fullscreen');
const status = document.querySelector('#status');
const securityMark = document.querySelector('#security-mark');
const zoomLabel = document.querySelector('#zoom-label');
const zoomOutButton = document.querySelector('#zoom-out');
const zoomResetButton = document.querySelector('#zoom-reset');
const zoomInButton = document.querySelector('#zoom-in');
const libraryPanel = document.querySelector('#library-panel');
const closeLibraryButton = document.querySelector('#close-library');
const libraryTabs = Array.from(document.querySelectorAll('[data-library-tab]'));
const libraryViews = Array.from(document.querySelectorAll('[data-library-view]'));
const bookmarkList = document.querySelector('#bookmark-list');
const historyList = document.querySelector('#history-list');
const historySearch = document.querySelector('#history-search');
const importBookmarksButton = document.querySelector('#import-bookmarks');
const exportBookmarksButton = document.querySelector('#export-bookmarks');
const clearHistoryOption = document.querySelector('#clear-history-option');
const clearCacheOption = document.querySelector('#clear-cache-option');
const clearCookiesOption = document.querySelector('#clear-cookies-option');
const clearSelectedButton = document.querySelector('#clear-selected');
const cleanupResult = document.querySelector('#cleanup-result');
const repositoryLink = document.querySelector('#repository-link');

const BOOKMARKS_KEY = 'haven-flash-bookmarks';
const HISTORY_KEY = 'haven-flash-history';
const MAX_HISTORY_ITEMS = 300;

let currentZoom = Math.max(0.5, Math.min(3, Number(localStorage.getItem('haven-flash-zoom')) || 1));
let appliedZoom = currentZoom;
let loading = false;
let immersive = false;
let directPromptedPage = '';
let directDetectionInFlight = '';
let bookmarks = readStoredList(BOOKMARKS_KEY);
let history = readStoredList(HISTORY_KEY);

repositoryLink.addEventListener('click', event => {
  event.preventDefault();
  ipcRenderer.send('open-repository');
});

function readStoredList(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value : [];
  } catch (_error) {
    return [];
  }
}

function saveBookmarks() {
  localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks));
  renderCollections();
}

function saveHistory() {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  renderCollections();
}

function isHttpUrl(url) {
  return /^https?:\/\//i.test(url || '');
}

function isSensitiveHistoryUrl(value) {
  if (!isHttpUrl(value)) return true;

  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (host === 'qq.com' || host.endsWith('.qq.com')) return true;
    if (/login|oauth|auth|passport|connect|ptlogin/i.test(url.pathname)) return true;
    if (/(^|[?#&])(access_token|id_token|token|code|state|ticket|openid|openkey|auth)=/i.test(`${url.search}${url.hash}`)) return true;
    return Boolean(url.username || url.password);
  } catch (_error) {
    return true;
  }
}

function titleFor(item) {
  if (item.title && item.title !== item.url) return item.title;
  try {
    return new URL(item.url).hostname;
  } catch (_error) {
    return item.url;
  }
}

function createEmptyMessage(text) {
  const element = document.createElement('div');
  element.className = 'empty-message';
  element.textContent = text;
  return element;
}

function createLibraryItem(item, kind) {
  const row = document.createElement('div');
  row.className = 'library-item';

  const openButton = document.createElement('button');
  openButton.type = 'button';
  openButton.className = 'library-item-main';
  openButton.title = item.url;
  openButton.addEventListener('click', () => {
    closeLibrary();
    navigate(item.url);
  });

  const title = document.createElement('span');
  title.className = 'library-item-title';
  title.textContent = titleFor(item);
  const url = document.createElement('span');
  url.className = 'library-item-url';
  url.textContent = item.url;
  openButton.append(title, url);

  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'remove-item';
  removeButton.textContent = '×';
  removeButton.title = kind === 'bookmarks' ? '取消收藏' : '删除记录';
  removeButton.addEventListener('click', () => {
    if (kind === 'bookmarks') {
      bookmarks = bookmarks.filter(saved => saved.url !== item.url);
      saveBookmarks();
      updateBookmarkButton();
    } else {
      history = history.filter(saved => saved.url !== item.url);
      saveHistory();
    }
  });

  row.append(openButton, removeButton);
  return row;
}

function renderItemList(container, items, kind, emptyText) {
  container.replaceChildren();
  if (!items.length) {
    container.appendChild(createEmptyMessage(emptyText));
    return;
  }
  items.forEach(item => container.appendChild(createLibraryItem(item, kind)));
}

function renderCollections() {
  renderItemList(bookmarkList, bookmarks, 'bookmarks', '还没有收藏游戏');

  const query = historySearch.value.trim().toLowerCase();
  const filteredHistory = query
    ? history.filter(item => `${item.title || ''} ${item.url}`.toLowerCase().includes(query))
    : history;
  renderItemList(historyList, filteredHistory, 'history', query ? '没有匹配的记录' : '还没有访问记录');
}

function recordHistory(url, title) {
  if (isSensitiveHistoryUrl(url)) return;
  history = history.filter(item => item.url !== url);
  history.unshift({ url, title: title || url, visitedAt: Date.now() });
  history = history.slice(0, MAX_HISTORY_ITEMS);
  saveHistory();
}

function currentPage() {
  try {
    const url = webview.getURL();
    if (!isHttpUrl(url)) return null;
    return { url, title: webview.getTitle() || url, createdAt: Date.now() };
  } catch (_error) {
    return null;
  }
}

function updateBookmarkButton() {
  const page = currentPage();
  const active = Boolean(page && bookmarks.some(item => item.url === page.url));
  bookmarkButton.disabled = !page;
  bookmarkButton.classList.toggle('active', active);
  bookmarkButton.textContent = active ? '★' : '☆';
  bookmarkButton.title = active ? '取消收藏' : '收藏当前页面';
}

function switchLibraryTab(name) {
  libraryTabs.forEach(tab => tab.classList.toggle('active', tab.dataset.libraryTab === name));
  libraryViews.forEach(view => view.classList.toggle('hidden', view.dataset.libraryView !== name));
  cleanupResult.textContent = '';
  if (name === 'history') historySearch.focus();
}

function openLibrary(name = 'bookmarks') {
  renderCollections();
  switchLibraryTab(name);
  libraryPanel.classList.remove('hidden');
}

function closeLibrary() {
  libraryPanel.classList.add('hidden');
}

async function detectDirectGamePage() {
  if (webview.classList.contains('hidden')) return;

  const pageUrl = webview.getURL();
  if (!isHttpUrl(pageUrl) || directPromptedPage === pageUrl || directDetectionInFlight === pageUrl) return;
  try {
    if (new URL(pageUrl).pathname.toLowerCase().includes('/play/play.html')) return;
  } catch (_error) {
    return;
  }

  let directUrl;
  directDetectionInFlight = pageUrl;
  try {
    directUrl = await webview.executeJavaScript(`(${function findDirectGamePage() {
      const frames = Array.from(document.querySelectorAll([
        'iframe#playframe',
        'iframe#flashAoya',
        'iframe[src*="/play/play.html"]'
      ].join(',')))
        .filter(frame => {
          const rect = frame.getBoundingClientRect();
          return rect.width > 300 && rect.height > 200;
        })
        .sort((left, right) => {
          const a = left.getBoundingClientRect();
          const b = right.getBoundingClientRect();
          return (b.width * b.height) - (a.width * a.height);
        });
      return frames[0] ? frames[0].src : null;
    }.toString()})()`);
  } catch (_error) {
    return;
  } finally {
    if (directDetectionInFlight === pageUrl) directDetectionInFlight = '';
  }
  if (!isHttpUrl(directUrl) || directUrl === pageUrl) return;

  directPromptedPage = pageUrl;
  if (window.confirm(`识别到游戏直达页：\n${directUrl}\n\n是否跳转？`)) {
    navigate(directUrl);
  }
}

async function captureGameScreenshot() {
  if (webview.classList.contains('hidden')) {
    window.alert('先打开一个游戏页面呀');
    return;
  }

  screenshotButton.disabled = true;
  try {
    const size = await webview.executeJavaScript(gameCaptureSizeScript());
    if (!size) {
      window.alert('这个页面里还没有找到可截取的 Flash 游戏画面');
      return;
    }
    captureCover.classList.remove('hidden');
    await new Promise(resolve => setTimeout(resolve, 60));

    const result = await ipcRenderer.invoke('save-game-screenshot', {
      width: size.width,
      height: size.height,
      zoom: currentZoom,
      chromeWidth: Math.max(0, Math.round(window.innerWidth - webview.getBoundingClientRect().width)),
      chromeHeight: Math.max(0, Math.round(window.innerHeight - webview.getBoundingClientRect().height)),
      layoutScript: gameLayoutScript(true),
      restoreScript: gameLayoutScript(immersive),
      pageTitle: webview.getTitle()
    });
    if (!result.canceled) {
      screenshotButton.classList.add('saved');
      screenshotButton.title = `截图已保存 · ${result.width} × ${result.height}`;
      setTimeout(() => {
        screenshotButton.classList.remove('saved');
        screenshotButton.title = '截取完整游戏画面 (Ctrl+Shift+S)';
      }, 1200);
    }
  } catch (error) {
    window.alert(`截图失败：${error.message}`);
  } finally {
    captureCover.classList.add('hidden');
    setTimeout(applyGameLayout, 100);
    screenshotButton.disabled = false;
  }
}

function gameCaptureLayoutScript() {
  return `(${function prepareHavenTiledCapture() {
    if (window.__havenGameLayoutCleanup) {
      window.__havenGameLayoutCleanup();
      window.__havenGameLayoutCleanup = null;
    }

    const mediaSelector = [
      'object[type*="shockwave"]',
      'object[data*=".swf"]',
      'object[classid*="D27CDB6E"]',
      'embed[type*="shockwave"]',
      'embed[src*=".swf"]'
    ].join(',');
    const visibleMedia = Array.from(document.querySelectorAll(mediaSelector))
      .filter(element => {
        const rect = element.getBoundingClientRect();
        return rect.width > 100 && rect.height > 100;
      })
      .sort((left, right) => {
        const a = left.getBoundingClientRect();
        const b = right.getBoundingClientRect();
        return (b.width * b.height) - (a.width * a.height);
      });
    const gameFrame = document.querySelector([
      'iframe#playframe',
      'iframe#flashAoya',
      'iframe[src*="/play/play.html"]'
    ].join(','));
    const target = gameFrame
      || document.querySelector('#swfContainer')
      || visibleMedia[0];
    if (!target) return false;

    const media = target.matches(mediaSelector) ? target : target.querySelector(mediaSelector);
    const targetRect = target.getBoundingClientRect();
    const mediaRect = media ? media.getBoundingClientRect() : targetRect;
    let baseWidth = Number((media || target).getAttribute('width')) || mediaRect.width || targetRect.width;
    let baseHeight = Number((media || target).getAttribute('height')) || mediaRect.height || targetRect.height;
    if (target.tagName === 'IFRAME') {
      try {
        const knownFrameSizes = {
          'aobi.100bt.com': [1087, 684],
          'aola.100bt.com': [960, 560],
          'aoqi.100bt.com': [960, 560],
          'aoya.100bt.com': [960, 560]
        };
        const knownSize = knownFrameSizes[new URL(target.src, location.href).hostname];
        if (knownSize) [baseWidth, baseHeight] = knownSize;
      } catch (_error) {}
    }
    if (!baseWidth || !baseHeight) return false;

    const touched = [];
    const remember = element => {
      if (!element || touched.some(([saved]) => saved === element)) return;
      touched.push([element, element.getAttribute('style')]);
    };
    const restore = () => {
      for (const [element, style] of touched) {
        if (style === null) element.removeAttribute('style');
        else element.setAttribute('style', style);
      }
    };

    remember(document.documentElement);
    remember(document.body);
    remember(target);
    document.documentElement.style.setProperty('overflow', 'hidden', 'important');
    document.documentElement.style.setProperty('background', '#fdfdfc', 'important');
    document.body.style.setProperty('overflow', 'hidden', 'important');
    document.body.style.setProperty('margin', '0', 'important');
    document.body.style.setProperty('background', '#fdfdfc', 'important');

    const backdrop = document.createElement('div');
    Object.assign(backdrop.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '2147483646',
      background: '#fdfdfc'
    });
    document.body.appendChild(backdrop);

    const descendants = target.matches(mediaSelector)
      ? []
      : Array.from(target.querySelectorAll('object, embed'));
    descendants.forEach(remember);
    descendants.forEach(element => {
      element.style.setProperty('width', '100%', 'important');
      element.style.setProperty('height', '100%', 'important');
      element.style.setProperty('margin', '0', 'important');
    });

    target.style.setProperty('position', 'fixed', 'important');
    target.style.setProperty('left', '0', 'important');
    target.style.setProperty('top', '0', 'important');
    target.style.setProperty('width', `${baseWidth}px`, 'important');
    target.style.setProperty('height', `${baseHeight}px`, 'important');
    target.style.setProperty('transform', 'none', 'important');
    target.style.setProperty('margin', '0', 'important');
    target.style.setProperty('border', '0', 'important');
    target.style.setProperty('overflow', 'hidden', 'important');
    target.style.setProperty('z-index', '2147483647', 'important');

    window.__havenCaptureMove = (x, y) => {
      target.style.setProperty('left', `${-x}px`, 'important');
      target.style.setProperty('top', `${-y}px`, 'important');
      return true;
    };
    window.__havenGameLayoutCleanup = () => {
      delete window.__havenCaptureMove;
      backdrop.remove();
      restore();
    };
    return true;
  }.toString()})()`;
}

function gameLayoutScript(fullscreen) {
  return `(${function applyHavenGameLayout(isFullscreen) {
    if (window.__havenGameLayoutCleanup) {
      window.__havenGameLayoutCleanup();
      window.__havenGameLayoutCleanup = null;
    }

    const mediaSelector = [
      'object[type*="shockwave"]',
      'object[data*=".swf"]',
      'object[classid*="D27CDB6E"]',
      'embed[type*="shockwave"]',
      'embed[src*=".swf"]'
    ].join(',');
    const visibleMedia = Array.from(document.querySelectorAll(mediaSelector))
      .filter(element => {
        const rect = element.getBoundingClientRect();
        return rect.width > 100 && rect.height > 100;
      })
      .sort((left, right) => {
        const a = left.getBoundingClientRect();
        const b = right.getBoundingClientRect();
        return (b.width * b.height) - (a.width * a.height);
      });

    const gameFrame = document.querySelector([
      'iframe#playframe',
      'iframe#flashAoya',
      'iframe[src*="/play/play.html"]'
    ].join(','));
    const target = gameFrame
      || document.querySelector('#swfContainer')
      || visibleMedia[0];
    if (!target) return false;

    const media = target.matches(mediaSelector) ? target : target.querySelector(mediaSelector);
    const targetRect = target.getBoundingClientRect();
    const mediaRect = media ? media.getBoundingClientRect() : targetRect;
    let baseWidth = Number((media || target).getAttribute('width')) || mediaRect.width || targetRect.width;
    let baseHeight = Number((media || target).getAttribute('height')) || mediaRect.height || targetRect.height;
    if (target.tagName === 'IFRAME') {
      try {
        const knownFrameSizes = {
          'aobi.100bt.com': [1087, 684],
          'aola.100bt.com': [960, 560],
          'aoqi.100bt.com': [960, 560],
          'aoya.100bt.com': [960, 560]
        };
        const knownSize = knownFrameSizes[new URL(target.src, location.href).hostname];
        if (knownSize) [baseWidth, baseHeight] = knownSize;
      } catch (_error) {}
    }
    if (!baseWidth || !baseHeight) return false;

    const touched = [];
    const remember = element => {
      if (!element || touched.some(([saved]) => saved === element)) return;
      touched.push([element, element.getAttribute('style')]);
    };
    const restore = () => {
      for (const [element, style] of touched) {
        if (style === null) element.removeAttribute('style');
        else element.setAttribute('style', style);
      }
    };

    remember(target);

    if (!isFullscreen) {
      target.style.setProperty('display', 'block', 'important');
      target.style.setProperty('margin-left', 'auto', 'important');
      target.style.setProperty('margin-right', 'auto', 'important');
      if (target.id === 'swfContainer') {
        target.style.setProperty('width', `${baseWidth}px`, 'important');
      }
      window.__havenGameLayoutCleanup = restore;
      return true;
    }

    remember(document.documentElement);
    remember(document.body);
    document.documentElement.style.setProperty('overflow', 'hidden', 'important');
    document.documentElement.style.setProperty('background', '#fdfdfc', 'important');
    document.body.style.setProperty('overflow', 'hidden', 'important');
    document.body.style.setProperty('margin', '0', 'important');
    document.body.style.setProperty('background', '#fdfdfc', 'important');

    const isGameFrame = target.tagName === 'IFRAME';
    let backdrop = null;
    if (isGameFrame) {
      let branch = target;
      while (branch.parentElement && branch.parentElement !== document.documentElement) {
        const parent = branch.parentElement;
        Array.from(parent.children).forEach(child => {
          if (child === branch) return;
          remember(child);
          child.style.setProperty('visibility', 'hidden', 'important');
        });
        branch = parent;
      }
    } else {
      backdrop = document.createElement('div');
      backdrop.id = 'haven-game-fullscreen-backdrop';
      Object.assign(backdrop.style, {
        position: 'fixed',
        inset: '0',
        zIndex: '2147483646',
        background: '#fdfdfc'
      });
      document.body.appendChild(backdrop);
    }

    const descendants = target.matches(mediaSelector)
      ? []
      : Array.from(target.querySelectorAll('object, embed'));
    descendants.forEach(remember);
    descendants.forEach(element => {
      element.style.setProperty('width', '100%', 'important');
      element.style.setProperty('height', '100%', 'important');
      element.style.setProperty('margin', '0', 'important');
    });

    target.style.setProperty('position', 'fixed', 'important');
    target.style.setProperty('inset', '0', 'important');
    target.style.setProperty('transform', 'none', 'important');
    target.style.setProperty('margin', 'auto', 'important');
    target.style.setProperty('border', '0', 'important');
    target.style.setProperty('overflow', 'hidden', 'important');
    target.style.setProperty('z-index', '2147483647', 'important');

    const resize = () => {
      const scale = Math.min(window.innerWidth / baseWidth, window.innerHeight / baseHeight);
      const width = Math.round(baseWidth * scale);
      const height = Math.round(baseHeight * scale);
      target.style.setProperty('width', `${width}px`, 'important');
      target.style.setProperty('height', `${height}px`, 'important');
    };
    resize();
    window.addEventListener('resize', resize);

    window.__havenGameLayoutCleanup = () => {
      window.removeEventListener('resize', resize);
      if (backdrop) backdrop.remove();
      restore();
    };
    return true;
  }.toString()})(${fullscreen})`;
}

function gameCaptureSizeScript() {
  return `(${function findHavenGameSize() {
    const mediaSelector = [
      'object[type*="shockwave"]',
      'object[data*=".swf"]',
      'object[classid*="D27CDB6E"]',
      'embed[type*="shockwave"]',
      'embed[src*=".swf"]'
    ].join(',');
    const visibleMedia = Array.from(document.querySelectorAll(mediaSelector))
      .filter(element => {
        const rect = element.getBoundingClientRect();
        return rect.width > 100 && rect.height > 100;
      })
      .sort((left, right) => {
        const a = left.getBoundingClientRect();
        const b = right.getBoundingClientRect();
        return (b.width * b.height) - (a.width * a.height);
      });
    const gameFrame = document.querySelector([
      'iframe#playframe',
      'iframe#flashAoya',
      'iframe[src*="/play/play.html"]'
    ].join(','));
    const target = gameFrame
      || document.querySelector('#swfContainer')
      || visibleMedia[0];
    if (!target) return null;

    const media = target.matches(mediaSelector) ? target : target.querySelector(mediaSelector);
    const targetRect = target.getBoundingClientRect();
    const mediaRect = media ? media.getBoundingClientRect() : targetRect;
    let width = Number((media || target).getAttribute('width')) || mediaRect.width || targetRect.width;
    let height = Number((media || target).getAttribute('height')) || mediaRect.height || targetRect.height;
    if (target.tagName === 'IFRAME') {
      try {
        const knownFrameSizes = {
          'aobi.100bt.com': [1087, 684],
          'aola.100bt.com': [960, 560],
          'aoqi.100bt.com': [960, 560],
          'aoya.100bt.com': [960, 560]
        };
        const knownSize = knownFrameSizes[new URL(target.src, location.href).hostname];
        if (knownSize) [width, height] = knownSize;
      } catch (_error) {}
    }
    if (width < 2 || height < 2) return null;
    return {
      width: Math.round(width),
      height: Math.round(height)
    };
  }.toString()})()`;
}

function gameFitZoomScript() {
  return `(${function findHavenGameFitZoom() {
    const mediaSelector = [
      'object[type*="shockwave"]',
      'object[data*=".swf"]',
      'object[classid*="D27CDB6E"]',
      'embed[type*="shockwave"]',
      'embed[src*=".swf"]'
    ].join(',');
    const visibleMedia = Array.from(document.querySelectorAll(mediaSelector))
      .filter(element => {
        const rect = element.getBoundingClientRect();
        return rect.width > 100 && rect.height > 100;
      })
      .sort((left, right) => {
        const a = left.getBoundingClientRect();
        const b = right.getBoundingClientRect();
        return (b.width * b.height) - (a.width * a.height);
      });
    const gameFrame = document.querySelector([
      'iframe#playframe',
      'iframe#flashAoya',
      'iframe[src*="/play/play.html"]'
    ].join(','));
    const target = gameFrame
      || document.querySelector('#swfContainer')
      || visibleMedia[0];
    if (!target) return 1;

    const media = target.matches(mediaSelector) ? target : target.querySelector(mediaSelector);
    const rect = (media || target).getBoundingClientRect();
    const width = Number((media || target).getAttribute('width')) || rect.width;
    const height = Number((media || target).getAttribute('height')) || rect.height;
    if (!width || !height) return 1;
    return Math.min(window.innerWidth / width, window.innerHeight / height);
  }.toString()})()`;
}

function applyGameLayout() {
  if (webview.classList.contains('hidden')) return;
  webview.executeJavaScript(gameLayoutScript(immersive)).catch(() => {});
}

function setImmersive(nextImmersive) {
  immersive = nextImmersive;
  if (immersive) closeLibrary();
  document.body.classList.toggle('immersive', immersive);
  fullscreenButton.title = immersive ? '退出全屏 (F11)' : '游戏全屏 (F11)';
  fullscreenButton.setAttribute('aria-label', immersive ? '退出全屏' : '游戏全屏');
  if (!immersive) {
    setZoom(currentZoom);
    setTimeout(applyGameLayout, 0);
    setTimeout(applyGameLayout, 250);
    return;
  }

  appliedZoom = 1;
  webview.setZoomFactor(1);
  setTimeout(() => {
    applyGameLayout();
    setTimeout(applyGameLayout, 250);
  }, 60);
}

function normalizeAddress(value) {
  const input = value.trim();
  if (!input) return null;

  if (/^https?:\/\//i.test(input)) return input;
  if (/^(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?(\/|$)/i.test(input)) {
    return `http://${input}`;
  }
  if (/^[^\s]+\.[^\s]+/.test(input)) return `https://${input}`;

  return `https://www.baidu.com/s?wd=${encodeURIComponent(input)}`;
}

function showWebview() {
  welcome.classList.add('hidden');
  webview.classList.remove('hidden');
  bookmarkButton.disabled = false;
}

function showWelcome() {
  closeLibrary();
  webview.classList.add('hidden');
  welcome.classList.remove('hidden');
  webview.src = 'about:blank';
  address.value = '';
  securityMark.classList.remove('secure');
  status.textContent = '准备好了';
  document.title = 'Rainport';
  bookmarkButton.disabled = true;
  bookmarkButton.classList.remove('active');
  bookmarkButton.textContent = '☆';
  renderCollections();
}

function navigate(value) {
  const url = normalizeAddress(value);
  if (!url) return;
  showWebview();
  address.value = url;
  webview.src = url;
}

function updateNavigation() {
  try {
    backButton.disabled = !webview.canGoBack();
    forwardButton.disabled = !webview.canGoForward();
  } catch (_error) {
    backButton.disabled = true;
    forwardButton.disabled = true;
  }
}

function updateAddress(url) {
  if (!url) return;
  address.value = url;
  securityMark.classList.toggle('secure', url.startsWith('https://'));
  updateBookmarkButton();
}

function setLoading(nextLoading) {
  loading = nextLoading;
  reloadButton.textContent = loading ? '×' : '↻';
  reloadButton.title = loading ? '停止加载' : '刷新 (Ctrl+R)';
}

function setZoom(nextZoom) {
  currentZoom = Math.max(0.5, Math.min(3, Math.round(nextZoom * 10) / 10));
  appliedZoom = currentZoom;
  webview.setZoomFactor(currentZoom);
  zoomLabel.textContent = `${Math.round(currentZoom * 100)}%`;
  localStorage.setItem('haven-flash-zoom', String(currentZoom));
}

addressForm.addEventListener('submit', event => {
  event.preventDefault();
  navigate(address.value);
});

address.addEventListener('focus', () => address.select());

backButton.addEventListener('click', () => {
  if (webview.canGoBack()) webview.goBack();
});

forwardButton.addEventListener('click', () => {
  if (webview.canGoForward()) webview.goForward();
});

reloadButton.addEventListener('click', () => {
  if (loading) webview.stop();
  else webview.reload();
});

homeButton.addEventListener('click', showWelcome);

bookmarkButton.addEventListener('click', () => {
  const page = currentPage();
  if (!page) return;

  const existing = bookmarks.some(item => item.url === page.url);
  if (existing) bookmarks = bookmarks.filter(item => item.url !== page.url);
  else bookmarks.unshift(page);
  saveBookmarks();
  updateBookmarkButton();
});

libraryButton.addEventListener('click', () => {
  if (libraryPanel.classList.contains('hidden')) openLibrary();
  else closeLibrary();
});

closeLibraryButton.addEventListener('click', closeLibrary);
screenshotButton.addEventListener('click', captureGameScreenshot);
minimizeWindowButton.addEventListener('click', () => ipcRenderer.send('minimize-window'));
maximizeWindowButton.addEventListener('click', () => ipcRenderer.send('toggle-maximize-window'));
closeWindowButton.addEventListener('click', () => ipcRenderer.send('close-window'));

libraryTabs.forEach(tab => {
  tab.addEventListener('click', () => switchLibraryTab(tab.dataset.libraryTab));
});

historySearch.addEventListener('input', renderCollections);

exportBookmarksButton.addEventListener('click', async () => {
  try {
    await ipcRenderer.invoke('export-bookmarks', bookmarks);
  } catch (error) {
    cleanupResult.textContent = `导出失败：${error.message}`;
  }
});

importBookmarksButton.addEventListener('click', async () => {
  try {
    const result = await ipcRenderer.invoke('import-bookmarks');
    if (result.canceled) return;
    const imported = result.bookmarks
      .filter(item => item && isHttpUrl(item.url))
      .map(item => ({
        url: item.url,
        title: typeof item.title === 'string' ? item.title : item.url,
        createdAt: Number(item.createdAt) || Date.now()
      }));
    const merged = [...imported, ...bookmarks];
    bookmarks = merged.filter((item, index) => merged.findIndex(saved => saved.url === item.url) === index);
    saveBookmarks();
    updateBookmarkButton();
  } catch (error) {
    window.alert(`导入失败：${error.message}`);
  }
});

clearSelectedButton.addEventListener('click', async () => {
  const options = {
    history: clearHistoryOption.checked,
    cache: clearCacheOption.checked,
    cookies: clearCookiesOption.checked
  };
  if (!options.history && !options.cache && !options.cookies) {
    cleanupResult.textContent = '还没有选择要清理的数据';
    return;
  }
  if (options.cookies && !window.confirm('清理 Cookie 会退出所有游戏账号，确定继续吗？')) return;

  clearSelectedButton.disabled = true;
  cleanupResult.textContent = '正在清理…';
  try {
    if (options.history) {
      history = [];
      saveHistory();
    }
    await ipcRenderer.invoke('clear-browser-data', options);
    cleanupResult.textContent = '清理完成';
  } catch (error) {
    cleanupResult.textContent = `清理失败：${error.message}`;
  } finally {
    clearSelectedButton.disabled = false;
  }
});

fullscreenButton.addEventListener('click', () => {
  ipcRenderer.send('toggle-fullscreen');
});

zoomOutButton.addEventListener('click', () => setZoom(currentZoom - 0.1));
zoomResetButton.addEventListener('click', () => setZoom(1));
zoomInButton.addEventListener('click', () => setZoom(currentZoom + 0.1));

webview.addEventListener('did-start-loading', () => {
  setLoading(true);
  status.textContent = '正在加载…';
});

webview.addEventListener('did-stop-loading', () => {
  setLoading(false);
  if (webview.classList.contains('hidden')) return;
  status.textContent = webview.getTitle() || '加载完成';
  updateAddress(webview.getURL());
  updateNavigation();
  recordHistory(webview.getURL(), webview.getTitle());
  detectDirectGamePage();
});

webview.addEventListener('did-navigate', event => {
  if (webview.classList.contains('hidden')) return;
  directPromptedPage = '';
  updateAddress(event.url);
  updateNavigation();
});

webview.addEventListener('did-navigate-in-page', event => {
  if (webview.classList.contains('hidden')) return;
  updateAddress(event.url);
  updateNavigation();
  recordHistory(event.url, webview.getTitle());
});

webview.addEventListener('page-title-updated', event => {
  status.textContent = event.title;
  document.title = event.title ? `${event.title} - Rainport` : 'Rainport';
  updateBookmarkButton();
});

webview.addEventListener('update-target-url', event => {
  status.textContent = event.url || webview.getTitle() || '准备好了';
});

webview.addEventListener('did-fail-load', event => {
  if (event.errorCode === -3) return;
  setLoading(false);
  status.textContent = `加载失败：${event.errorDescription}`;
});

webview.addEventListener('dom-ready', () => {
  if (immersive) {
    setImmersive(true);
    return;
  }
  setZoom(currentZoom);
  applyGameLayout();
  setTimeout(applyGameLayout, 600);
});

ipcRenderer.on('fullscreen-changed', (_event, isFullscreen) => {
  setImmersive(isFullscreen);
});

ipcRenderer.on('open-in-current', (_event, url) => {
  navigate(url);
});

ipcRenderer.on('capture-game-requested', captureGameScreenshot);

ipcRenderer.on('maximized-changed', (_event, isMaximized) => {
  maximizeWindowButton.classList.toggle('restoring', isMaximized);
  maximizeWindowButton.title = isMaximized ? '还原窗口' : '最大化';
  maximizeWindowButton.setAttribute('aria-label', isMaximized ? '还原窗口' : '最大化');
});

window.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !libraryPanel.classList.contains('hidden')) {
    event.preventDefault();
    closeLibrary();
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'l') {
    event.preventDefault();
    address.focus();
    address.select();
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
    event.preventDefault();
    bookmarkButton.click();
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'h') {
    event.preventDefault();
    openLibrary('history');
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'r') {
    event.preventDefault();
    webview.reload();
    return;
  }

  if ((event.ctrlKey || event.metaKey) && (event.key === '+' || event.key === '=')) {
    event.preventDefault();
    setZoom(currentZoom + 0.1);
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key === '-') {
    event.preventDefault();
    setZoom(currentZoom - 0.1);
    return;
  }

  if ((event.ctrlKey || event.metaKey) && event.key === '0') {
    event.preventDefault();
    setZoom(1);
    return;
  }

  if (event.altKey && event.key === 'ArrowLeft' && webview.canGoBack()) {
    webview.goBack();
  }

  if (event.altKey && event.key === 'ArrowRight' && webview.canGoForward()) {
    webview.goForward();
  }
});

backButton.disabled = true;
forwardButton.disabled = true;
bookmarkButton.disabled = true;
zoomLabel.textContent = `${Math.round(currentZoom * 100)}%`;
renderCollections();

const initialUrl = new URLSearchParams(window.location.search).get('url');
if (initialUrl || settings.startUrl) navigate(initialUrl || settings.startUrl);
