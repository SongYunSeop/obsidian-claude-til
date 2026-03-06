# Save Skill Templates

## TIL Body Template

```markdown
# Title

> [!tldr] One-line summary

## Key Concepts
## Examples
## References
- [Title](URL)
## Related Notes
- [TIL](til/{category}/{slug}.md)
```

## Daily Note Template

Path: `./Daily/YYYY-MM-DD.md`

```markdown
# YYYY-MM-DD

## TIL
### {category}
- [Title](til/{category}/{slug}.md)
```

If the file already exists, find the `## TIL` section and add the link under the appropriate category heading.

## TIL MOC Template

Path: `./til/TIL MOC.md`

```markdown
# TIL MOC

## {Category}
- [Title](til/{category}/{slug}.md)
```

If the file already exists, find the category section and append the new item. Create the category section if it doesn't exist.
