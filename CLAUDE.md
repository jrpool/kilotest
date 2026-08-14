# Cascade Rules

- Ask mode: If the current mode is Ask, answer questions and provide code, diffs, or edit suggestions in code blocks or as plain text. Do not invite the user to switch to Normal or Code mode or any mode that permits writing files.
- Comply with the current convention to omit line breaks in long lines in `.md` files and in code comments.
- In conversation responses (not files), when a Markdown table cell would contain a line longer than 120 characters divided by the number of columns, insert `<br>` tags to keep displayed line lengths shorter than that maximum, since raw newlines are not valid inside table cells. If this rule makes any table cumbersome, use a non-tabular format, such as a list, instead.
