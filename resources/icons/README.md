# Decoy taskbar icons

These `.ico` files are what the **decoy icon** setting (Settings → General) uses to
disguise Tayori's taskbar entry — icon **and** window title — as an innocuous
Windows tool. It's the same privacy idea as the capture-invisible overlay: your
own tool, on your own machine, not standing out.

`tayori.ico` is the real icon, used when the setting is **Off**. Drop the decoys
here, using **exactly these names**:

| Setting option    | File name          | Title shown in the taskbar |
| ----------------- | ------------------ | -------------------------- |
| Windows Terminal  | `terminal.ico`     | `Windows Terminal`         |
| Settings          | `settings.ico`     | `Settings`                 |
| Task Manager      | `taskmanager.ico`  | `Task Manager`             |

Notes:

- A multi-size `.ico` (16–256 px) looks crisp at every taskbar scale.
- If a file is missing, the setting still changes the **title**; the icon just
  stays whatever it was. So the app never breaks for a not-yet-added file.
- These are bundled at build time via `extraResources` in `electron-builder.yml`
  and resolved at runtime from the app's `resources/icons` folder.
