// Run via Obsidian CLI eval after installing the current build.
// Creates a unique temporary note, never touches existing notes,
// and restores settings, closes its own tab and trashes its note in finally.
(async () => {
  const plugin = app.plugins.plugins["blockquote-counter"];
  if (!plugin) throw new Error("Enable Blockquote Counter first.");
  const savedSettings = { ...plugin.settings };
  const originalLeaf = app.workspace.activeLeaf;
  const report = [];
  let testFile = null;
  let testLeaf = null;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const expect = (condition, label) => {
    if (!condition) throw new Error(`${label}; completed checks: ${report.join(" | ")}`);
    report.push(label);
  };
  const waitFor = async (predicate, label) => {
    for (let attempt = 0; attempt < 24; attempt++) {
      if (predicate()) return;
      await sleep(150);
    }
    throw new Error(`Timed out: ${label}; completed checks: ${report.join(" | ")}`);
  };
  const sourceRoot = () => testLeaf.view.contentEl.querySelector(".cm-content");
  const previewRoot = () => testLeaf.view.contentEl.querySelector(".markdown-preview-view");
  const topCallouts = root => [...(root?.querySelectorAll(".callout") || [])]
    .filter(node => !node.parentElement?.closest(".callout, blockquote"));
  const liveBadge = node => node.querySelector(":scope > .callout-title > [data-bqc-callout-badge]");
  const badgeNumber = badge => {
    const match = badge?.textContent.match(/^([\d,]+)/);
    return match ? Number(match[1].replace(/,/g, "")) : null;
  };
  const visible = element => {
    if (!element || !element.isConnected) return false;
    const style = element.ownerDocument.defaultView.getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && element.getBoundingClientRect().height > 0;
  };
  const liveCounts = () => topCallouts(sourceRoot()).map(node => badgeNumber(liveBadge(node)));
  const countsEqual = (actual, expected) => JSON.stringify(actual) === JSON.stringify(expected);
  const awaitCounts = (expected, label) => waitFor(() => countsEqual(liveCounts(), expected), label);

  const firstBody = "A **bold** $x$ 😀";
  const secondBody = "Longer excerpt.\n\nSecond paragraph.";
  const thirdBody = "Hidden body.\n> [!note] Nested\n> Inner text.";
  const quoteLines = body => body.split("\n").map(line => "> " + line).join("\n");
  let source = [
    "# Callout regression", "",
    "> [!quote] Same note title", quoteLines(firstBody), "",
    "> [!info] Same note title", quoteLines(secondBody), "",
    "> [!warning]- Folded note", quoteLines(thirdBody), "",
    "End of temporary test note."
  ].join("\n");
  const expected = [firstBody.length, secondBody.length, thirdBody.length];

  try {
    await plugin.changeSettings({ limit: 2000, countMode: "utf16", inlineBadges: true });
    let path;
    do {
      path = `blockquote-counter-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.md`;
    } while (app.vault.getAbstractFileByPath(path));
    testFile = await app.vault.create(path, source);
    testLeaf = app.workspace.getLeaf("tab");
    // Cold open directly in Live Preview: do not visit reading mode first.
    await testLeaf.openFile(testFile, { active: true, state: { mode: "source", source: false } });
    app.workspace.setActiveLeaf(testLeaf, { focus: true });
    testLeaf.view.editor.setCursor({ line: 0, ch: 0 });
    await awaitCounts(expected, "cold-open callout badges");
    expect(testLeaf.view.getMode() === "source", "Cold-open Live Preview shows all three callout counts");
    expect(countsEqual(liveCounts(), expected), "Same-name callouts map to their own source and preserve Markdown, math and emoji counts");
    let calls = topCallouts(sourceRoot());
    expect(calls.every(node => node.querySelectorAll("[data-bqc-callout-badge]").length === 1), "Only the outer callout is counted; nested callout has no duplicate badge");
    expect(calls[2].classList.contains("is-collapsed") && visible(liveBadge(calls[2])), "Folded callout keeps its count visible in the title");

    source = source.replace(firstBody, firstBody + "!");
    expected[0]++;
    testLeaf.view.editor.setValue(source);
    testLeaf.view.editor.setCursor({ line: 0, ch: 0 });
    await awaitCounts(expected, "body edit");
    expect(countsEqual(liveCounts(), expected), "Editing a callout updates its visible count");

    source = "Prefix outside the callouts.\n\n" + source;
    testLeaf.view.editor.setValue(source);
    testLeaf.view.editor.setCursor({ line: 0, ch: 0 });
    await awaitCounts(expected, "line insertion before callouts");
    expect(countsEqual(liveCounts(), expected), "Inserting lines before the callouts preserves source mapping");

    await plugin.changeSettings({ inlineBadges: false });
    await waitFor(() => topCallouts(sourceRoot()).every(node => !visible(liveBadge(node))), "disable badges");
    expect(topCallouts(sourceRoot()).every(node => !visible(liveBadge(node))), "Turning inline counts off hides callout badges");
    await plugin.changeSettings({ inlineBadges: true });
    await awaitCounts(expected, "re-enable badges");
    expect(topCallouts(sourceRoot()).every(node => visible(liveBadge(node))), "Turning inline counts on restores callout badges");

    await plugin.changeSettings({ countMode: "codepoints" });
    await awaitCounts([expected[0] - 1, expected[1], expected[2]], "Unicode code point setting");
    expect(liveCounts()[0] === expected[0] - 1, "Callout badges respond to Unicode count-mode changes");
    await plugin.changeSettings({ countMode: "utf16" });
    await awaitCounts(expected, "restore UTF-16 count setting");

    source = source.replace("[!warning]-", "[!warning]+");
    testLeaf.view.editor.setValue(source);
    testLeaf.view.editor.setCursor({ line: 0, ch: 0 });
    await waitFor(() => {
      const callouts = topCallouts(sourceRoot());
      return callouts.length === 3 && !callouts[2].classList.contains("is-collapsed") && countsEqual(liveCounts(), expected);
    }, "expanded callout");
    calls = topCallouts(sourceRoot());
    expect(calls[2].querySelectorAll("[data-bqc-callout-badge]").length === 1, "Expanded nested callout still has exactly one outer count");
    source = source.replace("[!warning]+", "[!warning]-");
    testLeaf.view.editor.setValue(source);
    testLeaf.view.editor.setCursor({ line: 0, ch: 0 });
    await waitFor(() => {
      const callouts = topCallouts(sourceRoot());
      return callouts.length === 3 && callouts[2].classList.contains("is-collapsed") && visible(liveBadge(callouts[2]));
    }, "fold callout again");
    expect(countsEqual(liveCounts(), expected), "Refolding retains correct title counts");
    expect(testLeaf.view.editor.getValue() === source, "Decorations never enter the Markdown source");

    // Persist only this temporary fixture before exercising reading-mode parsing.
    await app.vault.modify(testFile, source);
    await testLeaf.openFile(testFile, { active: true, state: { mode: "preview" } });
    await waitFor(() => {
      const callouts = topCallouts(previewRoot());
      return callouts.length === 3 && callouts.every(node => node.querySelectorAll(".bqc-badge").length === 1);
    }, "reading-mode callout badges");
    calls = topCallouts(previewRoot());
    expect(testLeaf.view.getMode() === "preview" && countsEqual(calls.map(node => badgeNumber(node.querySelector(".bqc-badge"))), expected), "Reading mode shows correct counts without duplicate live-preview badges");
    expect(visible(calls[2].querySelector(":scope > .callout-title .bqc-badge")), "Reading-mode folded callout also retains its title count");

    await testLeaf.openFile(testFile, { active: true, state: { mode: "source", source: false } });
    testLeaf.view.editor.setCursor({ line: 0, ch: 0 });
    await awaitCounts(expected, "return to Live Preview");
    expect(topCallouts(sourceRoot()).every(node => node.querySelectorAll(".bqc-badge").length === 1), "Returning to Live Preview does not duplicate counts");
    expect(testLeaf.view.editor.getValue() === source, "Source remains unchanged after both view-mode transitions");
    return report;
  } finally {
    // Close the fixture before trashing it so a deferred editor save cannot recreate it.
    if (testLeaf) testLeaf.detach();
    if (testFile && app.vault.getAbstractFileByPath(testFile.path)) await app.vault.trash(testFile, true);
    await plugin.changeSettings(savedSettings);
    if (originalLeaf) app.workspace.setActiveLeaf(originalLeaf, { focus: false });
    await plugin.refresh();
  }
})()
