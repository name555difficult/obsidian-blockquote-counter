# Blockquote Counter

[简体中文](README.zh-CN.md)

Count the text inside each top-level blockquote and callout in Obsidian. See character counts while writing, track a configurable limit, and copy the exact text being counted.

## Features

- Character badges in Live Preview, Source mode, and Reading view.
- Callout counts in the title bar, visible even when the body is folded.
- A sidebar with one card per block, remaining characters, a progress bar, and text preview.
- Copy a block's Markdown body or jump to its source.
- UTF-16 or Unicode code-point counting, plus whitespace-separated word counts and a whitespace-free character count.
- A configurable character limit, set to **2,000** by default. Badges warn at **90%** and turn red above the limit.

## Install

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/name555difficult/obsidian-blockquote-counter/releases/latest).
2. Create `.obsidian/plugins/blockquote-counter/` inside your vault and place all three files there.
3. Reload Obsidian, then enable **Blockquote Counter** in **Settings → Community plugins**.

This is a manual installation. The plugin is not listed in Obsidian's community plugin directory.

## Use

Put each independent text block in a top-level blockquote. A heading before the block becomes its label in the sidebar.

```markdown
## Writing excerpt

> The first paragraph goes here.
>
> The next paragraph belongs to the same block.

## Travel checklist

> [!note] Packing list
> - Notebook
> - Water bottle
```

Keep a `>` on blank lines **inside** a block. An unquoted blank line ends the counted block, so the next blockquote receives its own count. Callout types such as `note`, `tip`, and `quote` work the same way.

Open the command palette and choose **Blockquote Counter: 打开引用块统计** to open the sidebar. You can also use the ribbon icon or the status bar. The sidebar's **复制正文** button copies the counted text, and **定位** jumps to the block. The command **复制光标所在引用块正文** copies the block containing the cursor in an editor.

The current interface uses Chinese labels. See [example.md](example.md) for a note you can open in Obsidian.

## What gets counted

The plugin counts **Markdown source**, rather than rendered text. The copy action uses the same text as the counter.

| Content | Behavior |
| --- | --- |
| One outer `>` and up to one following space or tab | Removed |
| First-line callout marker and title, such as `[!note] Packing list` | Removed |
| Headings and text outside the block | Excluded |
| Spaces, tabs, line breaks, and trailing spaces in the body | Included |
| Markdown formatting, link syntax, and math source | Included |
| Nested quote markers and nested callout text | Included in the outer block; not counted independently |

`CRLF` and `CR` line endings are normalized to `LF`. Each normalized newline counts as one character. No final newline is added and no body whitespace is trimmed; an explicit final quoted blank line is preserved.

**UTF-16**, the default, counts most ordinary letters and Chinese characters as one unit and many emoji as two. **Unicode code points** count those emoji as one, but combined emoji and combining marks can still occupy multiple code points. Neither mode is a count of visible glyphs. The sidebar shows both numbers when they differ.

Word counts split on whitespace. They are a rough aid for languages such as English, not Chinese word segmentation. The whitespace-free character count always uses UTF-16 and does not replace the selected character budget.

## Scope

The parser supports top-level `>` blocks and ordinary paragraph continuation lines without a marker. For predictable boundaries, use an explicit `>` on every line inside a block.

Frontmatter, fenced code examples, and standalone outer comment blocks are excluded. Source comments inside an explicitly quoted body are kept and counted. Quotes inside list containers and unusual mixtures of HTML and Markdown are outside the parser's full coverage.

If the text changes immediately before a sidebar copy action, the plugin refreshes the count and asks you to click again instead of copying an outdated snapshot.

## Settings

Open **Settings → Blockquote Counter** to change the character limit, warning percentage, counting mode, or inline badge visibility.

## Privacy

The plugin runs locally and makes no network requests. It does not rewrite notes or store their contents. It saves its settings and writes the selected block body to the clipboard only when you use a copy action.

## Development

Use Node.js 18 or newer. There are no packages to install for building or running the unit tests; Obsidian supplies the runtime APIs.

```sh
npm test
npm run check
npm run build
```

Edit `src/main.js` and `lib/counter.js`, then build to regenerate `main.js`. Install the generated `main.js` together with `manifest.json` and `styles.css` in a test vault.

See the [Obsidian developer documentation](https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin) and [Obsidian API](https://github.com/obsidianmd/obsidian-api) for host APIs.
