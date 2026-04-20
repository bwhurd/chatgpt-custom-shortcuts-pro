(() => {
  if (window.__cspLazyFastBridgeInstalled) return;
  window.__cspLazyFastBridgeInstalled = true;

  const currentScript = document.currentScript;
  const RETAINED_TURN_COUNT = Math.max(
    24,
    Number(currentScript?.dataset?.retainedTurnCount) || 24,
  );
  const MIN_TURN_COUNT_TO_TRIM = Math.max(
    RETAINED_TURN_COUNT + 2,
    Number(currentScript?.dataset?.minTurnCountToTrim) || 40,
  );
  const LOG_PREFIX = String(currentScript?.dataset?.logPrefix || '[CSP Lazy Fast Mode]');
  const ROUTE_RE = /^\/c\/([^/?#]+)/;
  const CONVERSATION_PATH_RE = /^\/backend-api\/conversation\/([^/?#]+)$/i;
  const HISTORY_DATA_NODE_ID = 'csp-lazy-fast-history-data';
  const HISTORY_MESSAGE_SOURCE = 'csp-lazy-fast-history';
  const EXPAND_REQUEST_SOURCE = 'csp-lazy-fast-expand-request';
  const EXPAND_RESULT_SOURCE = 'csp-lazy-fast-expand-result';
  const AUTO_EXPAND_INTENT_SOURCE = 'csp-lazy-fast-auto-expand-intent';
  const BYPASS_KEY = 'csp_lazy_fast_skip_once';
  const RETAINED_COUNT_KEY_PREFIX = 'csp_lazy_fast_retained_turn_count:';
  const ANCHOR_KEY_PREFIX = 'csp_lazy_fast_restore_anchor:';
  const CONSUMED_ANCHOR_KEY_PREFIX = 'csp_lazy_fast_consumed_anchor:';
  const MAX_CACHED_FULL_PAYLOADS = 4;
  const PENDING_RELOAD_MAX_AGE_MS = 2 * 60 * 1000;
  const AUTO_EXPAND_TOP_THRESHOLD_PX = 24;
  const AUTO_EXPAND_INTENT_COOLDOWN_MS = 1200;
  const NATIVE_TURN_SELECTOR =
    'section[data-testid^="conversation-turn-"], article[data-testid^="conversation-turn-"], article[data-turn]';

  const fullPayloadCache = new Map();
  const autoExpandState = {
    scrollRoot: null,
    scrollListener: null,
    lastObservedScrollTop: 0,
    lastIntentAt: 0,
    lastIntentConversationId: '',
  };

  const getConversationIdFromPath = (pathname = location.pathname || '') =>
    pathname.match(ROUTE_RE)?.[1] || '';

  const toAbsoluteUrl = (value) => {
    if (!value) return '';
    try {
      return new URL(value, location.origin).href;
    } catch {
      return '';
    }
  };

  const cloneNode = (node) => {
    if (!node || typeof node !== 'object') return node;
    return {
      ...node,
      children: Array.isArray(node.children) ? [...node.children] : [],
    };
  };

  const normalizeText = (value) => {
    if (typeof value !== 'string') return '';
    return value.replace(/\r\n?/g, '\n').trim();
  };

  const getAnchorKey = (conversationId) =>
    `${ANCHOR_KEY_PREFIX}${String(conversationId || '')}`;

  const getRetainedCountKey = (conversationId) =>
    `${RETAINED_COUNT_KEY_PREFIX}${String(conversationId || '')}`;

  const getConsumedAnchorKey = (conversationId) =>
    `${CONSUMED_ANCHOR_KEY_PREFIX}${String(conversationId || '')}`;

  const normalizeRetainedTurnCount = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return RETAINED_TURN_COUNT;
    return Math.max(RETAINED_TURN_COUNT, Math.floor(parsed));
  };

  const readPendingAnchor = (conversationId) => {
    if (!conversationId) return null;
    try {
      const raw = sessionStorage.getItem(getAnchorKey(conversationId));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  };

  const readStoredRetainedTurnCount = (conversationId) => {
    try {
      const raw = sessionStorage.getItem(getRetainedCountKey(conversationId));
      return normalizeRetainedTurnCount(raw);
    } catch {
      return RETAINED_TURN_COUNT;
    }
  };

  const markPendingAnchorConsumed = (conversationId, createdAt) => {
    if (!conversationId || !Number.isFinite(createdAt)) return;
    try {
      sessionStorage.setItem(getConsumedAnchorKey(conversationId), String(createdAt));
    } catch { }
  };

  const isPendingAnchorConsumed = (conversationId, createdAt) => {
    if (!conversationId || !Number.isFinite(createdAt)) return false;
    try {
      return sessionStorage.getItem(getConsumedAnchorKey(conversationId)) === String(createdAt);
    } catch {
      return false;
    }
  };

  const readRequestedRetainedTurnCount = (conversationId) => {
    const pendingAnchor = readPendingAnchor(conversationId);
    const createdAt = Number(pendingAnchor?.createdAt);
    const hasFreshPendingAnchor =
      !!pendingAnchor?.turnId &&
      Number.isFinite(createdAt) &&
      Date.now() - createdAt <= PENDING_RELOAD_MAX_AGE_MS;
    if (hasFreshPendingAnchor && !isPendingAnchorConsumed(conversationId, createdAt)) {
      markPendingAnchorConsumed(conversationId, createdAt);
      return normalizeRetainedTurnCount(pendingAnchor.requestedRetainedTurnCount);
    }

    const currentHistoryData = window.__cspLazyFastLastHistory;
    if (currentHistoryData?.conversationId === conversationId) {
      return readStoredRetainedTurnCount(conversationId);
    }

    return RETAINED_TURN_COUNT;
  };

  const getNativeTurnCount = () =>
    document.querySelectorAll(NATIVE_TURN_SELECTOR).length;

  const getScrollRoot = () => {
    try {
      if (typeof window.getScrollableContainer === 'function') {
        const resolved = window.getScrollableContainer();
        if (resolved instanceof Element) return resolved;
      }
    } catch { }

    const firstMessage = document.querySelector('[data-testid^="conversation-turn-"]');
    if (!firstMessage) return document.scrollingElement || document.documentElement;

    let container = firstMessage.parentElement;
    while (container && container !== document.body) {
      const style = getComputedStyle(container);
      if (
        container.scrollHeight > container.clientHeight &&
        style.overflowY !== 'visible' &&
        style.overflowY !== 'hidden'
      ) {
        return container;
      }
      container = container.parentElement;
    }

    return document.scrollingElement || document.documentElement;
  };

  const readCurrentHistoryData = () => {
    const current = window.__cspLazyFastLastHistory;
    if (current && typeof current === 'object') return current;

    const node = document.getElementById(HISTORY_DATA_NODE_ID);
    const text = node?.textContent?.trim();
    if (!text) return null;
    try {
      const parsed = JSON.parse(text);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  };

  const postAutoExpandIntent = (source) => {
    const conversationId = getConversationIdFromPath();
    if (!conversationId) return false;

    const historyData = readCurrentHistoryData();
    if (!historyData || historyData.conversationId !== conversationId) return false;
    if ((Number(historyData.keptStartIndex) || 0) <= 0) return false;

    const now = Date.now();
    if (
      autoExpandState.lastIntentConversationId === conversationId &&
      now - autoExpandState.lastIntentAt < AUTO_EXPAND_INTENT_COOLDOWN_MS
    ) {
      return false;
    }

    autoExpandState.lastIntentAt = now;
    autoExpandState.lastIntentConversationId = conversationId;
    window.postMessage(
      {
        source: AUTO_EXPAND_INTENT_SOURCE,
        payload: {
          conversationId,
          source,
        },
      },
      location.origin,
    );
    return true;
  };

  const clearAutoExpandScrollBinding = () => {
    if (
      autoExpandState.scrollRoot instanceof Element &&
      typeof autoExpandState.scrollListener === 'function'
    ) {
      autoExpandState.scrollRoot.removeEventListener('scroll', autoExpandState.scrollListener);
    }
    autoExpandState.scrollRoot = null;
    autoExpandState.scrollListener = null;
    autoExpandState.lastObservedScrollTop = 0;
  };

  const ensureAutoExpandScrollBinding = () => {
    const conversationId = getConversationIdFromPath();
    const historyData = readCurrentHistoryData();
    const scrollRoot = getScrollRoot();
    if (
      !conversationId ||
      !historyData ||
      historyData.conversationId !== conversationId ||
      (Number(historyData.keptStartIndex) || 0) <= 0 ||
      !(scrollRoot instanceof Element)
    ) {
      clearAutoExpandScrollBinding();
      return;
    }

    if (autoExpandState.scrollRoot === scrollRoot) return;

    clearAutoExpandScrollBinding();
    autoExpandState.scrollRoot = scrollRoot;
    autoExpandState.lastObservedScrollTop = Number(scrollRoot.scrollTop) || 0;
    autoExpandState.scrollListener = () => {
      if (!(autoExpandState.scrollRoot instanceof Element)) return;
      const currentTop = Number(autoExpandState.scrollRoot.scrollTop) || 0;
      const previousTop = Number(autoExpandState.lastObservedScrollTop) || currentTop;
      autoExpandState.lastObservedScrollTop = currentTop;
      if (currentTop > AUTO_EXPAND_TOP_THRESHOLD_PX) return;
      if (currentTop >= previousTop - 1) return;
      postAutoExpandIntent('scroll_root_top_bridge');
    };
    scrollRoot.addEventListener('scroll', autoExpandState.scrollListener, { passive: true });
  };

  const postExpandResult = (payload) => {
    window.postMessage(
      {
        source: EXPAND_RESULT_SOURCE,
        payload,
      },
      location.origin,
    );
  };

  const pruneFullPayloadCache = () => {
    while (fullPayloadCache.size > MAX_CACHED_FULL_PAYLOADS) {
      const oldestKey = fullPayloadCache.keys().next().value;
      if (!oldestKey) break;
      fullPayloadCache.delete(oldestKey);
    }
  };

  const cacheFullPayload = (payload, branchHistory) => {
    const conversationId = payload?.conversation_id || '';
    if (!conversationId || !payload?.mapping || !Array.isArray(branchHistory?.branchNodeIds)) return;

    fullPayloadCache.delete(conversationId);
    fullPayloadCache.set(conversationId, {
      payload,
      branchNodeIds: [...branchHistory.branchNodeIds],
      cachedAt: Date.now(),
    });
    pruneFullPayloadCache();
  };

  const clonePlainObject = (value) => {
    if (value == null) return value;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return value;
    }
  };

  const cloneMessage = (message) => {
    const cloned = clonePlainObject(message);
    if (!cloned || typeof cloned !== 'object') return null;

    if (!cloned.author || typeof cloned.author !== 'object') {
      cloned.author = {
        role: 'assistant',
        name: null,
        metadata: {},
      };
    } else if (!cloned.author.metadata || typeof cloned.author.metadata !== 'object') {
      cloned.author.metadata = {};
    }

    if (!cloned.metadata || typeof cloned.metadata !== 'object') cloned.metadata = {};
    if (!cloned.clientMetadata || typeof cloned.clientMetadata !== 'object') {
      cloned.clientMetadata = {};
    }
    return cloned;
  };

  const getMessageContentType = (message) =>
    String(message?.content?.content_type || '').trim();

  const buildAssistantMessageGroups = (messages) => {
    const groups = [];
    const hiddenGroups = [];

    for (const message of messages) {
      if (!message || typeof message !== 'object') continue;

      const contentType = getMessageContentType(message);
      if (contentType === 'thoughts') {
        hiddenGroups.push({
          type: 2,
          messages: [message],
        });
        continue;
      }

      if (contentType === 'reasoning_recap') {
        hiddenGroups.push({
          type: 3,
          messages: [message],
        });
        continue;
      }

      groups.push({
        type: 0,
        messages: [message],
      });
    }

    if (hiddenGroups.length) {
      groups.unshift({
        type: -1,
        groups: hiddenGroups,
      });
    }

    return groups;
  };

  const buildUserMessageGroups = (messages) =>
    messages.length
      ? [{
          type: 0,
          messages,
        }]
      : [];

  const inferModelSlug = (messages) => {
    for (const message of messages) {
      const metadata = message?.metadata;
      if (!metadata || typeof metadata !== 'object') continue;
      if (typeof metadata.model_slug === 'string' && metadata.model_slug) return metadata.model_slug;
      if (typeof metadata.resolved_model_slug === 'string' && metadata.resolved_model_slug) {
        return metadata.resolved_model_slug;
      }
      if (typeof metadata.default_model_slug === 'string' && metadata.default_model_slug) {
        return metadata.default_model_slug;
      }
    }
    return null;
  };

  const inferGizmoId = (messages) => {
    for (const message of messages) {
      const metadata = message?.metadata;
      if (!metadata || typeof metadata !== 'object') continue;
      if (typeof metadata.gizmo_id === 'string' && metadata.gizmo_id) return metadata.gizmo_id;
      if (typeof metadata.gizmoId === 'string' && metadata.gizmoId) return metadata.gizmoId;
    }
    return null;
  };

  const buildNativeTurn = (turn, messages) => {
    const role = turn?.role === 'assistant' ? 'assistant' : 'user';
    const displayMessages =
      role === 'assistant'
        ? messages.filter((message) => {
            const authorRole = message?.author?.role;
            return authorRole === 'assistant' || authorRole === 'tool';
          })
        : messages.filter((message) => message?.author?.role === 'user');

    const messageGroups =
      role === 'assistant'
        ? buildAssistantMessageGroups(displayMessages)
        : buildUserMessageGroups(displayMessages);

    return {
      id: String(turn?.id || ''),
      role,
      messages,
      messageGroups,
      isPrompt: role === 'user',
      gizmoId: inferGizmoId(messages),
      hasDisplayableMessages: messageGroups.length > 0,
      userContinuationRootTurnId: null,
      userContinuationParentTurnId: null,
      userContinuationSuccessorTurnId: null,
      isAsyncCorrection: false,
      modelSlug: role === 'assistant' ? inferModelSlug(messages) : null,
    };
  };

  const getReactFiber = (node) => {
    if (!node || typeof node !== 'object') return null;
    const fiberKey = Object.keys(node).find(
      (key) => key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$'),
    );
    return fiberKey ? node[fiberKey] : null;
  };

  const getHookAtIndex = (fiber, index) => {
    let hook = fiber?.memoizedState || null;
    let currentIndex = 0;
    while (hook && currentIndex < index) {
      hook = hook.next || null;
      currentIndex += 1;
    }
    return hook || null;
  };

  const findMountedOwnerContext = () => {
    const firstTurnNode = document.querySelector(NATIVE_TURN_SELECTOR);
    if (!(firstTurnNode instanceof HTMLElement)) return null;

    const firstMountedId =
      firstTurnNode.getAttribute('data-turn-id') || firstTurnNode.getAttribute('data-turn') || '';
    if (!firstMountedId) return null;

    let rowFiber = getReactFiber(firstTurnNode);
    while (rowFiber) {
      const props = rowFiber.memoizedProps;
      if (props?.conversation && Number.isFinite(Number(props.turnIndex))) break;
      rowFiber = rowFiber.return || null;
    }
    if (!rowFiber?.memoizedProps?.conversation) return null;

    let ownerFiber = rowFiber;
    while (ownerFiber) {
      const selectorFn = ownerFiber.updateQueue?.memoCache?.data?.[0]?.[1];
      if (typeof selectorFn === 'function') {
        if (selectorFn.__cspLazyFastSelectorOverride === true) break;
        const source = Function.prototype.toString.call(selectorFn);
        if (source.includes('getConversationTurnIds')) break;
      }
      ownerFiber = ownerFiber.return || null;
    }
    if (!ownerFiber) return null;

    return {
      firstTurnNode,
      firstMountedId,
      rowFiber,
      ownerFiber,
      conversation: rowFiber.memoizedProps.conversation,
    };
  };

  const findTurnArray = (conversation, firstMountedId) => {
    for (const target of [conversation, conversation?.ctx]) {
      if (!target || typeof target !== 'object') continue;
      for (const symbol of Object.getOwnPropertySymbols(target)) {
        let resolved = target[symbol];
        try {
          if (typeof resolved === 'function') resolved = resolved();
        } catch {
          continue;
        }
        if (!Array.isArray(resolved)) continue;
        if (
          resolved.some(
            (item) =>
              item &&
              typeof item === 'object' &&
              typeof item.id === 'string' &&
              item.id === firstMountedId,
          )
        ) {
          return resolved;
        }
      }
    }
    return null;
  };

  const findTree = (conversation) => {
    for (const candidate of [conversation, conversation?.ctx]) {
      if (!candidate || typeof candidate !== 'object') continue;
      for (const symbol of Object.getOwnPropertySymbols(candidate)) {
        let resolved = candidate[symbol];
        try {
          if (typeof resolved === 'function') resolved = resolved();
        } catch {
          continue;
        }
        if (
          resolved &&
          typeof resolved === 'object' &&
          resolved.tree &&
          typeof resolved.tree.prependNode === 'function'
        ) {
          return resolved.tree;
        }
      }
    }
    return null;
  };

  const computeNextKeepStartIndex = (historyData, requestedRetainedTurnCount) => {
    const turns = Array.isArray(historyData?.turns) ? historyData.turns : [];
    const totalTurnCount = Math.max(0, Number(historyData?.totalTurnCount) || turns.length || 0);
    if (!totalTurnCount || !turns.length) return 0;

    let keepStartIndex = Math.max(
      0,
      totalTurnCount - Math.max(RETAINED_TURN_COUNT, Math.floor(requestedRetainedTurnCount)),
    );
    if (turns[keepStartIndex]?.role === 'assistant' && keepStartIndex > 0) keepStartIndex -= 1;
    return keepStartIndex;
  };

  const createTurnNodeRanges = (historyTurns, branchNodeIds, startIndex, endIndex) => {
    const branchIndexByNodeId = new Map();
    branchNodeIds.forEach((nodeId, index) => {
      branchIndexByNodeId.set(nodeId, index);
    });

    const ranges = [];
    for (let turnIndex = startIndex; turnIndex < endIndex; turnIndex += 1) {
      const turn = historyTurns[turnIndex];
      const startNodeId = turn?.startNodeId;
      if (!startNodeId || !branchIndexByNodeId.has(startNodeId)) return null;

      const startBranchIndex = branchIndexByNodeId.get(startNodeId);
      const nextStartNodeId = historyTurns[turnIndex + 1]?.startNodeId || '';
      const endBranchIndex = nextStartNodeId && branchIndexByNodeId.has(nextStartNodeId)
        ? branchIndexByNodeId.get(nextStartNodeId)
        : branchNodeIds.length;
      if (!Number.isFinite(startBranchIndex) || !Number.isFinite(endBranchIndex)) return null;
      if (endBranchIndex <= startBranchIndex) return null;

      ranges.push(branchNodeIds.slice(startBranchIndex, endBranchIndex));
    }

    return ranges;
  };

  const performInPlaceExpansion = (conversationId, requestedRetainedTurnCount) => {
    const cached = fullPayloadCache.get(conversationId);
    const historyData = window.__cspLazyFastLastHistory;
    const stats = window.__cspLazyFastLastPrune || {};
    if (!cached?.payload?.mapping || !Array.isArray(cached.branchNodeIds)) {
      throw new Error('full_payload_cache_unavailable');
    }
    if (!historyData || historyData.conversationId !== conversationId) {
      throw new Error('history_data_unavailable');
    }

    const historyTurns = Array.isArray(historyData.turns) ? historyData.turns : [];
    const currentKeepStartIndex = Math.max(0, Number(historyData.keptStartIndex) || 0);
    const nextKeepStartIndex = computeNextKeepStartIndex(historyData, requestedRetainedTurnCount);
    if (nextKeepStartIndex >= currentKeepStartIndex) {
      return {
        noChange: true,
        requestedRetainedTurnCount,
        keptStartIndex: currentKeepStartIndex,
      };
    }

    const missingTurns = historyTurns.slice(nextKeepStartIndex, currentKeepStartIndex);
    if (!missingTurns.length) {
      return {
        noChange: true,
        requestedRetainedTurnCount,
        keptStartIndex: currentKeepStartIndex,
      };
    }

    const turnNodeRanges = createTurnNodeRanges(
      historyTurns,
      cached.branchNodeIds,
      nextKeepStartIndex,
      currentKeepStartIndex,
    );
    if (!Array.isArray(turnNodeRanges) || turnNodeRanges.length !== missingTurns.length) {
      throw new Error('turn_node_ranges_unavailable');
    }

    const ownerContext = findMountedOwnerContext();
    if (!ownerContext?.conversation || !ownerContext?.ownerFiber) {
      throw new Error('mounted_owner_unavailable');
    }

    const turnArray = findTurnArray(ownerContext.conversation, ownerContext.firstMountedId);
    if (!Array.isArray(turnArray) || turnArray.length < 2) {
      throw new Error('turn_array_unavailable');
    }

    const tree = findTree(ownerContext.conversation);
    if (!tree || typeof tree.prependNode !== 'function') {
      throw new Error('tree_unavailable');
    }

    const cacheRow = ownerContext.ownerFiber.updateQueue?.memoCache?.data?.[0];
    const hook0 = getHookAtIndex(ownerContext.ownerFiber, 0);
    const hook4 = getHookAtIndex(ownerContext.ownerFiber, 4);
    const hook18 = getHookAtIndex(ownerContext.ownerFiber, 18);
    const currentIdWindow = Array.isArray(hook4?.memoizedState?.[0])
      ? hook4.memoizedState[0]
      : Array.isArray(cacheRow?.[3])
        ? cacheRow[3]
        : null;
    if (!Array.isArray(currentIdWindow) || !currentIdWindow.length) {
      throw new Error('selector_window_unavailable');
    }
    if (typeof hook18?.queue?.dispatch !== 'function') {
      throw new Error('owner_dispatch_unavailable');
    }

    const currentTurnIdSet = new Set(currentIdWindow.slice(1));
    const turnsToInsert = [];
    const rawNodeIdsToInsert = [];

    for (let index = 0; index < missingTurns.length; index += 1) {
      const turn = missingTurns[index];
      if (!turn?.id || currentTurnIdSet.has(turn.id)) continue;

      const rawNodeIds = Array.isArray(turnNodeRanges[index]) ? turnNodeRanges[index] : [];
      const rawMessages = rawNodeIds
        .map((nodeId) => cloneMessage(cached.payload.mapping?.[nodeId]?.message))
        .filter(Boolean);
      if (!rawMessages.length) {
        throw new Error(`raw_messages_unavailable:${turn.id}`);
      }

      turnsToInsert.push(buildNativeTurn(turn, rawMessages));
      rawNodeIdsToInsert.push(...rawNodeIds);
    }

    if (!turnsToInsert.length || !rawNodeIdsToInsert.length) {
      return {
        noChange: true,
        requestedRetainedTurnCount,
        keptStartIndex: currentKeepStartIndex,
      };
    }

    const nativeTurnsBefore = getNativeTurnCount();
    const nextIdWindow = [
      currentIdWindow[0],
      ...turnsToInsert.map((turn) => turn.id),
      ...currentIdWindow.slice(1),
    ];

    for (let index = rawNodeIdsToInsert.length - 1; index >= 0; index -= 1) {
      const nodeId = rawNodeIdsToInsert[index];
      const message = cloneMessage(cached.payload.mapping?.[nodeId]?.message);
      if (!message) throw new Error(`raw_message_unavailable:${nodeId}`);
      tree.prependNode(ownerContext.firstMountedId, message);
    }

    turnArray.splice(1, 0, ...turnsToInsert);

    const nextTuple = [
      nextIdWindow,
      hook4.memoizedState?.[1],
      hook4.memoizedState?.[2],
      hook4.memoizedState?.[3],
    ];
    hook4.memoizedState = nextTuple;

    if (
      hook0?.memoizedState &&
      typeof hook0.memoizedState === 'object' &&
      'current' in hook0.memoizedState
    ) {
      hook0.memoizedState.current = nextTuple;
    }

    if (Array.isArray(cacheRow)) {
      cacheRow[3] = nextIdWindow;
      cacheRow[13] = undefined;
      cacheRow[15] = nextIdWindow.length;
      cacheRow[26] = undefined;
      cacheRow[27] = undefined;
    }

    hook18.queue.dispatch({
      type: 'csp-lazy-fast-expand',
      requestedRetainedTurnCount,
      at: Date.now(),
    });

    const nextHistoryData = {
      ...historyData,
      keptStartIndex: nextKeepStartIndex,
      requestedRetainedTurnCount,
    };
    const totalTurnCount = Math.max(0, Number(historyData.totalTurnCount) || historyTurns.length || 0);
    const nextStats = {
      ...stats,
      conversationId,
      keptStartIndex: nextKeepStartIndex,
      keptTurns: Math.max(0, totalTurnCount - nextKeepStartIndex),
      requestedRetainedTurnCount,
    };

    return {
      nativeTurnsBefore,
      insertedTurnCount: turnsToInsert.length,
      requestedRetainedTurnCount,
      nextHistoryData,
      nextStats,
    };
  };

  const buildSelectorTupleFromTurnArray = (turnArray, currentTuple) => {
    const nextIds = turnArray
      .map((item) => (item && typeof item === 'object' ? item.id : item))
      .filter((value) => typeof value === 'string' && value);
    return [
      nextIds,
      currentTuple?.[1] ?? null,
      currentTuple?.[2] ?? null,
      currentTuple?.[3] ?? null,
    ];
  };

  const reconcileRenderedWindowWithTurnArray = (conversationId) => {
    const ownerContext = findMountedOwnerContext();
    if (!ownerContext?.conversation || !ownerContext?.ownerFiber) {
      throw new Error(`mounted_owner_unavailable:${conversationId}`);
    }

    const turnArray = findTurnArray(ownerContext.conversation, ownerContext.firstMountedId);
    if (!Array.isArray(turnArray) || turnArray.length < 2) {
      throw new Error(`turn_array_unavailable:${conversationId}`);
    }

    const cacheRow = ownerContext.ownerFiber.updateQueue?.memoCache?.data?.[0];
    const hook0 = getHookAtIndex(ownerContext.ownerFiber, 0);
    const hook4 = getHookAtIndex(ownerContext.ownerFiber, 4);
    const hook18 = getHookAtIndex(ownerContext.ownerFiber, 18);
    if (typeof hook18?.queue?.dispatch !== 'function') {
      throw new Error(`owner_dispatch_unavailable:${conversationId}`);
    }

    const currentTuple = Array.isArray(hook4?.memoizedState)
      ? hook4.memoizedState
      : Array.isArray(hook4?.queue?.value)
        ? hook4.queue.value
        : Array.isArray(cacheRow?.[3])
          ? [cacheRow[3], null, null, null]
          : null;
    const nextTuple = buildSelectorTupleFromTurnArray(turnArray, currentTuple);
    const nextIds = nextTuple[0];
    if (nextIds.length < 2) throw new Error(`rendered_ids_unavailable:${conversationId}`);

    const cache13Len = Array.isArray(cacheRow?.[13]) ? cacheRow[13].length : 0;
    const cache26Len = Array.isArray(cacheRow?.[26]) ? cacheRow[26].length : 0;
    const nativeTurnCount = getNativeTurnCount();
    const expectedNativeTurnCount = Math.max(0, nextIds.length - 1);
    const synced =
      cache13Len === nextIds.length &&
      cache26Len === nextIds.length &&
      Number(cacheRow?.[15]) === nextIds.length &&
      nativeTurnCount >= expectedNativeTurnCount;
    if (synced) {
      return {
        synced: true,
        renderedIdCount: nextIds.length,
        nativeTurnCount,
      };
    }

    if (hook4) hook4.memoizedState = nextTuple;
    if (hook4?.queue) {
      hook4.queue.value = nextTuple;
      hook4.queue.getSnapshot = () => buildSelectorTupleFromTurnArray(
        turnArray,
        Array.isArray(hook4.memoizedState) ? hook4.memoizedState : nextTuple,
      );
    }

    if (
      hook0?.memoizedState &&
      typeof hook0.memoizedState === 'object' &&
      'current' in hook0.memoizedState
    ) {
      hook0.memoizedState.current = nextTuple;
    }

    if (Array.isArray(cacheRow)) {
      const selectorOverride = () => buildSelectorTupleFromTurnArray(
        turnArray,
        Array.isArray(hook4?.memoizedState) ? hook4.memoizedState : nextTuple,
      );
      selectorOverride.__cspLazyFastSelectorOverride = true;
      cacheRow[1] = selectorOverride;
      cacheRow[3] = nextIds;
      cacheRow[13] = undefined;
      cacheRow[15] = nextIds.length;
      cacheRow[26] = undefined;
      cacheRow[27] = undefined;
    }

    hook18.queue.dispatch({
      type: 'csp-lazy-fast-reconcile',
      at: Date.now(),
    });

    return {
      synced: false,
      renderedIdCount: nextIds.length,
      nativeTurnCount,
    };
  };

  const requestInPlaceExpansion = (conversationId, requestedRetainedTurnCount) => {
    const result = performInPlaceExpansion(conversationId, requestedRetainedTurnCount);
    if (result?.noChange) {
      postExpandResult({
        conversationId,
        ok: true,
        noChange: true,
        requestedRetainedTurnCount,
      });
      return;
    }

    const startedAt = Date.now();
    const finish = (ok, details = {}) => {
      if (ok) publishHistoryData(result.nextHistoryData, result.nextStats);
      postExpandResult({
        conversationId,
        ok,
        requestedRetainedTurnCount,
        insertedTurnCount: result.insertedTurnCount,
        nativeTurnsBefore: result.nativeTurnsBefore,
        nativeTurnsAfter: getNativeTurnCount(),
        ...details,
      });
    };

    const tick = () => {
      let reconcileResult = null;
      try {
        reconcileResult = reconcileRenderedWindowWithTurnArray(conversationId);
      } catch (error) {
        finish(false, {
          error: error instanceof Error ? error.message : String(error || 'unknown_error'),
        });
        return;
      }

      if (reconcileResult?.synced) {
        finish(true, {
          renderedIdCount: reconcileResult.renderedIdCount,
        });
        return;
      }

      if (Date.now() - startedAt > 15000) {
        finish(false, {
          error: 'render_window_reconcile_timeout',
          renderedIdCount: reconcileResult?.renderedIdCount ?? null,
        });
        return;
      }

      requestAnimationFrame(() => {
        requestAnimationFrame(tick);
      });
    };

    requestAnimationFrame(() => {
      requestAnimationFrame(tick);
    });
  };

  const formatSegmentLabel = (value) => {
    const normalized = String(value || '')
      .trim()
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .toLowerCase();
    if (!normalized) return 'Rich content';

    const aliases = {
      'image asset pointer': 'Image',
      image: 'Image',
      audio: 'Audio',
      file: 'File',
      attachment: 'Attachment',
      document: 'Document',
      'shared document': 'Shared document',
      artifact: 'Artifact',
      canvas: 'Canvas',
      table: 'Table',
      citation: 'Citation',
      quote: 'Quote',
      tool: 'Tool output',
      'execution output': 'Execution output',
      output: 'Execution output',
    };

    if (aliases[normalized]) return aliases[normalized];
    return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
  };

  const buildRichSummary = (value) => {
    if (!value || typeof value !== 'object') return '';

    const bits = [];
    const push = (candidate) => {
      const text = normalizeText(candidate);
      if (!text || bits.includes(text)) return;
      bits.push(text);
    };

    push(value.title);
    push(value.name);
    push(value.display_name);
    push(value.file_name);
    push(value.filename);
    push(value.mime_type);
    push(value.url);
    if (typeof value.asset_pointer === 'string') push('asset pointer');
    if (typeof value.size_bytes === 'number' && Number.isFinite(value.size_bytes)) {
      push(`${Math.max(1, Math.round(value.size_bytes / 1024))} KB`);
    }
    push(value.status);

    if (!bits.length) {
      const keys = Object.keys(value).filter(Boolean).slice(0, 4);
      if (keys.length) push(`Fields: ${keys.join(', ')}`);
    }

    return bits.join(' • ').slice(0, 240);
  };

  const createRichSegment = (kind, source, fallbackSummary = '') => {
    const richType = normalizeText(kind) || 'rich_content';
    const summary = normalizeText(fallbackSummary) || buildRichSummary(source);
    return {
      type: 'rich',
      richType,
      label: formatSegmentLabel(richType),
      summary,
    };
  };

  const extractSegmentsFromParts = (parts, fallbackType = '') => {
    if (!Array.isArray(parts) || !parts.length) return [];

    const segments = [];
    for (const part of parts) {
      if (typeof part === 'string') {
        const text = normalizeText(part);
        if (text) segments.push({ type: 'text', text });
        continue;
      }

      if (!part || typeof part !== 'object') continue;

      const partType = String(part.content_type || part.type || fallbackType || '').trim();
      if (partType === 'code') {
        const text = normalizeText(part.text || '');
        if (text) {
          segments.push({
            type: 'code',
            text,
            language: typeof part.language === 'string' ? part.language.trim() : '',
          });
          continue;
        }
      }

      if (partType === 'execution_output') {
        const text = normalizeText(part.text || '');
        if (text) {
          segments.push({ type: 'output', text });
          continue;
        }
      }

      const text = normalizeText(part.text || part.caption || part.alt || part.summary || '');
      if (text && (!partType || partType === 'text' || partType === 'paragraph')) {
        segments.push({ type: 'text', text });
        continue;
      }

      segments.push(createRichSegment(partType || fallbackType, part, text));
    }

    return segments;
  };

  const extractSegments = (message) => {
    const content = message?.content || {};
    const contentType = content.content_type || '';

    if (contentType === 'text') {
      const segments = extractSegmentsFromParts(content.parts, 'text');
      if (segments.length) return segments;

      const text = normalizeText(content.text || '');
      return text ? [{ type: 'text', text }] : [];
    }

    if (contentType === 'multimodal_text') {
      const segments = extractSegmentsFromParts(content.parts, 'multimodal_text');
      if (segments.length) return segments;

      const text = normalizeText(content.text || '');
      return text ? [{ type: 'text', text }] : [createRichSegment(contentType, content)];
    }

    if (contentType === 'code') {
      const text = normalizeText(content.text || '');
      return text
        ? [{
            type: 'code',
            text,
            language: typeof content.language === 'string' ? content.language.trim() : '',
          }]
        : [];
    }

    if (contentType === 'execution_output') {
      const text = normalizeText(content.text || '');
      return text ? [{ type: 'output', text }] : [];
    }

    return [createRichSegment(contentType, content)];
  };

  const getRenderableRole = (node) => {
    const message = node?.message;
    if (!message || message.metadata?.is_visually_hidden_from_conversation) return '';

    const role = message.author?.role;
    if (role !== 'user' && role !== 'assistant') return '';

    return extractSegments(message).length ? role : '';
  };

  const getActiveBranchNodeIds = (mapping, currentNodeId) => {
    const branch = [];
    const visited = new Set();
    let nodeId = currentNodeId;

    while (nodeId && mapping?.[nodeId] && !visited.has(nodeId)) {
      visited.add(nodeId);
      branch.push(nodeId);
      nodeId = mapping[nodeId].parent || '';
    }

    branch.reverse();
    return branch;
  };

  const buildBranchHistory = (payload) => {
    if (!payload?.mapping || !payload?.current_node) return null;

    const branchNodeIds = getActiveBranchNodeIds(payload.mapping, payload.current_node);
    if (!branchNodeIds.length) return null;

    const turns = [];
    let currentTurn = null;

    const segmentCounts = {};

    const appendSegment = (role, nodeId, segment) => {
      if (!segment || (segment.type !== 'rich' && !segment.text)) return;
      segmentCounts[segment.type] = (segmentCounts[segment.type] || 0) + 1;

      if (!currentTurn || currentTurn.role !== role) {
        currentTurn = {
          id: nodeId,
          role,
          startNodeId: nodeId,
          nodeIds: [nodeId],
          segments: [segment],
        };
        turns.push(currentTurn);
        return;
      }

      currentTurn.nodeIds.push(nodeId);
      const lastSegment = currentTurn.segments[currentTurn.segments.length - 1];
      if (
        lastSegment &&
        lastSegment.type === segment.type &&
        segment.type !== 'rich' &&
        (lastSegment.language || '') === (segment.language || '')
      ) {
        const separator = segment.type === 'text' ? '\n\n' : '\n';
        lastSegment.text = `${lastSegment.text}${separator}${segment.text}`.trim();
        return;
      }

      currentTurn.segments.push(segment);
    };

    for (const nodeId of branchNodeIds) {
      const node = payload.mapping[nodeId];
      const role = getRenderableRole(node);
      if (!role) continue;

      const segments = extractSegments(node.message);
      if (!segments.length) continue;
      for (const segment of segments) appendSegment(role, nodeId, segment);
    }

    return {
      branchNodeIds,
      turns,
      segmentCounts,
    };
  };

  const buildSyntheticRoot = (rootId, firstChildId) => ({
    id: rootId,
    message: null,
    parent: null,
    children: firstChildId ? [firstChildId] : [],
  });

  const pruneConversationPayload = (payload, responseUrl) => {
    const branchHistory = buildBranchHistory(payload);
    if (!branchHistory) return null;
    cacheFullPayload(payload, branchHistory);

    const { branchNodeIds, turns, segmentCounts } = branchHistory;
    if (branchNodeIds.length < 2 || turns.length < MIN_TURN_COUNT_TO_TRIM) return null;

    const conversationId = payload.conversation_id || '';
    const requestedRetainedTurnCount = readRequestedRetainedTurnCount(conversationId);

    let keepTurnIndex = Math.max(0, turns.length - requestedRetainedTurnCount);
    if (turns[keepTurnIndex]?.role === 'assistant' && keepTurnIndex > 0) {
      keepTurnIndex -= 1;
    }

    const keepStartNodeId = turns[keepTurnIndex]?.startNodeId;
    const keepStartIndex = branchNodeIds.indexOf(keepStartNodeId);
    if (keepStartIndex <= 0) return null;

    const keptBranchNodeIds = branchNodeIds.slice(keepStartIndex);
    if (keptBranchNodeIds.length >= branchNodeIds.length) return null;

    const keptNodeIdSet = new Set(keptBranchNodeIds);
    const syntheticRootId = `csp-lazy-fast-root-${payload.current_node}`;
    const nextMapping = {
      [syntheticRootId]: buildSyntheticRoot(syntheticRootId, keptBranchNodeIds[0] || ''),
    };

    for (const nodeId of keptBranchNodeIds) {
      const sourceNode = payload.mapping[nodeId];
      if (!sourceNode) continue;

      const nextNode = cloneNode(sourceNode);
      nextNode.parent =
        nodeId === keptBranchNodeIds[0]
          ? syntheticRootId
          : keptNodeIdSet.has(sourceNode.parent)
            ? sourceNode.parent
            : syntheticRootId;
      nextNode.children = Array.isArray(sourceNode.children)
        ? sourceNode.children.filter((childId) => keptNodeIdSet.has(childId))
        : [];
      nextMapping[nodeId] = nextNode;
    }

    const nextPayload = {
      ...payload,
      mapping: nextMapping,
    };

    const historyData = {
      conversationId: payload.conversation_id || '',
      title: typeof payload.title === 'string' ? payload.title : '',
      keptStartIndex: keepTurnIndex,
      requestedRetainedTurnCount,
      totalTurnCount: turns.length,
      turns: turns.map((turn) => ({
        id: turn.id,
        role: turn.role,
        startNodeId: turn.startNodeId,
        nodeIds: [...turn.nodeIds],
        segments: turn.segments.map((segment) => ({ ...segment })),
      })),
      segmentCounts: { ...segmentCounts },
    };

    const stats = {
      url: responseUrl,
      conversationId: payload.conversation_id || '',
      totalTurns: turns.length,
      keptTurns: turns.length - keepTurnIndex,
      totalBranchNodes: branchNodeIds.length,
      keptBranchNodes: keptBranchNodeIds.length + 1,
      keptStartIndex: keepTurnIndex,
      currentNode: payload.current_node,
      requestedRetainedTurnCount,
      segmentCounts: { ...segmentCounts },
    };

    return {
      payload: nextPayload,
      historyData,
      stats,
    };
  };

  const shouldAttemptPrune = (requestUrl, response) => {
    if (!response?.ok) return false;
    if ((response.headers.get('content-type') || '').toLowerCase().indexOf('application/json') === -1) {
      return false;
    }

    const conversationIdOnPage = getConversationIdFromPath();
    const absoluteUrl = toAbsoluteUrl(response.url || requestUrl);
    if (!absoluteUrl) return false;

    let parsedUrl;
    try {
      parsedUrl = new URL(absoluteUrl);
    } catch {
      return false;
    }

    const match = parsedUrl.pathname.match(CONVERSATION_PATH_RE);
    if (!match) return false;

    if (!conversationIdOnPage) return true;
    return conversationIdOnPage === match[1];
  };

  const buildRewrittenResponse = (response, payloadText) => {
    const headers = new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('content-encoding');
    headers.set('content-type', 'application/json; charset=utf-8');

    const rewritten = new Response(payloadText, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });

    try {
      Object.defineProperty(rewritten, 'url', {
        value: response.url,
        configurable: true,
      });
    } catch { }

    return rewritten;
  };

  const publishHistoryData = (historyData, stats) => {
    let node = document.getElementById(HISTORY_DATA_NODE_ID);
    if (!(node instanceof HTMLScriptElement)) {
      node = document.createElement('script');
      node.id = HISTORY_DATA_NODE_ID;
      node.type = 'application/json';
      (document.documentElement || document.head).appendChild(node);
    }

    const serialized = JSON.stringify({
      ...historyData,
      stats,
    });
    node.textContent = serialized;

    window.__cspLazyFastLastHistory = historyData;
    window.__cspLazyFastLastPrune = stats;
    window.postMessage(
      {
        source: HISTORY_MESSAGE_SOURCE,
        payload: {
          ...historyData,
          stats,
        },
      },
      location.origin,
    );

    ensureAutoExpandScrollBinding();
  };

  const shouldBypassTrimOnce = () => {
    try {
      if (localStorage.getItem(BYPASS_KEY) !== 'true') return false;
      localStorage.removeItem(BYPASS_KEY);
      return true;
    } catch {
      return false;
    }
  };

  const originalFetch = window.fetch;
  if (typeof originalFetch !== 'function') return;

  window.fetch = async function (...args) {
    const [input] = args;
    const requestUrl =
      typeof input === 'string'
        ? input
        : input instanceof Request
          ? input.url
          : typeof input?.url === 'string'
            ? input.url
            : '';

    const response = await originalFetch.apply(this, args);
    if (!shouldAttemptPrune(requestUrl, response)) return response;
    if (shouldBypassTrimOnce()) {
      console.info(`${LOG_PREFIX} bypassing trim for one reload.`);
      return response;
    }

    try {
      const payload = await response.clone().json();
      const result = pruneConversationPayload(payload, response.url || requestUrl);
      if (!result?.payload || !result.historyData) return response;

      publishHistoryData(result.historyData, result.stats);

      const payloadText = JSON.stringify(result.payload);
      console.info(
        `${LOG_PREFIX} kept ${result.stats.keptTurns}/${result.stats.totalTurns} turns and ${result.stats.keptBranchNodes}/${result.stats.totalBranchNodes} branch nodes for ${result.stats.conversationId || 'conversation'}.`,
        result.stats,
      );
      window.dispatchEvent(
        new CustomEvent('csp:lazy-fast-pruned', {
          detail: result.stats,
        }),
      );
      return buildRewrittenResponse(response, payloadText);
    } catch (error) {
      console.warn(`${LOG_PREFIX} prune skipped after error.`, error);
      return response;
    }
  };

  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    if (event.data?.source !== EXPAND_REQUEST_SOURCE) return;

    const conversationId =
      typeof event.data?.conversationId === 'string' ? event.data.conversationId.trim() : '';
    const requestedRetainedTurnCount = Math.max(
      RETAINED_TURN_COUNT,
      Math.floor(Number(event.data?.requestedRetainedTurnCount) || RETAINED_TURN_COUNT),
    );
    if (!conversationId) return;

    try {
      requestInPlaceExpansion(conversationId, requestedRetainedTurnCount);
    } catch (error) {
      postExpandResult({
        conversationId,
        ok: false,
        requestedRetainedTurnCount,
        error: error instanceof Error ? error.message : String(error || 'unknown_error'),
      });
    }
  });

  window.addEventListener(
    'wheel',
    (event) => {
      if (!(event instanceof WheelEvent)) return;
      if (event.deltaY >= 0) return;
      ensureAutoExpandScrollBinding();
      if (!(autoExpandState.scrollRoot instanceof Element)) return;
      if ((Number(autoExpandState.scrollRoot.scrollTop) || 0) > AUTO_EXPAND_TOP_THRESHOLD_PX) return;
      postAutoExpandIntent('scroll_root_wheel_top_bridge');
    },
    { passive: true, capture: true },
  );

  console.info(`${LOG_PREFIX} bridge installed.`);
})();
