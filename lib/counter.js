"use strict";

/** Count the exact text offered by the plugin's copy action. */
function extractCount(value) {
  const text = String(value ?? "");
  return {
    chars: text.length,
    codePoints: Array.from(text).length,
    words: (text.match(/\S+/gu) || []).length,
    withoutWhitespace: text.replace(/\s/gu, "").length,
  };
}

const QUOTE_PREFIX = /^ {0,3}>[\t ]?/;
const CALLOUT_HEADER = /^\[!([\w-]+)\][+-]?(?:[\t ]+(.*))?[\t ]*$/;

function openingFence(line) {
  const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
  if (!match || (match[1][0] === "`" && match[2].includes("`"))) return null;
  return { marker: match[1][0], length: match[1].length };
}

function closesFence(line, fence) {
  const match = /^ {0,3}(`+|~+)[\t ]*$/.exec(line);
  return !!match && match[1][0] === fence.marker && match[1].length >= fence.length;
}

function heading(line) {
  const match = /^ {0,3}#{1,6}(?:[\t ]+(.*)|[\t ]*)$/.exec(line);
  return match ? (match[1] || "").replace(/[\t ]+#+[\t ]*$/, "").trim() : null;
}

function thematicBreak(line) {
  return /^ {0,3}(?:(?:\*[\t ]*){3,}|(?:-[\t ]*){3,}|(?:_[\t ]*){3,})$/.test(line);
}

function interruptsParagraph(line) {
  return heading(line) !== null || !!openingFence(line) || thematicBreak(line) ||
    /^ {0,3}(?:[-+*][\t ]|1[.)][\t ])/u.test(line) ||
    /^ {0,3}<(?:!--|\?|!\[CDATA\[|![A-Z]|\/?(?:address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|pre|script|search|section|source|style|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)(?:[\t />]|$))/i.test(line);
}

// Only a paragraph can continue lazily without a leading `>` in CommonMark.
// This deliberately does not infer quoted indented-code or nested-list containers.
function updateQuoteContext(state, content) {
  let inner = content;
  while (QUOTE_PREFIX.test(inner)) inner = inner.replace(QUOTE_PREFIX, "");
  if (state.fence) {
    if (closesFence(inner, state.fence)) state.fence = null;
    state.paragraph = false;
    return;
  }
  const fence = openingFence(inner);
  if (fence) {
    state.fence = fence;
    state.paragraph = false;
  } else if (!inner.trim() || heading(inner) !== null || thematicBreak(inner) || /^ {0,3}(?:=+|-+)[\t ]*$/.test(inner)) {
    state.paragraph = false;
  } else if (/^ {0,3}(?:[-+*]|\d+[.)])[\t ]+/.test(inner)) {
    state.paragraph = true;
  } else if (interruptsParagraph(inner)) {
    state.paragraph = false;
  } else if (!state.paragraph && /^(?: {4}|\t)/.test(inner)) {
    state.paragraph = false;
  } else {
    state.paragraph = true;
  }
}

function startHtmlBlock(line) {
  if (/^ {0,3}<!--/.test(line)) return /-->/;
  if (/^ {0,3}<\?/.test(line)) return /\?>/;
  if (/^ {0,3}<!\[CDATA\[/.test(line)) return /\]\]>/;
  if (/^ {0,3}<![A-Z]/.test(line)) return />/;
  const rawTag = /^ {0,3}<(script|pre|style|textarea)(?:[\t >]|$)/i.exec(line);
  if (rawTag) return new RegExp(`</${rawTag[1]}>`, "i");
  if (/^ {0,3}</.test(line) && interruptsParagraph(line)) return /^\s*$/;
  return null;
}

/**
 * Return top-level `>` containers with zero-based inclusive source line ranges.
 * One outer quote marker and at most one separator space/tab are removed.
 * All other source characters are retained, including nested quote markers,
 * Markdown, trailing whitespace and explicit quoted blank lines. CRLF becomes LF.
 * A first-line Obsidian callout marker/title is container metadata, not block content.
 *
 * Ordinary lazy paragraph continuations are supported. This is intentionally a
 * small source parser, not a complete Markdown AST: quotes inside list containers
 * and unusual HTML/list nesting should be written as explicit top-level `>` lines.
 */
function parseQuotes(value) {
  const lines = String(value ?? "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let nearestHeading = "";
  let fence = null;
  let htmlEnd = null;
  let obsidianComment = false;
  let active = null;
  let firstLine = 0;

  if (/^\uFEFF?---[\t ]*$/.test(lines[0])) {
    const closing = lines.findIndex((line, i) => i > 0 && /^(?:---|\.\.\.)[\t ]*$/.test(line));
    if (closing > 0) firstLine = closing + 1;
  }

  function finish() {
    if (!active) return;
    const index = blocks.length + 1;
    const text = active.lines.join("\n");
    blocks.push({
      index,
      startLine: active.startLine,
      endLine: active.endLine,
      text,
      label: active.label || `引用 ${index}`,
      ...extractCount(text),
    });
    active = null;
  }

  for (let i = firstLine; i < lines.length; i++) {
    const line = lines[i];
    if (fence) {
      if (closesFence(line, fence)) fence = null;
      continue;
    }
    if (htmlEnd) {
      if (htmlEnd.test(line)) htmlEnd = null;
      continue;
    }
    // Standalone Obsidian comment blocks often contain archived text.
    // A comment explicitly inside `>` remains part of the source being copied.
    if (obsidianComment || /^ {0,3}%%/.test(line)) {
      finish();
      if (((line.match(/%%/g) || []).length % 2) === 1) obsidianComment = !obsidianComment;
      continue;
    }

    const prefix = QUOTE_PREFIX.exec(line);
    if (prefix) {
      const content = line.slice(prefix[0].length);
      if (!active) {
        active = { startLine: i, endLine: i, lines: [], label: nearestHeading, paragraph: false, fence: null };
        const callout = CALLOUT_HEADER.exec(content);
        if (callout) {
          active.label = (callout[2] || "").trim() || nearestHeading || callout[1];
          continue;
        }
      }
      active.endLine = i;
      active.lines.push(content);
      updateQuoteContext(active, content);
      continue;
    }

    if (active && active.paragraph && line.trim() && !interruptsParagraph(line)) {
      active.lines.push(line);
      active.endLine = i;
      continue;
    }
    finish();

    fence = openingFence(line);
    if (fence) continue;
    htmlEnd = startHtmlBlock(line);
    if (htmlEnd) {
      if (htmlEnd.test(line)) htmlEnd = null;
      continue;
    }
    const title = heading(line);
    if (title !== null) nearestHeading = title;
    else if (line.trim() && i + 1 < lines.length && /^ {0,3}(?:=+|-+)[\t ]*$/.test(lines[i + 1])) {
      nearestHeading = line.trim();
      i++;
    }
  }
  finish();
  return blocks;
}

module.exports = { parseQuotes, extractCount };
