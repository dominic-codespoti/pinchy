# playwright-cli Command Reference

## Core commands

```bash
playwright-cli open [url]               # open browser, optionally navigate to url
playwright-cli goto <url>               # navigate to a url
playwright-cli close                    # close the page
playwright-cli type <text>              # type text into editable element
playwright-cli click <ref>              # click element by ref from snapshot
playwright-cli dblclick <ref>           # double click
playwright-cli fill <ref> <text>        # fill text into editable element
playwright-cli drag <startRef> <endRef> # drag and drop between two elements
playwright-cli hover <ref>              # hover over element
playwright-cli select <ref> <val>       # select an option in a dropdown
playwright-cli upload <file>            # upload file(s)
playwright-cli check <ref>              # check a checkbox or radio button
playwright-cli uncheck <ref>            # uncheck a checkbox or radio button
playwright-cli snapshot                 # capture page snapshot to obtain element refs
playwright-cli eval <func> [ref]        # evaluate JavaScript expression
playwright-cli dialog-accept [prompt]   # accept a dialog
playwright-cli dialog-dismiss           # dismiss a dialog
playwright-cli resize <w> <h>           # resize the browser window
```

## Navigation

```bash
playwright-cli go-back                  # go back
playwright-cli go-forward               # go forward
playwright-cli reload                   # reload current page
```

## Keyboard

```bash
playwright-cli press <key>              # press a key (Enter, ArrowDown, etc.)
playwright-cli keydown <key>            # key down
playwright-cli keyup <key>              # key up
```

## Save as

```bash
playwright-cli screenshot               # screenshot of current page
playwright-cli screenshot <ref>         # screenshot of specific element
playwright-cli screenshot --filename=f  # save with specific filename
playwright-cli pdf --filename=page.pdf  # save page as PDF
```

## Tabs

```bash
playwright-cli tab-list                 # list all tabs
playwright-cli tab-new [url]            # create a new tab
playwright-cli tab-close [index]        # close a tab
playwright-cli tab-select <index>       # select a tab
```

## Example: Form submission

```bash
playwright-cli open https://example.com/form
playwright-cli snapshot
playwright-cli fill e1 "user@example.com"
playwright-cli fill e2 "password123"
playwright-cli click e3
playwright-cli snapshot
playwright-cli close
```

## Example: Research a topic

```bash
playwright-cli open https://news.ycombinator.com
playwright-cli snapshot
# read the snapshot to find story refs
playwright-cli click e5
playwright-cli snapshot
# extract content from the page
playwright-cli close
```
