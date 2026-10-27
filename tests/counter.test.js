"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { parseQuotes, extractCount } = require("../lib/counter");

test("counts the copied source, including whitespace and Unicode", () => {
  assert.deepEqual(extractCount("A 😀\n中"), { chars: 6, codePoints: 5, words: 3, withoutWhitespace: 4 });
  assert.deepEqual(extractCount(" \n\t"), { chars: 3, codePoints: 3, words: 0, withoutWhitespace: 0 });
});

test("groups explicit quoted paragraphs and preserves their exact text", () => {
  const [block] = parseQuotes("# Excerpt\n\n> **Example.**  \n>\n> $x > 0$\n");
  assert.equal(block.text, "**Example.**  \n\n$x > 0$");
  assert.equal(block.label, "Excerpt");
  assert.equal(block.startLine, 2);
  assert.equal(block.endLine, 4);
  assert.equal(block.index, 1);
  assert.equal(block.chars, block.text.length);
});

test("unquoted blanks separate independent blocks", () => {
  const blocks = parseQuotes("> One\n\n> Two\n\n## Section B ##\n> Three");
  assert.deepEqual(blocks.map(({ index, label, text }) => ({ index, label, text })), [
    { index: 1, label: "引用 1", text: "One" },
    { index: 2, label: "引用 2", text: "Two" },
    { index: 3, label: "Section B", text: "Three" },
  ]);
});

test("removes exactly one outer level and one separator, preserving nested markup", () => {
  const [block] = parseQuotes("  >  indented\n>>> nested\n>\tTabbed\n>");
  assert.equal(block.text, " indented\n>> nested\nTabbed\n");
});

test("normalizes CRLF without adding or trimming a newline", () => {
  assert.equal(parseQuotes("> First\r\n> Second\r\n")[0].text, "First\nSecond");
  assert.equal(parseQuotes("> First\r\n>\r\n")[0].text, "First\n");
});

test("callout metadata is not copied or counted and supplies the label", () => {
  const [block] = parseQuotes("## External\n> [!tip]- Note title\n> **Thanks.**\n>\n> Explanation");
  assert.equal(block.label, "Note title");
  assert.equal(block.text, "**Thanks.**\n\nExplanation");
  assert.equal(block.startLine, 1);
  assert.equal(block.endLine, 4);
  assert.equal(parseQuotes("> [!tip]+\n> Text")[0].label, "tip");
  assert.equal(parseQuotes("# Section\n> [!quote]\n> Text")[0].label, "Section");
});

test("only the first line can be callout metadata", () => {
  assert.equal(parseQuotes("> First\n> [!note] literal")[0].text, "First\n[!note] literal");
  assert.equal(parseQuotes("> [!tip] Section")[0].text, "");
});

test("ignores YAML frontmatter and fenced code, retaining source line offsets", () => {
  const source = ["---", "value: |", "  > yaml", "---", "```md", "> code", "````", "~~~", "> more code", "~~~", "> Actual"].join("\n");
  const blocks = parseQuotes(source);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].text, "Actual");
  assert.equal(blocks[0].startLine, 10);
  assert.equal(parseQuotes("---\n> actual")[0].text, "actual");
});

test("a shorter or different fence cannot close a code block", () => {
  const blocks = parseQuotes("````\n```\n> not quote\n~~~\n> still code\n````\n> yes");
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].text, "yes");
});

test("includes lazy paragraph continuations, but stops at block boundaries", () => {
  const blocks = parseQuotes("> Paragraph\nlazy continuation\n## Next\n> Text\n- external list\n> Last\n```\n> code\n```");
  assert.deepEqual(blocks.map(b => b.text), ["Paragraph\nlazy continuation", "Text", "Last"]);
  assert.equal(blocks[1].label, "Next");
});

test("quoted empty lines, headings, and code do not admit lazy continuation", () => {
  assert.equal(parseQuotes("> Paragraph\n>\noutside")[0].text, "Paragraph\n");
  assert.equal(parseQuotes("> # Quoted heading\noutside")[0].text, "# Quoted heading");
  assert.equal(parseQuotes("> ```\n> > inside code\n> ```\noutside")[0].text, "```\n> inside code\n```");
});

test("ignores code indentation, escaped quote markers and comparison operators", () => {
  assert.equal(parseQuotes("    > code\n\t> code\n\\> escaped\nx > y").length, 0);
  assert.equal(parseQuotes("   > valid")[0].text, "valid");
});

test("ignores comments and raw HTML blocks", () => {
  assert.deepEqual(parseQuotes("<!--\n> comment\n-->\n<script>\n> text\n</script>\n<div>\n> html\n</div>\n\n> actual").map(b => b.text), ["actual"]);
});

test("ignores hidden text in standalone Obsidian comment blocks", () => {
  const blocks = parseQuotes("> first\n%%\n> hidden\n%%\n%% another comment %%\n> current");
  assert.deepEqual(blocks.map(block => block.text), ["first", "current"]);
  assert.equal(blocks[1].startLine, 5);
  assert.equal(parseQuotes("> %% quoted source comment %%\n> Text")[0].text, "%% quoted source comment %%\nText");
});

test("recognizes external setext headings as block labels", () => {
  assert.equal(parseQuotes("Note title\n---\n\n> Text")[0].label, "Note title");
});

test("handles empty notes and empty quoted blocks", () => {
  assert.deepEqual(parseQuotes(""), []);
  const [empty] = parseQuotes(">");
  assert.equal(empty.text, "");
  assert.equal(empty.chars, 0);
});
