import type { ContentMessage, DomMutation, DomMutationPayload } from "./types.js";

const BATCH_INTERVAL_MS = 1000;

let pendingMutations: DomMutation[] = [];
let batchTimer: ReturnType<typeof setTimeout> | null = null;

function serializeMutationRecord(record: MutationRecord): DomMutation | null {
  const target = cssPath(record.target);

  switch (record.type) {
    case "childList": {
      const added = Array.from(record.addedNodes)
        .filter((n): n is Element => n.nodeType === Node.ELEMENT_NODE)
        .map((el) => el.outerHTML);
      const removed = Array.from(record.removedNodes)
        .filter((n): n is Element => n.nodeType === Node.ELEMENT_NODE)
        .map((el) => el.outerHTML);

      if (added.length === 0 && removed.length === 0) return null;

      return {
        target,
        type: "childList",
        addedNodes: added.length > 0 ? added : undefined,
        removedNodes: removed.length > 0 ? removed : undefined,
      };
    }
    case "attributes":
      return {
        target,
        type: "attributes",
        attributeName: record.attributeName ?? undefined,
        oldValue: record.oldValue,
        newValue: (record.target as Element).getAttribute(record.attributeName ?? "") ?? null,
      };
    case "characterData":
      return {
        target,
        type: "characterData",
        oldValue: record.oldValue,
        newValue: record.target.textContent,
      };
    default:
      return null;
  }
}

function cssPath(node: Node): string {
  if (node.nodeType !== Node.ELEMENT_NODE) {
    return node.parentElement ? cssPath(node.parentElement) : "document";
  }

  const el = node as Element;
  if (el.id) return `#${el.id}`;

  const parts: string[] = [];
  let current: Element | null = el;

  while (current && current !== document.documentElement) {
    let selector = current.tagName.toLowerCase();
    if (current.id) {
      parts.unshift(`#${current.id}`);
      break;
    }
    if (current.className && typeof current.className === "string") {
      const cls = current.className.trim().split(/\s+/).slice(0, 2).join(".");
      if (cls) selector += `.${cls}`;
    }
    parts.unshift(selector);
    current = current.parentElement;
  }

  return parts.join(" > ");
}

function flushBatch(): void {
  if (pendingMutations.length === 0) return;

  const payload: DomMutationPayload = {
    url: window.location.href,
    mutations: pendingMutations.splice(0),
  };

  const message: ContentMessage = {
    action: "DOM_MUTATIONS",
    payload,
  };

  try {
    chrome.runtime.sendMessage(message);
  } catch {
    // Extension context invalidated (e.g., during update)
  }
}

function scheduleBatch(): void {
  if (batchTimer) return;
  batchTimer = setTimeout(() => {
    batchTimer = null;
    flushBatch();
  }, BATCH_INTERVAL_MS);
}

const observer = new MutationObserver((records) => {
  for (const record of records) {
    const serialized = serializeMutationRecord(record);
    if (serialized) {
      pendingMutations.push(serialized);
    }
  }
  if (pendingMutations.length > 0) {
    scheduleBatch();
  }
});

if (document.body) {
  observer.observe(document.body, {
    childList: true,
    attributes: true,
    characterData: true,
    subtree: true,
    attributeOldValue: true,
    characterDataOldValue: true,
  });
}
