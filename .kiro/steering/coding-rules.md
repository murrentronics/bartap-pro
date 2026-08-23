# Coding Rules — NEVER BREAK THESE

## File Editing
- NEVER use PowerShell (Set-Content, -replace, $content =, etc.) to edit source code files.
  PowerShell leaves garbled characters, broken line endings, and corrupted JSX.
- ALWAYS use the str_replace or fs_write tools to edit code files.
- PowerShell is ONLY allowed for read-only commands (Select-String, Get-Content for searching, dir, etc.)

## Tailwind / CSS
- Always use str_replace to add/change classNames — never pipe or redirect file content.
